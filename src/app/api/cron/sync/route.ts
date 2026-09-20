import { NextRequest, NextResponse } from 'next/server';
import { syncIfStale } from '@/lib/sync';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get('force') === '1';
  return NextResponse.json(await syncIfStale(force));
}
