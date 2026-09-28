import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { fetchAll } from '@/lib/paging';
import { MatchLite, isFinished, normalizeTeamName } from '@/lib/league';
import { STAGE_LABEL } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

const COLS =
  'id,competition,season,matchday,stage,utc_date,status,home_name,away_name,home_crest,away_crest,home_score,away_score';

// Todos los enfrentamientos guardados entre dos equipos, en cualquier competición y temporada
// (la actual y las traídas con el backfill). Se compara con nombres normalizados porque
// football-data.org y api-football.com pueden escribir un mismo equipo de forma distinta.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamA = req.nextUrl.searchParams.get('teamA');
  const teamB = req.nextUrl.searchParams.get('teamB');
  if (!teamA || !teamB) return NextResponse.json({ error: 'Faltan los equipos.' }, { status: 400 });

  const supabase = db();
  const all = await fetchAll<MatchLite>((from, to) =>
    supabase.from('matches').select(COLS).order('id').range(from, to)
  );

  const a = normalizeTeamName(teamA);
  const b = normalizeTeamName(teamB);
  const between = all
    .filter((m) => {
      const h = normalizeTeamName(m.home_name);
      const w = normalizeTeamName(m.away_name);
      return (h === a && w === b) || (h === b && w === a);
    })
    .sort((x, y) => new Date(y.utc_date).getTime() - new Date(x.utc_date).getTime());

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let goalsA = 0;
  let goalsB = 0;

  const rows = between.map((m) => {
    const aIsHome = normalizeTeamName(m.home_name) === a;
    const scoreA = aIsHome ? m.home_score : m.away_score;
    const scoreB = aIsHome ? m.away_score : m.home_score;
    if (isFinished(m) && scoreA != null && scoreB != null) {
      goalsA += scoreA;
      goalsB += scoreB;
      if (scoreA > scoreB) winsA++;
      else if (scoreB > scoreA) winsB++;
      else draws++;
    }
    return {
      matchId: m.id,
      utcDate: m.utc_date,
      season: m.season ?? null,
      aIsHome,
      scoreA: scoreA ?? null,
      scoreB: scoreB ?? null,
      competition: m.competition,
      stageLabel: m.stage ? STAGE_LABEL[m.stage] ?? null : null,
      homeTeam: m.home_name,
      awayTeam: m.away_name,
      homeCrest: m.home_crest,
      awayCrest: m.away_crest,
      homeScore: m.home_score,
      awayScore: m.away_score,
      status: m.status,
    };
  });

  return NextResponse.json({
    teamA,
    teamB,
    summary: { winsA, winsB, draws, goalsA, goalsB, played: winsA + winsB + draws },
    matches: rows,
  });
}
