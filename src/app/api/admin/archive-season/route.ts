import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { currentSeason } from '@/lib/season';
import { finalStandings } from '@/lib/seasonArchive';
import { isCompetitionCode } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

// Guarda una foto fija de la clasificación final de la temporada actual para esta pandilla.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const competition = isCompetitionCode(body?.competition) ? body.competition : 'PD';
  const season = currentSeason();

  let rows;
  try {
    rows = await finalStandings(competition, season, session.gid);
  } catch (e) {
    console.error('Error calculando la clasificación final', e);
    return NextResponse.json({ error: 'No se pudo calcular la clasificación final.' }, { status: 500 });
  }
  if (!rows.length) return NextResponse.json({ error: 'No hay jugadores que archivar.' }, { status: 400 });

  const { error } = await db()
    .from('season_archive')
    .upsert(rows, { onConflict: 'group_id,competition,season,player_id' });
  if (error) return NextResponse.json({ error: 'No se pudo archivar la temporada.' }, { status: 500 });
  return NextResponse.json({ ok: true, champion: rows[0]?.player_name });
}
