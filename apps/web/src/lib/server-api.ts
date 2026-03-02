import { cookies } from 'next/headers';
import { apiRequest, type ApiResult, type FetchOptions } from './api';

export async function serverApiRequest<T>(path: string, options: FetchOptions<T> = {}): Promise<ApiResult<T>> {
  const cookieHeader = (await cookies()).toString();
  const headers = new Headers(options.init?.headers || {});
  if (cookieHeader) {
    headers.set('cookie', cookieHeader);
  }
  return apiRequest<T>(path, {
    ...options,
    init: {
      ...options.init,
      headers
    }
  });
}
