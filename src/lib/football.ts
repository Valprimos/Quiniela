type FDTeam = { shortName?: string; name: string; crest?: string | null };

export type FDMatch = {
  id: number;
  utcDate: string;
  status: string;
  stage?: string;
  matchday: number | null;
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score: { fullTime: { home: number | null; away: number | null } };
};

export class FootballDataError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Toda la temporada de una competición (PD, SD o CL) en una sola petición
export async function fetchMatches(season: number, apiCode: string): Promise<FDMatch[]> {
  const res = await fetch(
    `https://api.football-data.org/v4/competitions/${apiCode}/matches?season=${season}`,
    {
      headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN! },
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    // 403 típico: la competición no está en tu plan de football-data.org (p. ej. SD en el gratuito)
    throw new FootballDataError(res.status, `football-data.org respondió ${res.status} para ${apiCode}`);
  }
  const json = await res.json();
  return json.matches as FDMatch[];
}
