import { LigaRow, MatchLite, isFinished } from './league';
import { Pick, resultOf } from './scoring';
import { COMPETITIONS, STAGE_LABEL, competitionDef } from './competitions';

export type Rec = { h: number; n: number }; // aciertos / pronósticos
type Cell = { total: Rec; home: Rec; away: Rec };

// Una "ronda" es una jornada de una competición. Cuando se mezclan La Liga y Champions,
// las rondas se ordenan por fecha para poder dibujarlas en una misma línea de tiempo.
export type Round = {
  key: number; // identificador interno (orden cronológico)
  comp: string; // 'PD' | 'CL'
  matchday: number;
  label: string; // "J5", o "Champions J3" si hay varias competiciones
  short: string; // "J5", "8º"...
  done: number; // partidos terminados
  total: number; // partidos de la ronda
};

export type CompTally = { hits: number; played: number; points: number };
export type FormMark = 'H' | 'M' | '-'; // acierto, fallo, sin pronosticar

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
  // Puntos reales de la quiniela (1 por acierto; el pleno al 15 vale 3 si aciertas el marcador)
  points: number;
  byPick: Record<Pick, Rec>;
  streak: number;
  bestStreak: number;
  worstStreak: number; // mayor racha seguida de fallos
  wins: number;
  plenos: number;
  best: { round: string; points: number } | null;
  worst: { round: string; points: number } | null;
  avg: number | null;
  // Cuántas veces se fue en contra de lo que votaba la mayoría del grupo, y cuántas acertó al hacerlo
  brave: Rec;
  // El equipo con peor % de acierto de este jugador (mínimo 3 pronósticos sobre él)
  jinx: { team: string; pct: number } | null;
  // Pleno al 15: aciertos de marcador exacto (h) sobre cuántos ha jugado (n)
  pleno15: Rec;
  // Desglose por competición (clave: 'PD', 'CL')
  byComp: Record<string, CompTally>;
  // Últimos 10 partidos terminados, del más antiguo al más reciente
  form: FormMark[];
  style: { label: string; detail: string } | null;
};

// Siamesismo: cuánto coinciden los pronósticos de dos jugadores
export type Pair = {
  a: string; // id del primer jugador
  b: string;
  aName: string;
  bName: string;
  same: number; // partidos en los que pusieron lo mismo
  n: number; // partidos terminados que pronosticaron los dos
  pct: number; // same / n, de 0 a 100
};

export type MatchInsight = {
  matchId: number;
  round: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  hits: number;
  n: number;
};

export type StatsDTO = {
  finished: number;
  comps: string[]; // competiciones incluidas
  liga: LigaRow[];
  teams: TeamAcc[];
  players: PlayerStat[];
  siamese: Pair[]; // parejas con suficientes partidos en común, de más a menos parecidas
  group: {
    results: Record<Pick, number>;
    picks: Record<Pick, number>;
    hitByResult: Record<Pick, Rec>;
    byComp: Record<string, Rec>;
    hardest: MatchInsight[];
    easiest: MatchInsight[];
  };
  evolution: {
    rounds: Round[]; // solo las que ya tienen partidos terminados
    series: {
      playerId: string;
      name: string;
      values: number[]; // puntos acumulados
      per: (number | null)[]; // puntos en cada ronda (null = no pronosticó)
    }[];
  };
};

type Agg = {
  hits: number;
  played: number;
  missed: number;
  points: number;
  byPick: Record<Pick, Rec>;
  cur: number;
  best: number;
  lose: number;
  worstLose: number;
  md: Map<number, number>; // aciertos por ronda
  pts: Map<number, number>; // puntos por ronda
  pickedMds: Set<number>; // rondas en las que pronosticó algo
  brave: Rec;
  pleno15: Rec; // aciertos exactos del "pleno al 15" (h) sobre cuántos jugó (n)
  comp: Record<string, CompTally>;
  form: FormMark[];
};

// Mínimo de partidos pronosticados por los dos para que una pareja cuente
const MIN_PAIR = 8;

const rec = (): Rec => ({ h: 0, n: 0 });
const bump = (r: Rec, hit: boolean) => {
  r.n++;
  if (hit) r.h++;
};

