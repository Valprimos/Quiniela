import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { currentSeason } from '@/lib/season';
import { isCompetitionCode } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

// Bloquea o desbloquea a mano todos los partidos de una jornada (por si hace falta
// cerrar los pronósticos antes de tiempo, o reabrir algo por error).
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const matchday = Number(body?.matchday);
  const locked = Boolean(body?.locked);
  const competition = isCompetitionCode(body?.competition) ? body.competition : 'PD';
  if (!Number.isInteger(matchday)) return NextResponse.json({ error: 'Jornada no válida.' }, { status: 400 });

  const { error } = await db()
    .from('matches')
    .update({ admin_locked: locked })
    .eq('competition', competition)
    .eq('season', currentSeason())
    .eq('matchday', matchday);
  if (error) return NextResponse.json({ error: 'No se pudo actualizar la jornada.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
