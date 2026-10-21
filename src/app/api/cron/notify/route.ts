import { NextRequest, NextResponse } from 'next/server';
import { runReminders } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Lo llama el workflow de GitHub Actions cada 10 minutos (igual que /api/cron/sync).
// ?dry=1 solo dice qué se enviaría, sin mandar nada.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  return NextResponse.json(await runReminders(req.nextUrl.searchParams.get('dry') === '1'));
}
