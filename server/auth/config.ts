/** Authentication configuration, read from the environment and validated once.
 *  Every field is required, so a half-configured deployment refuses to sign
 *  anyone in rather than falling back to something weaker. */
export type AuthConfig = {
  /** Null when no Google client is configured. The OAuth routes then refuse to
   *  run, while session checks on existing sessions keep working. */
  google: GoogleClient | null;
  sessionSecret: Uint8Array;
  /** Lower-cased addresses allowed to sign in. Empty when a domain is used. */
  allowedEmails: ReadonlySet<string>;
  /** Lower-cased domain allowed to sign in, without the at sign. */
  allowedDomain: string | null;
  mongoUri: string;
  mongoDatabase: string;
  /** Absolute origin this deployment is reached on, without a trailing slash.
   *  Required whenever Google is configured, so neither the OAuth redirect URI
   *  nor the cookie transport is ever derived from a request header. */
  publicOrigin: string | null;
};

export type GoogleClient = { clientId: string; clientSecret: string };

export class AuthConfigError extends Error {}

const MIN_SECRET_LENGTH = 32;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = (env[name] ?? '').trim();
  if (!value) throw new AuthConfigError(`${name} is not set`);
  return value;
}

export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const sessionSecret = required(env, 'SESSION_SECRET');
  if (sessionSecret.length < MIN_SECRET_LENGTH) {
    throw new AuthConfigError(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  const allowedEmails = new Set(
    (env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map(entry => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  const allowedDomain = (env.ALLOWED_DOMAIN ?? '').trim().toLowerCase().replace(/^@/, '') || null;

  // Without either list every Google account on earth could sign in, so this is
  // treated as misconfiguration rather than as "allow all".
  if (!allowedEmails.size && !allowedDomain) {
    throw new AuthConfigError('Set ALLOWED_EMAILS or ALLOWED_DOMAIN to decide who may sign in');
  }

  const clientId = (env.GOOGLE_CLIENT_ID ?? '').trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET ?? '').trim();
  const google = clientId && clientSecret ? { clientId, clientSecret } : null;

  const publicOrigin = readPublicOrigin(env);
  // The redirect URI and the cookie's Secure attribute both come from this, so
  // signing in without it would mean trusting the request's Host header.
  if (google && !publicOrigin) {
    throw new AuthConfigError('PUBLIC_ORIGIN is required when Google sign-in is configured');
  }

  return {
    google,
    sessionSecret: new TextEncoder().encode(sessionSecret),
    allowedEmails,
    allowedDomain,
    mongoUri: required(env, 'MONGODB_URI'),
    mongoDatabase: (env.MONGODB_DATABASE ?? 'pax').trim() || 'pax',
    publicOrigin,
  };
}

function readPublicOrigin(env: NodeJS.ProcessEnv): string | null {
  const raw = (env.PUBLIC_ORIGIN ?? '').trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AuthConfigError('PUBLIC_ORIGIN must be an absolute URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AuthConfigError('PUBLIC_ORIGIN must be an http or https URL');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new AuthConfigError('PUBLIC_ORIGIN must be an origin, with no path');
  }
  return parsed.origin;
}

/** Whether cookies this deployment issues must carry Secure. Null when there is
 *  nothing trustworthy to decide from, which only happens on plain local HTTP. */
export function secureCookiesFor(config: AuthConfig): boolean | null {
  if (!config.publicOrigin) return null;
  return config.publicOrigin.startsWith('https://');
}

/** A host is local when its name is loopback, whatever port it carries. */
export function isLoopbackHost(host: string): boolean {
  const name = host.replace(/^\[/, '').split(/[\]:]/)[0].toLowerCase();
  return name === 'localhost' || name === '127.0.0.1' || name === '::1' || name === '';
}

/** Whether a verified Google address is permitted to sign in. */
export function emailAllowed(config: AuthConfig, email: string): boolean {
  const normalised = email.trim().toLowerCase();
  if (!normalised.includes('@')) return false;
  if (config.allowedEmails.has(normalised)) return true;
  if (!config.allowedDomain) return false;
  return normalised.endsWith(`@${config.allowedDomain}`);
}
