import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { currentSeason } from '@/lib/season';
import { fetchAll } from '@/lib/paging';
import { MatchLite, normalizeTeamName, teamHistory, teamRecord } from '@/lib/league';
import { isCompetitionCode } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

const COLS =
  'id,competition,season,matchday,stage,utc_date,status,home_name,away_name,home_crest,away_crest,home_score,away_score';

// Historial de un equipo esta temporada, para el panel que se abre al pinchar en él.
// Las temporadas anteriores solo se muestran en el "Cara a cara" entre dos equipos, no aquí.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Falta el equipo.' }, { status: 400 });
  const competition = isCompetitionCode(req.nextUrl.searchParams.get('competition'))
    ? req.nextUrl.searchParams.get('competition')!
    : 'PD';

  const supabase = db();
  const all = await fetchAll<MatchLite>((from, to) =>
    supabase
      .from('matches')
      .select(COLS)
      .eq('competition', competition)
      .eq('season', currentSeason())
      .range(from, to)
  );
  // Se compara por nombre normalizado por si esta temporada trae el nombre escrito distinto
  // a como se guardó en el backfill (no debería pasar dentro de la misma temporada, pero es
  // la misma comparación robusta que usa el resto de la app).
  const key = normalizeTeamName(name);
  const mine = all.filter((m) => normalizeTeamName(m.home_name) === key || normalizeTeamName(m.away_name) === key);

  return NextResponse.json({
    team: name,
    matches: teamHistory(mine, name),
    record: teamRecord(mine, name),
  });
}
