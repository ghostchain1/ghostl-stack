import type { NextRequest } from 'next/server';
import { proxy, config } from './proxy';

export { config };

export function middleware(req: NextRequest) {
  return proxy(req);
}
