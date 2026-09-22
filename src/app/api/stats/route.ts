import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { currentSeason } from '@/lib/season';
import { fetchAll } from '@/lib/paging';
import { MatchLite, buildLiga, isFinished } from '@/lib/league';
import { computeStats } from '@/lib/stats';
import { isCompetitionCode } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

const COLS =
  'id,competition,matchday,stage,utc_date,status,home_name,away_name,home_crest,away_crest,home_score,away_score';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

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
      .order('id')
      .range(from, to)
  );
  const { data: players } = await supabase.from('players').select('id,name').eq('group_id', session.gid);
  const playerRows = players ?? [];
  const playerIds = new Set(playerRows.map((p) => p.id));

  // Solo pronósticos de partidos terminados: nunca se filtra nada de partidos abiertos
  const finishedIds = matches.filter(isFinished).map((m) => m.id);
  const preds: { player_id: string; match_id: number; pick: string }[] = [];
  for (let i = 0; i < finishedIds.length; i += 150) {
    const chunk = finishedIds.slice(i, i + 150);
    preds.push(
      ...(await fetchAll<{ player_id: string; match_id: number; pick: string }>((from, to) =>
        supabase
          .from('predictions')
          .select('player_id,match_id,pick')
          .in('match_id', chunk)
          .order('match_id')
          .order('player_id')
          .range(from, to)
      ))
    );
  }
  const groupPreds = preds.filter((p) => playerIds.has(p.player_id));

  return NextResponse.json(
    computeStats({
      matches,
      preds: groupPreds,
      players: playerRows,
      liga: buildLiga(matches.filter((m) => m.matchday < 100)),
    })
  );
}
