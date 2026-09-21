import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'pax_session';
export const OAUTH_COOKIE = 'pax_oauth';

const ALGORITHM = 'HS256';
const ISSUER = 'pax';
const SESSION_AUDIENCE = 'pax:session';
const OAUTH_AUDIENCE = 'pax:oauth';

/** A signed-in session. Only identifiers travel in the token, never an email or
 *  a name, so a leaked token discloses nothing about the person. */
export type SessionClaims = { userId: string; sessionId: string; expiresAt: number };

/** The in-flight sign-in attempt, held in a short-lived cookie instead of
 *  server state, so any instance can complete the callback. */
export type OAuthClaims = { state: string; nonce: string; codeVerifier: string };

export async function signSessionToken(
  secret: Uint8Array,
  claims: Omit<SessionClaims, 'expiresAt'>,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
}

/** Verifies the signature, issuer, audience and expiry. Says nothing about
 *  whether the session is still valid on the server; check the store for that. */
export async function verifySessionToken(
  secret: Uint8Array,
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: SESSION_AUDIENCE,
    });
    const sessionId = payload.sid;
    if (typeof payload.sub !== 'string' || typeof sessionId !== 'string') return null;
    if (typeof payload.exp !== 'number') return null;
    return { userId: payload.sub, sessionId, expiresAt: payload.exp * 1000 };
  } catch {
    return null;
  }
}

export async function signOAuthToken(
  secret: Uint8Array,
  claims: OAuthClaims,
  lifetimeSeconds = 600,
): Promise<string> {
  return new SignJWT({ st: claims.state, no: claims.nonce, cv: claims.codeVerifier })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(OAUTH_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + lifetimeSeconds)
    .sign(secret);
}

export async function verifyOAuthToken(
  secret: Uint8Array,
  token: string,
): Promise<OAuthClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: OAUTH_AUDIENCE,
    });
    const { st, no, cv } = payload;
    if (typeof st !== 'string' || typeof no !== 'string' || typeof cv !== 'string') return null;
    return { state: st, nonce: no, codeVerifier: cv };
  } catch {
    return null;
  }
}

/** Reads one cookie from a Cookie header without trusting its shape. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}

type CookieOptions = { maxAgeSeconds: number; secure: boolean };

/** SameSite is Lax, not Strict: the Google callback is a cross-site top level
 *  navigation, and Strict would withhold the in-flight cookie on arrival. Lax
 *  still withholds cookies from cross-site POST requests. */
export function serialiseCookie(
  name: string,
  value: string,
  { maxAgeSeconds, secure }: CookieOptions,
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie(name: string, secure: boolean): string {
  return serialiseCookie(name, '', { maxAgeSeconds: 0, secure });
}
