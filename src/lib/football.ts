type FDTeam = { shortName?: string; name: string; crest?: string | null };

export type FDMatch = {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score: { fullTime: { home: number | null; away: number | null } };
};

// Toda la temporada de Primera División (PD) en una sola petición
export async function fetchMatches(season: number): Promise<FDMatch[]> {
  const res = await fetch(
    `https://api.football-data.org/v4/competitions/PD/matches?season=${season}`,
    {
      headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN! },
      cache: 'no-store',
    }
  );
  if (!res.ok) throw new Error(`football-data.org respondió ${res.status}`);
  const json = await res.json();
  return json.matches as FDMatch[];
}
