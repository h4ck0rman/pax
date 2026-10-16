import type { AccessStore } from './store.js';

/** The transport-free request the public access endpoint works with, built by
 *  each environment's adapter the same way the auth routes are. */
export type AccessApiRequest = {
  method: string;
  body: unknown;
};

export type AccessApiResponse = {
  status: number;
  body?: unknown;
};

/** A deliberately permissive shape check: a real address, with sane bounds so a
 *  public endpoint cannot be used to store large blobs. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MAX_NAME = 100;

function field(body: unknown, key: string): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** POST /api/access-requests. Public: it is how someone not yet on the
 *  allowlist asks to be added. The response is intentionally the same whether
 *  the address is new, already waiting, or already approved, so it never
 *  reveals who is on the list. */
export async function handleAccessRequest(
  store: AccessStore,
  request: AccessApiRequest,
): Promise<AccessApiResponse> {
  if (request.method !== 'POST') {
    return { status: 405, body: { error: 'POST only' } };
  }

  const email = field(request.body, 'email');
  if (!email || email.length > MAX_EMAIL || !EMAIL_PATTERN.test(email)) {
    return { status: 400, body: { error: 'Enter a valid email address.' } };
  }

  const name = field(request.body, 'name').slice(0, MAX_NAME) || null;
  await store.createRequest({ email, name });

  return { status: 200, body: { ok: true } };
}
