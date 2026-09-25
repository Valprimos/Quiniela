import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { currentSeason } from '@/lib/season';
import { fetchAll } from '@/lib/paging';
import { MatchLite, teamHistory, teamRecord } from '@/lib/league';
import { isCompetitionCode } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

const COLS =
  'id,competition,matchday,stage,utc_date,status,home_name,away_name,home_crest,away_crest,home_score,away_score';

// Todos los resultados de un equipo esta temporada, para el panel que se abre al pinchar en él.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Falta el equipo.' }, { status: 400 });
  const competition = isCompetitionCode(req.nextUrl.searchParams.get('competition'))
    ? req.nextUrl.searchParams.get('competition')!
    : 'PD';

  const supabase = db();
  const matches = await fetchAll<MatchLite>((from, to) =>
    supabase
      .from('matches')
      .select(COLS)
      .eq('competition', competition)
      .eq('season', currentSeason())
      .or(`home_name.eq.${name},away_name.eq.${name}`)
      .range(from, to)
  );

  return NextResponse.json({ team: name, matches: teamHistory(matches, name), record: teamRecord(matches, name) });
}
