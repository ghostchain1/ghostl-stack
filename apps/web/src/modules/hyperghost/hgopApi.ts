import { apiRequest, type ApiResult, type FetchOptions } from '../../lib/api';
import { getHgopApprovalToken } from './token';

export async function hgopRequest<T = unknown>(path: string, options: FetchOptions<T> = {}): Promise<ApiResult<T>> {
  const token = getHgopApprovalToken();
  const init = options.init || {};
  const headers = new Headers(init.headers || {});
  if (token) headers.set('x-hgop-approval-token', token);
  return apiRequest<T>(`/api/hyperghost${path}`, { ...options, baseUrl: '', init: { ...init, headers } });
}

