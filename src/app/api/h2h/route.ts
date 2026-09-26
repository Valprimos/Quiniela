import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { fetchAll } from '@/lib/paging';
import { MatchLite, isFinished } from '@/lib/league';
import { STAGE_LABEL } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

const COLS =
  'id,competition,matchday,stage,utc_date,status,home_name,away_name,home_crest,away_crest,home_score,away_score';

// Todos los enfrentamientos guardados entre dos equipos, en cualquier competición y
// temporada que tengamos guardada (no solo la actual). Como la app no importa historial
// de antes de empezar a usarse, esto crece solo con el tiempo.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamA = req.nextUrl.searchParams.get('teamA');
  const teamB = req.nextUrl.searchParams.get('teamB');
  if (!teamA || !teamB) return NextResponse.json({ error: 'Faltan los equipos.' }, { status: 400 });

  const supabase = db();
  // Se piden todos los partidos de teamA (cualquier rival, cualquier temporada) y se filtra
  // en el propio servidor por si el rival era teamB, para no depender de sintaxis compleja
  // de filtros en la consulta.
  const matches = await fetchAll<MatchLite>((from, to) =>
    supabase.from('matches').select(COLS).or(`home_name.eq.${teamA},away_name.eq.${teamA}`).range(from, to)
  );
  const between = matches
    .filter((m) => (m.home_name === teamA && m.away_name === teamB) || (m.home_name === teamB && m.away_name === teamA))
    .sort((a, b) => new Date(b.utc_date).getTime() - new Date(a.utc_date).getTime());

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let goalsA = 0;
  let goalsB = 0;

  const rows = between.map((m) => {
    const aIsHome = m.home_name === teamA;
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
