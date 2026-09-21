import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { GoogleClient } from './config.js';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');
/** Google issues tokens under both spellings. */
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Cached across invocations so every sign-in does not refetch Google's keys. */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function keys() {
  jwks ??= createRemoteJWKSet(JWKS_URL);
  return jwks;
}

export type GoogleProfile = { subject: string; email: string; name: string };

const base64url = (input: Buffer) => input.toString('base64url');

export function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export const randomToken = () => base64url(randomBytes(32));

export function buildAuthorizationUrl(
  client: GoogleClient,
  options: { redirectUri: string; state: string; nonce: string; codeChallenge: string },
): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', client.clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', options.state);
  url.searchParams.set('nonce', options.nonce);
  url.searchParams.set('code_challenge', options.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // Always show the chooser rather than silently reusing one Google account.
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export class GoogleAuthError extends Error {}

/** Trades the authorization code for an ID token, then verifies that token
 *  against Google's published keys. The code alone is never trusted. */
export async function exchangeCodeForProfile(
  client: GoogleClient,
  options: { code: string; redirectUri: string; codeVerifier: string; nonce: string },
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleProfile> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code: options.code,
      code_verifier: options.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: options.redirectUri,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new GoogleAuthError('Google rejected the sign-in code');

  const body: unknown = await response.json().catch(() => null);
  const idToken =
    typeof body === 'object' && body !== null ? (body as { id_token?: unknown }).id_token : null;
  if (typeof idToken !== 'string' || !idToken) {
    throw new GoogleAuthError('Google did not return an identity token');
  }

  const { payload } = await jwtVerify(idToken, keys(), {
    issuer: ISSUERS,
    audience: client.clientId,
    algorithms: ['RS256', 'ES256'],
  }).catch(() => {
    throw new GoogleAuthError('Google identity token failed verification');
  });

  if (payload.nonce !== options.nonce) throw new GoogleAuthError('Sign-in nonce did not match');
  if (payload.email_verified !== true) throw new GoogleAuthError('Google address is not verified');

  const { sub, email, name } = payload;
  if (typeof sub !== 'string' || !sub) throw new GoogleAuthError('Google token has no subject');
  if (typeof email !== 'string' || !email) throw new GoogleAuthError('Google token has no address');

  return {
    subject: sub,
    email: email.toLowerCase(),
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : email,
  };
}
