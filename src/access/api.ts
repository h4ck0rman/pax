/** Mirrors the POST /api/access-requests contract. The server answers the same
 *  way whether an address is new, already waiting, or already approved, so this
 *  never learns who is on the list. */
const GENERIC_ERROR = 'Could not send your request. Please try again.';

export async function requestAccess(email: string, name?: string): Promise<void> {
  const response = await fetch('/api/access-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, ...(name ? { name } : {}) }),
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error =
      typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : null;
    throw new Error(typeof error === 'string' && error ? error : GENERIC_ERROR);
  }
}
