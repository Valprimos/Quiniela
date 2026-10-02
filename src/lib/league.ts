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
    .replace(/\b(cf|fc|cd|sad|ud|sd|rcd|rc|club|futbol|balompie|de|del|la|el)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  return NICKNAME_MAP[base] ?? base;
}

function hashOf(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash;
}

// Color de la camiseta local y de la de visitante de cada equipo. Solo se usa la de
// visitante cuando hace falta (choque de colores con el rival), nunca porque sí.
type Kit = { home: string; away: string };
const TEAM_KITS: Record<string, Kit> = {
  realmadrid: { home: '#e8e8ec', away: '#4a2e6b' },
  barcelona: { home: '#1c4fa0', away: '#f2b705' },
  atleticomadrid: { home: '#e2453d', away: '#1c3a63' },
  athletic: { home: '#9c2b2b', away: '#2d4f7c' },
  sevilla: { home: '#c2202e', away: '#1b3a6b' },
  realbetis: { home: '#2e9e52', away: '#c9a227' },
  realsociedad: { home: '#2f7fc4', away: '#16305c' },
  villarreal: { home: '#e0a72c', away: '#1c2e4a' },
  valencia: { home: '#f2924d', away: '#2a2a2a' },
  celtavigo: { home: '#5aa8d6', away: '#1b3350' },
  espanyol: { home: '#3060a8', away: '#d9a52c' },
  caosasuna: { home: '#d2543f', away: '#1d3f6e' },
  rayovallecano: { home: '#e0526a', away: '#2a2a2a' },
  deportivoalaves: { home: '#4472c4', away: '#d9b23a' },
  levante: { home: '#1c3a63', away: '#7a2436' },
  deportivocoruna: { home: '#1a4faa', away: '#2a2a2a' },
  malaga: { home: '#2f5fa0', away: '#d8d8d8' },
};

function kitOf(name: string): Kit {
  const key = normalizeTeamName(name);
  if (TEAM_KITS[key]) return TEAM_KITS[key];
  const hue = hashOf(key) % 360;
  return { home: `hsl(${hue} 62% 62%)`, away: `hsl(${(hue + 180) % 360} 62% 62%)` };
}

export function teamColor(name: string): string {
  return kitOf(name).home;
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

// El local siempre lleva su color de casa. El visitante también, salvo que se parezca
// demasiado al del local — entonces, y solo entonces, se usa su color de visitante de verdad.
export function pairTeamColors(homeName: string, awayName: string): { home: string; away: string } {
  const homeKit = kitOf(homeName);
  const awayKit = kitOf(awayName);
  const diff = Math.min(
    Math.abs(colorHue(homeKit.home) - colorHue(awayKit.home)),
    360 - Math.abs(colorHue(homeKit.home) - colorHue(awayKit.home))
  );
  return { home: homeKit.home, away: diff < 35 ? awayKit.away : awayKit.home };
}

// Equipos con camiseta a rayas verticales reconocibles de verdad (no por aproximar):
// Athletic y Atlético (rojiblancas), Barça (azulgrana) y Betis (verdiblancas).
const STRIPE_SECONDARY: Record<string, string> = {
  barcelona: '#a50044', // azulgrana: su azul + este grana, sin blanco
};
const STRIPED_TEAMS = new Set(['athletic', 'atleticomadrid', 'barcelona', 'realbetis']);

export function teamFill(name: string, color: string): string {
  const key = normalizeTeamName(name);
  if (!STRIPED_TEAMS.has(key)) return color;
  const secondary = STRIPE_SECONDARY[key] ?? '#f2f2f2';
  return `repeating-linear-gradient(90deg, ${color} 0 5px, ${secondary} 5px 9px)`;
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
