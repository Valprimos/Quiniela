import { LigaRow, MatchLite, isFinished } from './league';
import { Pick, resultOf } from './scoring';

export type Rec = { h: number; n: number }; // aciertos / pronósticos
type Cell = { total: Rec; home: Rec; away: Rec };

export type TeamAcc = {
  team: string;
  crest: string | null;
  pj: number; // partidos terminados
  won: number; // partidos que ha ganado
  pickedWin: number; // pronósticos que le daban la victoria
  pickedN: number; // pronósticos totales en sus partidos
  acc: Record<string, Cell>; // '*' = todo el grupo; el resto, por id de jugador
};

export type PlayerStat = {
  playerId: string;
  name: string;
  hits: number;
  played: number;
  missed: number;
  pct: number | null;
  byPick: Record<Pick, Rec>;
  streak: number;
  bestStreak: number;
  wins: number;
  plenos: number;
  best: { matchday: number; points: number } | null;
  worst: { matchday: number; points: number } | null;
  avg: number | null;
  // Cuántas veces se fue en contra de lo que votaba la mayoría del grupo, y cuántas acertó al hacerlo
  brave: Rec;
  // El equipo con peor % de acierto de este jugador (mínimo 3 pronósticos sobre él)
  jinx: { team: string; pct: number } | null;
  style: { label: string; detail: string } | null;
};

export type MatchInsight = {
  matchId: number;
  matchday: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  hits: number;
  n: number;
};

export type StatsDTO = {
  finished: number;
  liga: LigaRow[];
  teams: TeamAcc[];
  players: PlayerStat[];
  group: {
    results: Record<Pick, number>;
    picks: Record<Pick, number>;
    hitByResult: Record<Pick, Rec>;
    hardest: MatchInsight[];
    easiest: MatchInsight[];
  };
  evolution: {
    matchdays: number[];
    series: { playerId: string; name: string; values: number[] }[];
  };
};

type Agg = {
  hits: number;
  played: number;
  missed: number;
  byPick: Record<Pick, Rec>;
  cur: number;
  best: number;
  md: Map<number, number>; // aciertos por jornada
  pickedMds: Set<number>; // jornadas en las que pronosticó algo
  brave: Rec;
};

const rec = (): Rec => ({ h: 0, n: 0 });
const bump = (r: Rec, hit: boolean) => {
  r.n++;
  if (hit) r.h++;
};