const STAGE_SHORT: Record<string, string> = {
  PLAYOFFS: 'PO',
  LAST_16: '8º',
  ROUND_OF_16: '8º',
  QUARTER_FINALS: '4º',
  SEMI_FINALS: 'SF',
  FINAL: 'F',
};

function buildRounds(matches: MatchLite[], multi: boolean): Round[] {
  const groups = new Map<string, MatchLite[]>();
  for (const m of matches) {
    const k = `${m.competition}|${m.matchday}`;
    const g = groups.get(k);
    if (g) g.push(m);
    else groups.set(k, [m]);
  }
  const list = [...groups.values()].map((ms) => {
    const times = ms.map((m) => new Date(m.utc_date).getTime()).sort((a, b) => a - b);
    return { ms, median: times[Math.floor(times.length / 2)] };
  });
  // Con una sola competición se respeta el número de jornada; con varias, la fecha
  list.sort((a, b) =>
    multi
      ? a.median - b.median ||
        a.ms[0].competition.localeCompare(b.ms[0].competition) ||
        a.ms[0].matchday - b.ms[0].matchday
      : a.ms[0].matchday - b.ms[0].matchday
  );
  return list.map(({ ms }, i) => {
    const { competition: comp, matchday, stage } = ms[0];
    const ko = matchday >= 100;
    const base = ko ? (stage && STAGE_LABEL[stage]) || `Eliminatoria ${matchday - 99}` : `J${matchday}`;
    return {
      key: i + 1,
      comp,
      matchday,
      label: multi ? `${competitionDef(comp).short} ${base}` : base,
      short: ko ? (stage && STAGE_SHORT[stage]) || 'E' : `J${matchday}`,
      done: ms.filter(isFinished).length,
      total: ms.length,
    };
  });
}

