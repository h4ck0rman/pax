/** Driver and network errors sometimes quote the connection string they were
 *  using, credentials included. Server logs are not a safe place for that, so
 *  everything unexpected goes through here before it is logged. */
const SECRET_PATTERNS: RegExp[] = [
  // Any URI with credentials, mongodb+srv:// and friends included.
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]*:[^\s/@]*@\S+/gi,
  // A bare mongodb host string, which still names the cluster.
  /\bmongodb(?:\+srv)?:\/\/\S+/gi,
];

export function redact(text: string): string {
  return SECRET_PATTERNS.reduce(
    (safe, pattern) => safe.replace(pattern, '[redacted]'),
    text,
  );
}

/** A short, safe description of something that went wrong. */
export function describeError(cause: unknown): string {
  if (cause instanceof Error) return redact(`${cause.name}: ${cause.message}`);
  if (typeof cause === 'string') return redact(cause);
  return 'unknown error';
}
