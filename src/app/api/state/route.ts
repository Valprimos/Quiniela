import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, clearSession } from '@/lib/session';
import { currentSeason } from '@/lib/season';
import { syncIfStale } from '@/lib/sync';
import { isLocked, liveResultOf, resultOf } from '@/lib/scoring';
import { MatchLite, buildLiga, isFinished } from '@/lib/league';
import { COMPETITIONS, isCompetitionCode, STAGE_LABEL } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

const PENDING = ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'LIVE'];
const COLS =
  'id,competition,matchday,stage,utc_date,status,home_name,away_name,home_crest,away_crest,home_score,away_score,admin_locked';

type PredRow = { player_id: string; match_id: number; pick: string };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const syncResult = await syncIfStale();

  const supabase = db();
  const season = currentSeason();
  const competition = isCompetitionCode(req.nextUrl.searchParams.get('competition'))
    ? req.nextUrl.searchParams.get('competition')!
    : 'PD';

  // Toda la temporada de esta competición en una sola consulta
  const { data: all } = await supabase
    .from('matches')
    .select(COLS)
    .eq('competition', competition)
    .eq('season', season)
    .limit(1000);
  const allMatches: MatchLite[] = all ?? [];
  // La clasificación de Liga real solo tiene sentido en la fase de liga (matchday < 100)
  const liga = buildLiga(allMatches.filter((m) => m.matchday < 100));
  const ligaBy = new Map(liga.map((r) => [r.team, r]));

  // Jornadas disponibles y jornada actual.
  // Un partido aplazado y reprogramado para otro día no debe retener su jornada original:
  // solo cuentan como "pendientes" los partidos que caen cerca de la fecha típica de su jornada.
  const DAY = 86400e3;
  const groups = new Map<number, { dates: number[]; pending: number[] }>();
  for (const m of allMatches) {
    const g = groups.get(m.matchday) ?? { dates: [], pending: [] };
    const t = new Date(m.utc_date).getTime();
    g.dates.push(t);
    if (PENDING.includes(m.status)) g.pending.push(t);
    groups.set(m.matchday, g);
  }
  const openCount = (g: { dates: number[]; pending: number[] }) => {
    const sorted = [...g.dates].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return g.pending.filter((t) => Math.abs(t - median) <= 5 * DAY).length;
  };
  const matchdays = [...groups.keys()].sort((a, b) => a - b);
  const current =
    matchdays.find((md) => openCount(groups.get(md)!) > 0) ?? matchdays[matchdays.length - 1] ?? 1;
  const asked = Number(req.nextUrl.searchParams.get('matchday'));
  const matchday = matchdays.includes(asked) ? asked : current;

  const matchRows = allMatches
    .filter((m) => m.matchday === matchday)
    .sort((a, b) => new Date(a.utc_date).getTime() - new Date(b.utc_date).getTime() || a.id - b.id);
  const stageLabel = matchRows[0]?.stage ? STAGE_LABEL[matchRows[0].stage] ?? null : null;

  const [{ data: players }, { data: points }] = await Promise.all([
    supabase.from('players').select('id,name,is_admin').eq('group_id', session.gid),
    supabase
      .from('player_points')
      .select('player_id,matchday,points')
      .eq('competition', competition)
      .eq('season', season),
  ]);
  const playerRows: { id: string; name: string }[] = players ?? [];
  const playerIds = new Set(playerRows.map((p) => p.id));
  if (!playerIds.has(session.pid)) {
    // Un admin te ha expulsado de la pandilla: se cierra la sesión en vez de dejarla a medias.
    await clearSession();
    return NextResponse.json({ error: 'Ya no formas parte de esta pandilla.' }, { status: 401 });
  }

  const ids = matchRows.map((m) => m.id);
  let preds: PredRow[] = [];
  if (ids.length) {
    const { data } = await supabase.from('predictions').select('player_id,match_id,pick').in('match_id', ids);
    preds = (data ?? []).filter((p) => playerIds.has(p.player_id));
  }

  const nameById = new Map(playerRows.map((p) => [p.id, p.name]));
  const now = Date.now();

  const teamInfo = (name: string, crest: string | null) => {
    const r = ligaBy.get(name);
    return {
      name,
      crest,
      pos: r && r.total.pj > 0 ? r.pos : null,
      form: r ? r.form : [],
    };
  };

  const matches = matchRows.map((m) => {
    const started = new Date(m.utc_date).getTime() <= now;
    const forMatch = preds.filter((p) => p.match_id === m.id);
    const live = liveResultOf(m.status, m.home_score, m.away_score);
    return {
      id: m.id,
      utcDate: m.utc_date,
      status: m.status,
      home: teamInfo(m.home_name, m.home_crest),
      away: teamInfo(m.away_name, m.away_crest),
      homeScore: m.home_score,
      awayScore: m.away_score,
      result: resultOf(m.status, m.home_score, m.away_score),
      liveResult: live,
      provisional: live != null && m.status !== 'FINISHED',
      started,
      locked: isLocked(m.status, m.utc_date, m.admin_locked),
      myPick: forMatch.find((p) => p.player_id === session.pid)?.pick ?? null,
      // Los pronósticos de los demás solo se ven cuando el partido ha empezado
      picks: started
        ? forMatch.map((p) => ({ name: nameById.get(p.player_id) ?? '?', pick: p.pick }))
        : [],
    };
  });

  // Puntos provisionales de la jornada actual, con los partidos en juego contando como si
  // ya hubieran terminado (para que la clasificación de la jornada se pueda seguir en directo)
  const jornadaHasLive = matches.some((m) => m.provisional);
  const provisionalPts = new Map<string, number>();
  if (jornadaHasLive) {
    for (const m of matches) {
      if (!m.liveResult) continue;
      for (const c of preds.filter((p) => p.match_id === m.id)) {
        if (c.pick === m.liveResult) provisionalPts.set(c.player_id, (provisionalPts.get(c.player_id) ?? 0) + 1);
      }
    }
  }

  // Clasificaciones
  const total = new Map<string, number>();
  const before = new Map<string, number>(); // puntos hasta la jornada anterior a la actual
  const jornada = new Map<string, number>();
  for (const r of points ?? []) {
    if (!playerIds.has(r.player_id)) continue;
    total.set(r.player_id, (total.get(r.player_id) ?? 0) + r.points);
    if (r.matchday < current) before.set(r.player_id, (before.get(r.player_id) ?? 0) + r.points);
    if (r.matchday === matchday) jornada.set(r.player_id, r.points);
  }
  const positions = (scores: Map<string, number>) => {
    const out = new Map<string, number>();
    for (const p of playerRows) {
      const s = scores.get(p.id) ?? 0;
      out.set(p.id, 1 + playerRows.filter((q) => (scores.get(q.id) ?? 0) > s).length);
    }
    return out;
  };
  const nowPos = positions(total);
  const prevPos = positions(before);
  const currentStarted = allMatches.some((m) => m.matchday === current && isFinished(m));

  const rank = (scores: Map<string, number>, withDelta: boolean) =>
    playerRows
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        points: scores.get(p.id) ?? 0,
        // subida (+) o bajada (-) de puestos respecto a antes de la jornada actual
        delta: withDelta && currentStarted ? (prevPos.get(p.id) ?? 0) - (nowPos.get(p.id) ?? 0) : 0,
      }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'es'));

  // Clasificación combinada: suma de puntos de las tres competiciones (temporada actual)
  const { data: allPoints } = await supabase
    .from('player_points')
    .select('player_id,points')
    .eq('season', season)
    .in(
      'competition',
      COMPETITIONS.map((c) => c.code)
    );
  const combined = new Map<string, number>();
  for (const r of allPoints ?? []) {
    if (!playerIds.has(r.player_id)) continue;
    combined.set(r.player_id, (combined.get(r.player_id) ?? 0) + r.points);
  }
  const rankingCombinada = playerRows
    .map((p) => ({ playerId: p.id, name: p.name, points: combined.get(p.id) ?? 0, delta: 0 }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'es'));

  return NextResponse.json({
    me: { id: session.pid, name: session.name, admin: session.admin },
    season,
    competition,
    competitions: COMPETITIONS.map((c) => ({ code: c.code, name: c.name, short: c.short })),
    matchday,
    stageLabel,
    currentMatchday: current,
    matchdays,
    matches,
    finished: matches.filter((m) => m.result).length,
    finishedTotal: allMatches.filter(isFinished).length,
    jornadaComplete: matches.length > 0 && matches.every((m) => m.result),
    jornadaLive: jornadaHasLive,
    rankingJornada: rank(jornada, false).map((r) => ({ ...r, provisional: provisionalPts.get(r.playerId) ?? 0 })),
    rankingGeneral: rank(total, true),
    rankingCombinada,
    syncNotice: syncResult.find((s) => s.error)?.error
      ? syncResult.filter((s) => s.error).map((s) => `${s.competition}: ${s.error}`)
      : null,
  });
}