export function computeStats(input: {
  matches: MatchLite[];
  preds: { player_id: string; match_id: number; pick: string }[];
  players: { id: string; name: string }[];
  liga: LigaRow[];
}): StatsDTO {
  const { matches, preds, players, liga } = input;
  const finished = matches
    .filter(isFinished)
    .sort((a, b) => new Date(a.utc_date).getTime() - new Date(b.utc_date).getTime() || a.id - b.id);

  const predByMatch = new Map<number, Map<string, Pick>>();
  for (const p of preds) {
    let mm = predByMatch.get(p.match_id);
    if (!mm) predByMatch.set(p.match_id, (mm = new Map()));
    mm.set(p.player_id, p.pick as Pick);
  }

  const teams = new Map<string, TeamAcc>();
  const team = (name: string, crest: string | null): TeamAcc => {
    let t = teams.get(name);
    if (!t) teams.set(name, (t = { team: name, crest, pj: 0, won: 0, pickedWin: 0, pickedN: 0, acc: {} }));
    return t;
  };
  const cellOf = (t: TeamAcc, who: string): Cell =>
    (t.acc[who] ??= { total: rec(), home: rec(), away: rec() });
  for (const m of matches) {
    team(m.home_name, m.home_crest);
    team(m.away_name, m.away_crest);
  }

  const mdTotal = new Map<number, number>();
  const mdDone = new Map<number, number>();
  for (const m of matches) mdTotal.set(m.matchday, (mdTotal.get(m.matchday) ?? 0) + 1);
  for (const m of finished) mdDone.set(m.matchday, (mdDone.get(m.matchday) ?? 0) + 1);
  const complete = (md: number) => mdTotal.get(md) === mdDone.get(md);

  const aggs = new Map<string, Agg>();
  for (const p of players) {
    aggs.set(p.id, {
      hits: 0,
      played: 0,
      missed: 0,
      byPick: { '1': rec(), X: rec(), '2': rec() },
      cur: 0,
      best: 0,
      md: new Map(),
      pickedMds: new Set(),
      brave: rec(),
    });
  }

  const results: Record<Pick, number> = { '1': 0, X: 0, '2': 0 };
  const picksCount: Record<Pick, number> = { '1': 0, X: 0, '2': 0 };
  const hitByResult: Record<Pick, Rec> = { '1': rec(), X: rec(), '2': rec() };
  const insights: MatchInsight[] = [];

  for (const m of finished) {
    const res = resultOf(m.status, m.home_score, m.away_score) as Pick;
    results[res]++;
    const home = team(m.home_name, m.home_crest);
    const away = team(m.away_name, m.away_crest);
    home.pj++;
    away.pj++;
    if (res === '1') home.won++;
    if (res === '2') away.won++;

    const pm = predByMatch.get(m.id);
    let hits = 0;
    let n = 0;

    // Pronóstico mayoritario del grupo en este partido (para medir quién se atreve a ir a la contra)
    const tally: Record<Pick, number> = { '1': 0, X: 0, '2': 0 };
    if (pm) for (const pick of pm.values()) tally[pick]++;
    const majority: Pick | null =
      pm && pm.size >= 2
        ? (['1', 'X', '2'] as Pick[]).sort((a, b) => tally[b] - tally[a])[0]
        : null;

    for (const pl of players) {
      const a = aggs.get(pl.id)!;
      a.md.set(m.matchday, a.md.get(m.matchday) ?? 0);
      const pick = pm?.get(pl.id);
      if (!pick) {
        a.missed++;
        a.cur = 0;
        continue;
      }
      const hit = pick === res;
      n++;
      if (hit) hits++;
      a.played++;
      a.pickedMds.add(m.matchday);
      if (majority && pick !== majority && tally[majority] > tally[pick]) bump(a.brave, hit);
      if (hit) {
        a.hits++;
        a.cur++;
        a.best = Math.max(a.best, a.cur);
        a.md.set(m.matchday, (a.md.get(m.matchday) ?? 0) + 1);
      } else {
        a.cur = 0;
      }
      bump(a.byPick[pick], hit);
      picksCount[pick]++;
      bump(hitByResult[res], hit);
      for (const who of [pl.id, '*']) {
        bump(cellOf(home, who).total, hit);
        bump(cellOf(home, who).home, hit);
        bump(cellOf(away, who).total, hit);
        bump(cellOf(away, who).away, hit);
      }
      home.pickedN++;
      away.pickedN++;
      if (pick === '1') home.pickedWin++;
      if (pick === '2') away.pickedWin++;
    }
    insights.push({
      matchId: m.id,
      matchday: m.matchday,
      home: m.home_name,
      away: m.away_name,
      homeScore: m.home_score,
      awayScore: m.away_score,
      hits,
      n,
    });
  }

  // Jornadas ganadas y plenos: solo en jornadas completas
  const completed = [...mdTotal.keys()].filter(complete).sort((a, b) => a - b);
  const wins = new Map<string, number>();
  const plenos = new Map<string, number>();
  for (const md of completed) {
    const pts = players.map((p) => aggs.get(p.id)!.md.get(md) ?? 0);
    const max = Math.max(0, ...pts);
    players.forEach((p, i) => {
      if (max > 0 && pts[i] === max) wins.set(p.id, (wins.get(p.id) ?? 0) + 1);
      if (pts[i] > 0 && pts[i] === mdTotal.get(md)) plenos.set(p.id, (plenos.get(p.id) ?? 0) + 1);
    });
  }

  // El equipo con el que peor le va a cada jugador (mínimo 3 pronósticos sobre él)
  const jinxOf = (playerId: string): PlayerStat['jinx'] => {
    let worst: { team: string; pct: number } | null = null;
    for (const t of teams.values()) {
      const c = t.acc[playerId]?.total;
      if (!c || c.n < 3) continue;
      const pct = (c.h / c.n) * 100;
      if (!worst || pct < worst.pct) worst = { team: t.team, pct };
    }
    return worst;
  };

  // Perfil de estilo: compara cómo pronostica cada uno con lo que pasa de verdad en la
  // realidad (results) para ver si se inclina hacia el local, el empate o el visitante
  // más que la media del grupo; si no destaca en eso, mira si suele ir a la contra de la
  // mayoría (valentía) o casi siempre pronostica lo mismo que todos.
  const totalRes = results['1'] + results.X + results['2'];
  const realShare: Record<Pick, number> = totalRes
    ? { '1': results['1'] / totalRes, X: results.X / totalRes, '2': results['2'] / totalRes }
    : { '1': 0, X: 0, '2': 0 };
  const MIN_FOR_STYLE = 8;
  const LEAN_THRESHOLD = 0.12; // 12 puntos porcentuales por encima de lo normal
  const styleOf = (a: Agg): PlayerStat['style'] => {
    if (a.played < MIN_FOR_STYLE || totalRes === 0) return null;
    const pickShare: Record<Pick, number> = {
      '1': a.byPick['1'].n / a.played,
      X: a.byPick.X.n / a.played,
      '2': a.byPick['2'].n / a.played,
    };
    const diffs = (['1', 'X', '2'] as Pick[])
      .map((k): [Pick, number] => [k, pickShare[k] - realShare[k]])
      .sort((x, y) => y[1] - x[1]);
    const [topPick, topDiff] = diffs[0];
    if (topDiff > LEAN_THRESHOLD) {
      if (topPick === '1') return { label: 'Localista', detail: 'le da la victoria al de casa más que la media del grupo' };
      if (topPick === 'X') return { label: 'Empatador', detail: 'pronostica empates más que la media del grupo' };
      return { label: 'Forastero', detail: 'le da la victoria al visitante más que la media del grupo' };
    }
    const bravePlayRate = a.played ? a.brave.n / a.played : 0;
    if (bravePlayRate > 0.3) return { label: 'Atrevido', detail: 'se va con frecuencia en contra de la mayoría del grupo' };
    if (bravePlayRate < 0.08) return { label: 'De favoritos', detail: 'casi siempre pronostica lo mismo que la mayoría' };
    return { label: 'Equilibrado', detail: 'no se inclina especialmente hacia ningún patrón' };
  };

  const playerStats: PlayerStat[] = players.map((p) => {
    const a = aggs.get(p.id)!;
    const own = completed.filter((md) => a.pickedMds.has(md));
    let best: PlayerStat['best'] = null;
    let worst: PlayerStat['worst'] = null;
    let sum = 0;
    for (const md of own) {
      const pts = a.md.get(md) ?? 0;
      sum += pts;
      if (!best || pts > best.points) best = { matchday: md, points: pts };
      if (!worst || pts < worst.points) worst = { matchday: md, points: pts };
    }
    return {
      playerId: p.id,
      name: p.name,
      hits: a.hits,
      played: a.played,
      missed: a.missed,
      pct: a.played ? (a.hits / a.played) * 100 : null,
      byPick: a.byPick,
      streak: a.cur,
      bestStreak: a.best,
      wins: wins.get(p.id) ?? 0,
      plenos: plenos.get(p.id) ?? 0,
      best,
      worst,
      avg: own.length ? sum / own.length : null,
      brave: a.brave,
      jinx: jinxOf(p.id),
      style: styleOf(a),
    };
  });
  playerStats.sort(
    (a, b) => b.hits - a.hits || (b.pct ?? -1) - (a.pct ?? -1) || a.name.localeCompare(b.name, 'es')
  );

  // Evolución acumulada por jornada
  const mds = [...mdDone.keys()].sort((a, b) => a - b);
  const series = players.map((p) => {
    const a = aggs.get(p.id)!;
    let run = 0;
    return {
      playerId: p.id,
      name: p.name,
      values: mds.map((md) => (run += a.md.get(md) ?? 0)),
    };
  });

  const scored = insights.filter((i) => i.n >= 2);
  const ratio = (i: MatchInsight) => i.hits / i.n;
  const hardest = [...scored]
    .sort((a, b) => ratio(a) - ratio(b) || b.n - a.n || b.matchday - a.matchday)
    .slice(0, 5);
  const easiest = [...scored]
    .sort((a, b) => ratio(b) - ratio(a) || b.n - a.n || b.matchday - a.matchday)
    .slice(0, 5);

  return {
    finished: finished.length,
    liga,
    teams: [...teams.values()],
    players: playerStats,
    group: { results, picks: picksCount, hitByResult, hardest, easiest },
    evolution: { matchdays: mds, series },
  };
}
