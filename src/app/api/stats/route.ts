import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { currentSeason } from '@/lib/season';
import { fetchAll } from '@/lib/paging';
import { MatchLite, buildLiga, isFinished } from '@/lib/league';
import { computeStats } from '@/lib/stats';

export const dynamic = 'force-dynamic';

const COLS =
  'id,matchday,utc_date,status,home_name,away_name,home_crest,away_crest,home_score,away_score';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const supabase = db();
  const matches = await fetchAll<MatchLite>((from, to) =>
    supabase.from('matches').select(COLS).eq('season', currentSeason()).order('id').range(from, to)
  );
  const { data: players } = await supabase.from('players').select('id,name');

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

  return NextResponse.json(
    computeStats({ matches, preds, players: players ?? [], liga: buildLiga(matches) })
  );
}
