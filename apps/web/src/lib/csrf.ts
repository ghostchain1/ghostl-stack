const CSRF_COOKIE = 'csrf_token';
type HeaderInit = Record<string, string> | Array<[string, string]> | Headers;

const readCookie = (name: string) => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export const withCsrf = (headers: HeaderInit = {}) => {
  const next = new Headers(headers);
  const token = readCookie(CSRF_COOKIE);
  if (token) next.set('x-csrf-token', token);
  return next;
};

export const jsonWithCsrf = (headers: HeaderInit = {}) => {
  const next = withCsrf(headers);
  if (!next.has('content-type')) {
    next.set('content-type', 'application/json');
  }
  return next;
};
