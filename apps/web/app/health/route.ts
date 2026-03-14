import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'apps-web',
    timestamp: new Date().toISOString()
  });
}
