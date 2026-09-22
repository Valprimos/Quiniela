import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// Corrige a mano el marcador o el estado de un partido. Queda marcado como "manual_override"
// para que la próxima sincronización con football-data.org no lo vuelva a pisar.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const matchId = Number(body?.matchId);
  const homeScore = body?.homeScore === null ? null : Number(body?.homeScore);
  const awayScore = body?.awayScore === null ? null : Number(body?.awayScore);
  const status = String(body?.status ?? 'FINISHED');
  const clearOverride = Boolean(body?.clearOverride);
  if (!Number.isInteger(matchId)) return NextResponse.json({ error: 'Partido no válido.' }, { status: 400 });

  const { error } = await db()
    .from('matches')
    .update(
      clearOverride
        ? { manual_override: false }
        : { home_score: homeScore, away_score: awayScore, status, manual_override: true }
    )
    .eq('id', matchId);
  if (error) return NextResponse.json({ error: 'No se pudo corregir el partido.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
