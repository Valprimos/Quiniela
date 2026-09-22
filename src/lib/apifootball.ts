// Fuente de datos alternativa para competiciones que football-data.org no trae en su plan
// gratuito (la Segunda División). Usa api-football.com (api-sports.io), que en su plan
// gratuito (100 peticiones/día) sí incluye la Segunda.
//
// Los partidos de aquí se guardan con un id desplazado (+900.000.000) para que nunca
// choquen con los ids de football-data.org, que viven en un rango mucho más bajo.
export const AF_ID_OFFSET = 900_000_000;

export type AFMatch = {
  id: number; // ya con el desplazamiento aplicado
  utcDate: string;
  status: string; // ya traducido a nuestro vocabulario (FINISHED, IN_PLAY, etc.)
  matchday: number;
  homeTeam: { name: string; crest: string | null };
  awayTeam: { name: string; crest: string | null };
  homeScore: number | null;
  awayScore: number | null;
};

export class ApiFootballError extends Error {}

const STATUS_MAP: Record<string, string> = {
  TBD: 'SCHEDULED',
  NS: 'SCHEDULED',
  '1H': 'IN_PLAY',
  '2H': 'IN_PLAY',
  ET: 'IN_PLAY',
  BT: 'IN_PLAY',
  P: 'IN_PLAY',
  LIVE: 'IN_PLAY',
  HT: 'PAUSED',
  FT: 'FINISHED',
  AET: 'FINISHED',
  PEN: 'FINISHED',
  AWD: 'FINISHED',
  WO: 'FINISHED',
  PST: 'POSTPONED',
  SUSP: 'SUSPENDED',
  INT: 'SUSPENDED',
  CANC: 'CANCELLED',
  ABD: 'CANCELLED',
};

// "Regular Season - 12" -> 12. Si la ronda no trae número (playoffs de ascenso al final
// de temporada), se agrupan todos juntos al final, igual que las eliminatorias de la Champions.
function matchdayFromRound(round: string): number {
  const m = round.match(/(\d+)/);
  return m ? Number(m[1]) : 100;
}

// El ID de liga de la Segunda española en api-football.com es 141. Si algún día cambia o
// devuelve vacío, compruébalo con una petición a /leagues?search=Segunda con tu propia clave.
export const SEGUNDA_LEAGUE_ID = 141;

export async function fetchApiFootballMatches(leagueId: number, season: number): Promise<AFMatch[]> {
  const res = await fetch(`https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${season}`, {
    headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiFootballError(`API-Football respondió ${res.status}`);
  const errors = json?.errors;
  const errorList = Array.isArray(errors) ? errors : errors ? Object.values(errors) : [];
  if (errorList.length) throw new ApiFootballError(String(errorList[0]));

  const response: unknown[] = json?.response ?? [];
  return response.map((raw) => {
    const f = raw as {
      fixture: { id: number; date: string; status: { short: string } };
      league: { round?: string };
      teams: { home: { name: string; logo?: string }; away: { name: string; logo?: string } };
      goals: { home: number | null; away: number | null };
    };
    return {
      id: AF_ID_OFFSET + f.fixture.id,
      utcDate: f.fixture.date,
      status: STATUS_MAP[f.fixture.status.short] ?? 'SCHEDULED',
      matchday: matchdayFromRound(f.league.round ?? ''),
      homeTeam: { name: f.teams.home.name, crest: f.teams.home.logo ?? null },
      awayTeam: { name: f.teams.away.name, crest: f.teams.away.logo ?? null },
      homeScore: f.goals.home,
      awayScore: f.goals.away,
    };
  });
}