export function computeStats(input: {
  matches: MatchLite[];
  preds: { player_id: string; match_id: number; pick: string; pleno_home?: number | null; pleno_away?: number | null }[];
  players: { id: string; name: string }[];
  liga: LigaRow[];
}): StatsDTO {
  const { matches, preds, players, liga } = input;
  // Mismo orden que el menú de competiciones (La Liga, Champions)
  const present = new Set(matches.map((m) => m.competition));
  const comps = [
    ...COMPETITIONS.map((c) => c.code as string).filter((c) => present.has(c)),
    ...[...present].filter((c) => !COMPETITIONS.some((d) => d.code === c)).sort(),
  ];
  const multi = comps.length > 1;
  const rounds = buildRounds(matches, multi);
  const roundOf = new Map(rounds.map((r) => [`${r.comp}|${r.matchday}`, r]));
  const rk = (m: MatchLite) => roundOf.get(`${m.competition}|${m.matchday}`)!.key;
  const roundByKey = new Map(rounds.map((r) => [r.key, r]));

  const finished = matches
    .filter(isFinished)
    .sort((a, b) => new Date(a.utc_date).getTime() - new Date(b.utc_date).getTime() || a.id - b.id);

  const predByMatch = new Map<number, Map<string, Pick>>();
  const plenoGuessByMatch = new Map<number, Map<string, { home: number; away: number }>>();
  for (const p of preds) {
    let mm = predByMatch.get(p.match_id);
    if (!mm) predByMatch.set(p.match_id, (mm = new Map()));
    mm.set(p.player_id, p.pick as Pick);
    if (p.pleno_home != null && p.pleno_away != null) {
      let pg = plenoGuessByMatch.get(p.match_id);
      if (!pg) plenoGuessByMatch.set(p.match_id, (pg = new Map()));
      pg.set(p.player_id, { home: p.pleno_home, away: p.pleno_away });
    }
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
  for (const m of matches) mdTotal.set(rk(m), (mdTotal.get(rk(m)) ?? 0) + 1);
  for (const m of finished) mdDone.set(rk(m), (mdDone.get(rk(m)) ?? 0) + 1);
  const complete = (key: number) => mdTotal.get(key) === mdDone.get(key);

  const aggs = new Map<string, Agg>();
  for (const p of players) {
    aggs.set(p.id, {
      hits: 0,
      played: 0,
      missed: 0,
      points: 0,
      byPick: { '1': rec(), X: rec(), '2': rec() },
      cur: 0,
      best: 0,
      lose: 0,
      worstLose: 0,
      md: new Map(),
      pts: new Map(),
      pickedMds: new Set(),
      brave: rec(),
      pleno15: rec(),
      comp: Object.fromEntries(comps.map((c) => [c, { hits: 0, played: 0, points: 0 }])),
      form: [],
    });
  }

  const results: Record<Pick, number> = { '1': 0, X: 0, '2': 0 };
  const picksCount: Record<Pick, number> = { '1': 0, X: 0, '2': 0 };
  const hitByResult: Record<Pick, Rec> = { '1': rec(), X: rec(), '2': rec() };
  const groupComp: Record<string, Rec> = Object.fromEntries(comps.map((c) => [c, rec()]));
  const insights: MatchInsight[] = [];
  // Coincidencias entre cada pareja de jugadores (i < j)
  const pairs = new Map<string, { same: number; n: number }>();

  for (const m of finished) {
    const key = rk(m);
    const res = resultOf(m.status, m.home_score, m.away_score) as Pick;
    results[res]++;
    const home = team(m.home_name, m.home_crest);
    const away = team(m.away_name, m.away_crest);
    home.pj++;
    away.pj++;
    if (res === '1') home.won++;
    if (res === '2') away.won++;

    const pm = predByMatch.get(m.id);
    const pg = m.is_pleno ? plenoGuessByMatch.get(m.id) : undefined;
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
      a.md.set(key, a.md.get(key) ?? 0);
      a.pts.set(key, a.pts.get(key) ?? 0);
      const pick = pm?.get(pl.id);
      if (!pick) {
        a.missed++;
        a.cur = 0;
        a.form.push('-');
        continue;
      }
      const hit = pick === res;
      n++;
      if (hit) hits++;
      a.played++;
      a.pickedMds.add(key);
      if (majority && pick !== majority && tally[majority] > tally[pick]) bump(a.brave, hit);

      // Mismos puntos que la clasificación: 1 por acierto; en el pleno, 3 si clavas el marcador
      let pts = hit ? 1 : 0;
      if (m.is_pleno) {
        const g = pg?.get(pl.id);
        const exact = !!g && g.home === m.home_score && g.away === m.away_score;
        if (g) bump(a.pleno15, exact);
        pts = exact ? 3 : 0;
      }
      a.points += pts;
      a.pts.set(key, (a.pts.get(key) ?? 0) + pts);
      const ct = a.comp[m.competition];
      ct.played++;
      ct.points += pts;
      if (hit) ct.hits++;

      if (hit) {
        a.hits++;
        a.cur++;
        a.best = Math.max(a.best, a.cur);
        a.lose = 0;
        a.md.set(key, (a.md.get(key) ?? 0) + 1);
      } else {
        a.cur = 0;
        a.lose++;
        a.worstLose = Math.max(a.worstLose, a.lose);
      }
      a.form.push(hit ? 'H' : 'M');
      bump(a.byPick[pick], hit);
      picksCount[pick]++;
      bump(hitByResult[res], hit);
      bump(groupComp[m.competition], hit);
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
    // Siamesismo: en este partido, ¿qué parejas pusieron lo mismo?
    if (pm) {
      for (let i = 0; i < players.length; i++) {
        const pi = pm.get(players[i].id);
        if (!pi) continue;
        for (let j = i + 1; j < players.length; j++) {
          const pj = pm.get(players[j].id);
          if (!pj) continue;
          const k = `${i}|${j}`;
          const c = pairs.get(k) ?? pairs.set(k, { same: 0, n: 0 }).get(k)!;
          c.n++;
          if (pi === pj) c.same++;
        }
      }
    }
    insights.push({
      matchId: m.id,
      round: roundByKey.get(key)!.label,
      home: m.home_name,
      away: m.away_name,
      homeScore: m.home_score,
      awayScore: m.away_score,
      hits,
      n,
    });
  }

  // Jornadas ganadas y plenos: solo en rondas completas
  const completed = [...mdTotal.keys()].filter(complete).sort((a, b) => a - b);
  const wins = new Map<string, number>();
  const plenos = new Map<string, number>();
  for (const key of completed) {
    const pts = players.map((p) => aggs.get(p.id)!.pts.get(key) ?? 0);
    const max = Math.max(0, ...pts);
    players.forEach((p, i) => {
      if (max > 0 && pts[i] === max) wins.set(p.id, (wins.get(p.id) ?? 0) + 1);
      const h = aggs.get(p.id)!.md.get(key) ?? 0;
      if (h > 0 && h === mdTotal.get(key)) plenos.set(p.id, (plenos.get(p.id) ?? 0) + 1);
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
    if (bravePlayRate > 0.3) return { label: 'La suegra', detail: 'se va con frecuencia en contra de la mayoría del grupo' };
    if (bravePlayRate < 0.08) return { label: 'De favoritos', detail: 'casi siempre pronostica lo mismo que la mayoría' };
    return { label: 'Equilibrado', detail: 'no se inclina especialmente hacia ningún patrón' };
  };

  const playerStats: PlayerStat[] = players.map((p) => {
    const a = aggs.get(p.id)!;
    const own = completed.filter((key) => a.pickedMds.has(key));
    let best: PlayerStat['best'] = null;
    let worst: PlayerStat['worst'] = null;
    let sum = 0;
    for (const key of own) {
      const pts = a.pts.get(key) ?? 0;
      const label = roundByKey.get(key)!.label;
      sum += pts;
      if (!best || pts > best.points) best = { round: label, points: pts };
      if (!worst || pts < worst.points) worst = { round: label, points: pts };
    }
    return {
      playerId: p.id,
      name: p.name,
      hits: a.hits,
      played: a.played,
      missed: a.missed,
      pct: a.played ? (a.hits / a.played) * 100 : null,
      points: a.points,
      byPick: a.byPick,
      streak: a.cur,
      bestStreak: a.best,
      worstStreak: a.worstLose,
      wins: wins.get(p.id) ?? 0,
      plenos: plenos.get(p.id) ?? 0,
      best,
      worst,
      avg: own.length ? sum / own.length : null,
      brave: a.brave,
      jinx: jinxOf(p.id),
      pleno15: a.pleno15,
      byComp: a.comp,
      form: a.form.slice(-10),
      style: styleOf(a),
    };
  });
  playerStats.sort(
    (a, b) =>
      b.points - a.points ||
      b.hits - a.hits ||
      (b.pct ?? -1) - (a.pct ?? -1) ||
      a.name.localeCompare(b.name, 'es')
  );

  // Evolución acumulada por ronda (en el mismo orden que la lista de jugadores)
  const doneRounds = rounds.filter((r) => (mdDone.get(r.key) ?? 0) > 0);
  const series = playerStats.map((ps) => {
    const a = aggs.get(ps.playerId)!;
    let run = 0;
    return {
      playerId: ps.playerId,
      name: ps.name,
      values: doneRounds.map((r) => (run += a.pts.get(r.key) ?? 0)),
      per: doneRounds.map((r) => (a.pickedMds.has(r.key) ? a.pts.get(r.key) ?? 0 : null)),
    };
  });

  const siamese: Pair[] = [...pairs.entries()]
    .filter(([, c]) => c.n >= MIN_PAIR)
    .map(([k, c]) => {
      const [i, j] = k.split('|').map(Number);
      return {
        a: players[i].id,
        b: players[j].id,
        aName: players[i].name,
        bName: players[j].name,
        same: c.same,
        n: c.n,
        pct: (c.same / c.n) * 100,
      };
    })
    .sort((x, y) => y.pct - x.pct || y.n - x.n || x.aName.localeCompare(y.aName, 'es'));

  const scored = insights.filter((i) => i.n >= 2);
  const ratio = (i: MatchInsight) => i.hits / i.n;
  const hardest = [...scored]
    .sort((a, b) => ratio(a) - ratio(b) || b.n - a.n || b.matchId - a.matchId)
    .slice(0, 5);
  const easiest = [...scored]
    .sort((a, b) => ratio(b) - ratio(a) || b.n - a.n || b.matchId - a.matchId)
    .slice(0, 5);

  return {
    finished: finished.length,
    comps,
    liga,
    teams: [...teams.values()],
    players: playerStats,
    siamese,
    group: { results, picks: picksCount, hitByResult, byComp: groupComp, hardest, easiest },
    evolution: { rounds: doneRounds, series },
  };
}
