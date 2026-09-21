import { createHash, timingSafeEqual } from 'node:crypto';

export function passwordAuthorized(authorization: string, password: string | undefined, username = 'pax') {
  if (!password || password.length < 16 || username.includes(':')) return false;
  if (authorization.length > 4096 || !/^Basic [A-Za-z0-9+/]+=*$/i.test(authorization)) return false;
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(Buffer.from(authorization.slice(6), 'base64').toString('utf8')), hash(`${username}:${password}`));
}
