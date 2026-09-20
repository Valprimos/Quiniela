import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { isLocked } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sesión caducada. Vuelve a entrar.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const matchId = Number(body?.matchId);
  const pick = body?.pick;
  if (!Number.isInteger(matchId) || !['1', 'X', '2'].includes(pick)) {
    return NextResponse.json({ error: 'Pronóstico no válido.' }, { status: 400 });
  }

  const { data: match } = await db()
    .from('matches')
    .select('id,status,utc_date')
    .eq('id', matchId)
    .maybeSingle();
  if (!match) return NextResponse.json({ error: 'Partido no encontrado.' }, { status: 404 });
  if (isLocked(match.status, match.utc_date)) {
    return NextResponse.json({ error: 'Este partido ya está cerrado.' }, { status: 409 });
  }

  const { error } = await db()
    .from('predictions')
    .upsert(
      { player_id: session.pid, match_id: matchId, pick, updated_at: new Date().toISOString() },
      { onConflict: 'player_id,match_id' }
    );
  if (error) return NextResponse.json({ error: 'No se pudo guardar el pronóstico.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
