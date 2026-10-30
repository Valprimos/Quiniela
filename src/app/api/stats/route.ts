import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { currentSeason } from '@/lib/season';
import { fetchAll } from '@/lib/paging';
import { MatchLite, buildLiga, isFinished } from '@/lib/league';
import { computeStats } from '@/lib/stats';
import { computeLuck, Xg } from '@/lib/luck';
import { COMPETITIONS, isCompetitionCode } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

const COLS =
  'id,competition,matchday,stage,utc_date,status,home_name,away_name,home_crest,away_crest,home_score,away_score,is_pleno';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  // competition=ALL junta todas las competiciones (La Liga + Champions) para las estadísticas combinadas
  const asked = req.nextUrl.searchParams.get('competition');
  const combined = asked === 'ALL';
  const competition = isCompetitionCode(asked) ? asked : 'PD';
  const codes: string[] = combined ? COMPETITIONS.map((c) => c.code) : [competition];

  const supabase = db();
  const matches = await fetchAll<MatchLite>((from, to) =>
    supabase
      .from('matches')
      .select(COLS)
      .in('competition', codes)
      .eq('season', currentSeason())
      .order('id')
      .range(from, to)
  );
  // La foto de perfil es opcional: si aún no se ha ejecutado la migración, se piden los jugadores sin ella
  let withAvatar = await supabase.from('players').select('id,name,avatar_updated_at').eq('group_id', session.gid);
  if (withAvatar.error) withAvatar = (await supabase.from('players').select('id,name').eq('group_id', session.gid)) as typeof withAvatar;
  const playerRows = (withAvatar.data ?? []).map((p: { id: string; name: string; avatar_updated_at?: string | null }) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar_updated_at ? new Date(p.avatar_updated_at).getTime() : null,
  }));
  const playerIds = new Set(playerRows.map((p) => p.id));

  // Solo pronósticos de partidos terminados: nunca se filtra nada de partidos abiertos
  const finishedIds = matches.filter(isFinished).map((m) => m.id);
  type PredRow = { player_id: string; match_id: number; pick: string; pleno_home: number | null; pleno_away: number | null };
  const preds: PredRow[] = [];
  for (let i = 0; i < finishedIds.length; i += 150) {
    const chunk = finishedIds.slice(i, i + 150);
    preds.push(
      ...(await fetchAll<PredRow>((from, to) =>
        supabase
          .from('predictions')
          .select('player_id,match_id,pick,pleno_home,pleno_away')
          .in('match_id', chunk)
          .order('match_id')
          .order('player_id')
          .range(from, to)
      ))
    );
  }
  const groupPreds = preds.filter((p) => playerIds.has(p.player_id));

  // xG de los partidos (índice de suerte). Es opcional: si aún no se ha ejecutado la migración 8,
  // la consulta falla y simplemente no hay índice.
  const xg = new Map<number, Xg>();
  try {
    const rows = await fetchAll<{ id: number; home_xg: number | null; away_xg: number | null }>(async (from, to) => {
      const res = await supabase
        .from('matches')
        .select('id,home_xg,away_xg')
        .in('competition', codes)
        .eq('season', currentSeason())
        .not('home_xg', 'is', null)
        .not('away_xg', 'is', null)
        .order('id')
        .range(from, to);
      if (res.error) throw res.error;
      return res as { data: { id: number; home_xg: number | null; away_xg: number | null }[] | null };
    });
    for (const r of rows) if (r.home_xg != null && r.away_xg != null) xg.set(r.id, { h: Number(r.home_xg), a: Number(r.away_xg) });
  } catch {
    /* sin migración: sin xG */
  }

  return NextResponse.json({
    ...computeStats({
      matches,
      preds: groupPreds,
      players: playerRows,
      // La clasificación real solo tiene sentido dentro de una competición
      liga: combined ? [] : buildLiga(matches.filter((m) => m.matchday < 100)),
    }),
    luck: computeLuck({ matches, xg, preds: groupPreds, players: playerRows }),
  });
}
