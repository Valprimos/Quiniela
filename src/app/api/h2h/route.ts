import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { currentSeason } from '@/lib/season';
import { fetchAll } from '@/lib/paging';
import { MatchLite, isFinished } from '@/lib/league';
import { isCompetitionCode } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

const COLS =
  'id,competition,matchday,stage,utc_date,status,home_name,away_name,home_crest,away_crest,home_score,away_score';

// Solo los enfrentamientos directos entre dos equipos (esta temporada). Con liga a una
// vuelta como la Champions puede que solo haya uno; con Primera, normalmente dos.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamA = req.nextUrl.searchParams.get('teamA');
  const teamB = req.nextUrl.searchParams.get('teamB');
  if (!teamA || !teamB) return NextResponse.json({ error: 'Faltan los dos equipos.' }, { status: 400 });
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
      .or(
        `and(home_name.eq.${teamA},away_name.eq.${teamB}),and(home_name.eq.${teamB},away_name.eq.${teamA})`
      )
      .range(from, to)
  );

  const rows = matches
    .sort((a, b) => new Date(a.utc_date).getTime() - new Date(b.utc_date).getTime())
    .map((m) => ({
      matchId: m.id,
      matchday: m.matchday,
      utcDate: m.utc_date,
      status: m.status,
      homeTeam: m.home_name,
      awayTeam: m.away_name,
      homeScore: m.home_score,
      awayScore: m.away_score,
    }));

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let goalsA = 0;
  let goalsB = 0;
  for (const m of matches.filter(isFinished)) {
    const aIsHome = m.home_name === teamA;
    const gA = aIsHome ? m.home_score : m.away_score;
    const gB = aIsHome ? m.away_score : m.home_score;
    goalsA += gA;
    goalsB += gB;
    if (gA > gB) winsA++;
    else if (gB > gA) winsB++;
    else draws++;
  }

  return NextResponse.json({ teamA, teamB, matches: rows, summary: { winsA, winsB, draws, goalsA, goalsB } });
}
