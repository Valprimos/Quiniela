// football-data.org y api-football.com no siempre escriben el mismo equipo igual
// ("Atlético Madrid" vs "Atletico de Madrid"). Se compara por esta forma normalizada
// para que el historial y el cara a cara encuentren los partidos aunque el nombre
// guardado no sea carácter por carácter idéntico.
// Apodos habituales que una fuente de datos puede usar como nombre corto, cuando la otra
// usa el nombre largo del club. Se normalizan al mismo resultado que el nombre completo.
const NICKNAME_MAP: Record<string, string> = {
  atleti: 'atleticomadrid',
  barca: 'barcelona',
};

export function normalizeTeamName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(cf|fc|cd|sad|ud|sd|rcd|club|futbol|balompie|de|del|la|el)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  return NICKNAME_MAP[base] ?? base;
}

// Un color propio por equipo. Unos pocos grandes llevan un color a mano; el resto saca uno
// determinista a partir de su nombre (siempre el mismo para el mismo equipo, sin mantenimiento).
const TEAM_COLOR_OVERRIDES: Record<string, string> = {
  realmadrid: '#e8e8ec',
  barcelona: '#4d8fe0',
  atleticomadrid: '#e2453d',
  athleticclub: '#9c2b2b',
  sevilla: '#c2202e',
  realbetis: '#2e9e52',
  realsociedad: '#2f7fc4',
  villarreal: '#e0a72c',
  valencia: '#f2924d',
  celtavigo: '#5aa8d6',
  espanyol: '#3060a8',
  osasuna: '#1d3f6e',
  rayovallecano: '#e0526a',
  alaves: '#4472c4',
};

function hashOf(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash;
}

export function teamColor(name: string): string {
  const key = normalizeTeamName(name);
  if (TEAM_COLOR_OVERRIDES[key]) return TEAM_COLOR_OVERRIDES[key];
  return `hsl(${hashOf(key) % 360} 62% 62%)`;
}

function colorHue(color: string): number {
  if (color.startsWith('hsl')) return Number(color.match(/hsl\((\d+)/)?.[1] ?? 0);
  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(h * 60);
}

// Un color por equipo local y otro por el visitante. Si les tocara un color demasiado
// parecido (por azar, o dos equipos con overrides cercanos), se aparta el del visitante.
export function pairTeamColors(homeName: string, awayName: string): { home: string; away: string } {
  const home = teamColor(homeName);
  let away = teamColor(awayName);
  const diff = Math.min(Math.abs(colorHue(home) - colorHue(away)), 360 - Math.abs(colorHue(home) - colorHue(away)));
  if (diff < 35) {
    const shift = 150 + (hashOf(normalizeTeamName(awayName)) % 60);
    away = `hsl(${(colorHue(home) + shift) % 360} 62% 62%)`;
  }
  return { home, away };
}

// Equipos con camiseta a rayas verticales reconocibles: en vez de un color plano, un
// degradado a rayas con su color y blanco, para diferenciarlos aún mejor de un vistazo.
const STRIPED_TEAMS = new Set(['athleticclub', 'atleticomadrid', 'barcelona', 'sevilla']);

export function teamFill(name: string, color: string): string {
  const key = normalizeTeamName(name);
  if (!STRIPED_TEAMS.has(key)) return color;
  return `repeating-linear-gradient(90deg, ${color} 0 5px, #f2f2f2 5px 9px)`;
}

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
  is_pleno?: boolean;
  season?: number;
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
  const key = normalizeTeamName(team);
  return matches
    .filter((m) => normalizeTeamName(m.home_name) === key || normalizeTeamName(m.away_name) === key)
    .sort((a, b) => new Date(a.utc_date).getTime() - new Date(b.utc_date).getTime())
    .map((m) => {
      const home = normalizeTeamName(m.home_name) === key;
      const gf = home ? m.home_score : m.away_score;
      const gc = home ? m.away_score : m.home_score;
      const finished = isFinished(m);
      const mark: FormMark | null = !finished || gf == null || gc == null ? null : gf > gc ? 'G' : gf === gc ? 'E' : 'P';
      return {
        matchId: m.id,
        matchday: m.matchday,
        season: m.season ?? null,
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
  const key = normalizeTeamName(team);
  const total = empty();
  const home = empty();
  const away = empty();
  let cleanSheets = 0;
  let failedToScore = 0;
  let biggestWin: TeamRecord['biggestWin'] = null;
  let biggestLoss: TeamRecord['biggestLoss'] = null;

  const finished = matches
    .filter(isFinished)
    .filter((m) => normalizeTeamName(m.home_name) === key || normalizeTeamName(m.away_name) === key);

  for (const m of finished) {
    const isHome = normalizeTeamName(m.home_name) === key;
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
