import { MatchLite, isFinished } from './league';
import { Pick, pointsForPrediction, resultOf } from './scoring';

// Índice de suerte: puntos reales menos puntos "esperados" según el xG de cada partido.
//
// Con el xG de los dos equipos se calcula qué probabilidad había de 1, X y 2 (goles de cada
// equipo como Poisson independientes). Los puntos esperados de un jugador en ese partido son la
// probabilidad de SU pronóstico. Si pones 1 y el xG decía que el 1 tenía un 12 %, un acierto te
// cuenta +0,88 de suerte; si fallas un pronóstico que tenía un 66 %, -0,66.
//
// Es ruido partido a partido: solo dice algo al sumar muchos. Por eso el DTO trae cuántos
// partidos hay con xG, y la pantalla avisa mientras la muestra es pequeña.

export type Xg = { h: number; a: number };

// A partir de cuántos partidos con xG el índice deja de ser más ruido que señal (unas 5 jornadas)
export const LUCK_CONFIDENT_MATCHES = 50;

export function prob1x2(xgHome: number, xgAway: number, max = 10): Record<Pick, number> {
  const pois = (m: number) => {
    const out: number[] = [];
    let term = Math.exp(-m);
    for (let k = 0; k <= max; k++) {
      out.push(term);
      term = (term * m) / (k + 1);
    }
    return out;
  };
  const ph = pois(xgHome);
  const pa = pois(xgAway);
  let p1 = 0;
  let px = 0;
  let p2 = 0;
  for (let i = 0; i <= max; i++) {
    for (let j = 0; j <= max; j++) {
      const p = ph[i] * pa[j];
      if (i > j) p1 += p;
      else if (i === j) px += p;
      else p2 += p;
    }
  }
  const total = p1 + px + p2; // lo que cae fuera de `max` goles se reparte proporcionalmente
  return { '1': p1 / total, X: px / total, '2': p2 / total };
}

export type LuckPlayer = {
  playerId: string;
  name: string;
  avatar: number | null;
  n: number; // partidos con xG que pronosticó
  real: number; // puntos de clasificación en esos partidos
  expected: number; // puntos esperados según el xG
  luck: number; // real - expected
};

export type LuckDTO = {
  finished: number; // partidos terminados
  covered: number; // de ellos, los que tienen xG
  confident: number; // umbral de partidos con xG para fiarse del índice
  players: LuckPlayer[]; // de más a menos suerte
};

export function computeLuck(input: {
  matches: MatchLite[];
  xg: Map<number, Xg>;
  preds: { player_id: string; match_id: number; pick: string; pleno_home?: number | null; pleno_away?: number | null }[];
  players: { id: string; name: string; avatar?: number | null }[];
}): LuckDTO {
  const { matches, xg, preds, players } = input;
  const finished = matches.filter(isFinished);
  const usable = new Map<number, { result: Pick; p: Record<Pick, number>; match: MatchLite; xg: Xg }>();
  for (const m of finished) {
    const x = xg.get(m.id);
    if (!x || !Number.isFinite(x.h) || !Number.isFinite(x.a) || x.h < 0 || x.a < 0) continue;
    const result = resultOf(m.status, m.home_score, m.away_score);
    if (result) usable.set(m.id, { result, p: prob1x2(x.h, x.a), match: m, xg: x });
  }

  const acc = new Map(players.map((p) => [p.id, { n: 0, real: 0, expected: 0 }]));
  for (const pr of preds) {
    const a = acc.get(pr.player_id);
    const u = usable.get(pr.match_id);
    if (!a || !u || (pr.pick !== '1' && pr.pick !== 'X' && pr.pick !== '2')) continue;
    a.n++;
    const m = u.match;
    const plenoHome = pr.pleno_home ?? null;
    const plenoAway = pr.pleno_away ?? null;
    a.real += pointsForPrediction({ result: u.result, pick: pr.pick, isPleno: m.is_pleno === true,
      homeScore: m.home_score, awayScore: m.away_score, plenoHome, plenoAway });
    if (m.is_pleno && plenoHome != null && plenoAway != null) {
      // Pleno al 15: tres puntos solo si se acierta el marcador exacto.
      const factorial = (n: number) => { let v = 1; for (let k = 2; k <= n; k++) v *= k; return v; };
      const poisson = (lambda: number, k: number) => Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
      a.expected += 3 * poisson(u.xg.h, plenoHome) * poisson(u.xg.a, plenoAway);
    } else {
      a.expected += u.p[pr.pick as Pick];
    }
  }

  const out: LuckPlayer[] = players
    .map((p) => {
      const a = acc.get(p.id)!;
      return {
        playerId: p.id,
        name: p.name,
        avatar: p.avatar ?? null,
        n: a.n,
        real: a.real,
        expected: a.expected,
        luck: a.real - a.expected,
      };
    })
    .filter((p) => p.n > 0)
    .sort((a, b) => b.luck - a.luck || a.name.localeCompare(b.name, 'es'));

  return { finished: finished.length, covered: usable.size, confident: LUCK_CONFIDENT_MATCHES, players: out };
}
