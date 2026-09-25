export type MatchLite = {
  id: number;
  competition: string;
  matchday: number;
  stage: string | null;
  utc_date: string;
  status: string;
  home_name: string;
  away_name: string;
  home_crest: string | null;
  away_crest: string | null;
  home_score: number | null;
  away_score: number | null;
  admin_locked?: boolean;
};

export type Rec5 = { pj: number; g: number; e: number; p: number; gf: number; gc: number; pts: number };
export type FormMark = 'G' | 'E' | 'P';
export type LigaRow = {
  team: string;
  crest: string | null;
  pos: number;
  form: FormMark[]; // últimos 5, del más antiguo al más reciente
  total: Rec5;
  home: Rec5;
  away: Rec5;
};

const empty = (): Rec5 => ({ pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 });

function add(r: Rec5, gf: number, gc: number) {
  r.pj++;
  r.gf += gf;
  r.gc += gc;
  if (gf > gc) {
    r.g++;
    r.pts += 3;
  } else if (gf === gc) {
    r.e++;
    r.pts += 1;
  } else {
    r.p++;
  }
}

export function isFinished(
  m: MatchLite
): m is MatchLite & { home_score: number; away_score: number } {
  return m.status === 'FINISHED' && m.home_score != null && m.away_score != null;
}

// Clasificación real calculada con los resultados guardados (desempate: DG y goles a favor).
// Para la Champions (con eliminatorias) esto solo tiene sentido en la fase de liga:
// pásale ya filtrados los partidos de esa fase si hace falta.
export function buildLiga(matches: MatchLite[]): LigaRow[] {
  const rows = new Map<string, LigaRow>();
  const get = (team: string, crest: string | null): LigaRow => {
    let r = rows.get(team);
    if (!r) {
      r = { team, crest, pos: 0, form: [], total: empty(), home: empty(), away: empty() };
      rows.set(team, r);
    }
    if (!r.crest && crest) r.crest = crest;
    return r;
  };

  for (const m of matches) {
    get(m.home_name, m.home_crest);
    get(m.away_name, m.away_crest);
  }

  const finished = matches
    .filter(isFinished)
    .sort((a, b) => new Date(a.utc_date).getTime() - new Date(b.utc_date).getTime() || a.id - b.id);

  for (const m of finished) {
    const h = get(m.home_name, m.home_crest);
    const a = get(m.away_name, m.away_crest);
    add(h.total, m.home_score, m.away_score);
    add(h.home, m.home_score, m.away_score);
    add(a.total, m.away_score, m.home_score);
    add(a.away, m.away_score, m.home_score);
    h.form.push(m.home_score > m.away_score ? 'G' : m.home_score === m.away_score ? 'E' : 'P');
    a.form.push(m.away_score > m.home_score ? 'G' : m.away_score === m.home_score ? 'E' : 'P');
  }

  const list = [...rows.values()];
  for (const r of list) r.form = r.form.slice(-5);
  list.sort(
    (a, b) =>
      b.total.pts - a.total.pts ||
      b.total.gf - b.total.gc - (a.total.gf - a.total.gc) ||
      b.total.gf - a.total.gf ||
      a.team.localeCompare(b.team, 'es')
  );
  list.forEach((r, i) => (r.pos = i + 1));
  return list;
}

// Todos los resultados de un equipo, más recientes primero (para el historial al pinchar en él)
export function teamHistory(matches: MatchLite[], team: string) {
  return matches
    .filter((m) => m.home_name === team || m.away_name === team)
    .sort((a, b) => new Date(a.utc_date).getTime() - new Date(b.utc_date).getTime())
    .map((m) => {
      const home = m.home_name === team;
      const gf = home ? m.home_score : m.away_score;
      const gc = home ? m.away_score : m.home_score;
      const finished = isFinished(m);
      const mark: FormMark | null = !finished || gf == null || gc == null ? null : gf > gc ? 'G' : gf === gc ? 'E' : 'P';
      return {
        matchId: m.id,
        matchday: m.matchday,
        utcDate: m.utc_date,
        status: m.status,
        home,
        rival: home ? m.away_name : m.home_name,
        rivalCrest: home ? m.away_crest : m.home_crest,
        gf,
        gc,
        mark,
      };
    });
}

export type TeamRecord = {
  total: Rec5;
  home: Rec5;
  away: Rec5;
  cleanSheets: number; // partidos sin encajar
  failedToScore: number; // partidos sin marcar
  biggestWin: { rival: string; score: string } | null;
  biggestLoss: { rival: string; score: string } | null;
};

// Estadísticas de un equipo esta temporada: para el panel que se abre al pinchar en él.
export function teamRecord(matches: MatchLite[], team: string): TeamRecord {
  const total = empty();
  const home = empty();
  const away = empty();
  let cleanSheets = 0;
  let failedToScore = 0;
  let biggestWin: TeamRecord['biggestWin'] = null;
  let biggestLoss: TeamRecord['biggestLoss'] = null;

  const finished = matches
    .filter(isFinished)
    .filter((m) => m.home_name === team || m.away_name === team);

  for (const m of finished) {
    const isHome = m.home_name === team;
    const gf = isHome ? m.home_score : m.away_score;
    const gc = isHome ? m.away_score : m.home_score;
    const rival = isHome ? m.away_name : m.home_name;
    add(total, gf, gc);
    add(isHome ? home : away, gf, gc);
    if (gc === 0) cleanSheets++;
    if (gf === 0) failedToScore++;
    const diff = gf - gc;
    if (diff > 0 && (!biggestWin || diff > Number(biggestWin.score.split('-')[0]) - Number(biggestWin.score.split('-')[1]))) {
      biggestWin = { rival, score: `${gf}-${gc}` };
    }
    if (diff < 0 && (!biggestLoss || diff < Number(biggestLoss.score.split('-')[0]) - Number(biggestLoss.score.split('-')[1]))) {
      biggestLoss = { rival, score: `${gf}-${gc}` };
    }
  }

  return { total, home, away, cleanSheets, failedToScore, biggestWin, biggestLoss };
}
