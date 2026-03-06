/**
 * CSRF token helpers — reads the `csrf_token` cookie and injects
 * the `x-csrf-token` header required by apps/api state-change endpoints.
 *
 * Browser-safe: guards on `typeof document` so this can be imported in
 * SSR / Node contexts without throwing.
 */

const CSRF_COOKIE = 'csrf_token';
type HeaderInit = Record<string, string> | Array<[string, string]> | Headers;

const readCsrfCookie = (): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
};

/** Returns a Headers object with `x-csrf-token` set (when available). */
export const withCsrf = (headers: HeaderInit = {}): Headers => {
  const next = new Headers(headers);
  const token = readCsrfCookie();
  if (token) next.set('x-csrf-token', token);
  return next;
};

/** Returns a Headers object with `x-csrf-token` and `content-type: application/json`. */
export const jsonWithCsrf = (headers: HeaderInit = {}): Headers => {
  const next = withCsrf(headers);
  if (!next.has('content-type')) {
    next.set('content-type', 'application/json');
  }
  return next;
};
