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
// Códigos de error propios: 0 = falta la clave, -1 = no se pudo conectar (o tardó demasiado)
export async function fetchMatches(season: number, apiCode: string): Promise<FDMatch[]> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new FootballDataError(0, 'Falta FOOTBALL_DATA_TOKEN');
  let res: Response;
  try {
    res = await fetch(`https://api.football-data.org/v4/competitions/${apiCode}/matches?season=${season}`, {
      headers: { 'X-Auth-Token': token },
      cache: 'no-store',
      // La ruta de estado espera a la sincronización: que una API lenta no deje la app colgada
      signal: AbortSignal.timeout(9000),
    });
  } catch {
    throw new FootballDataError(-1, 'No se pudo conectar con football-data.org');
  }
  if (!res.ok) {
    // 403 típico: la competición no está en tu plan de football-data.org (p. ej. SD en el gratuito)
    throw new FootballDataError(res.status, `football-data.org respondió ${res.status} para ${apiCode}`);
  }
  const json = await res.json();
  return json.matches as FDMatch[];
}
