// Fuente de datos alternativa para la Segunda División (football-data.org no la trae gratis,
// y el plan gratuito de api-football.com no da acceso a la temporada en curso).
// TheSportsDB SÍ es gratis y sin restricción de temporada, pero es una base de datos que
// mantiene la comunidad: puede tener huecos, fechas/horas aproximadas, y el estado "en juego"
// no siempre se actualiza al segundo (a veces salta directo de "por jugar" a "terminado").
//
// Los partidos de aquí se guardan con un id desplazado (+800.000.000) para que nunca choquen
// con los ids de football-data.org.
export const TSDB_ID_OFFSET = 800_000_000;

export type TSDBMatch = {
  id: number; // ya con el desplazamiento aplicado
  utcDate: string;
  status: string; // ya traducido a nuestro vocabulario
  matchday: number;
  homeTeam: { name: string; crest: string | null };
  awayTeam: { name: string; crest: string | null };
  homeScore: number | null;
  awayScore: number | null;
};

export class TheSportsDbError extends Error {}

const STATUS_MAP: Record<string, string> = {
  'NOT STARTED': 'SCHEDULED',
  NS: 'SCHEDULED',
  '1H': 'IN_PLAY',
  '2H': 'IN_PLAY',
  LIVE: 'IN_PLAY',
  'IN PROGRESS': 'IN_PLAY',
  HT: 'PAUSED',
  'MATCH FINISHED': 'FINISHED',
  FT: 'FINISHED',
  AET: 'FINISHED',
  FINISHED: 'FINISHED',
  POSTPONED: 'POSTPONED',
  PST: 'POSTPONED',
  CANCELLED: 'CANCELLED',
  CANCELED: 'CANCELLED',
  ABANDONED: 'CANCELLED',
};

function base(key: string) {
  return `https://www.thesportsdb.com/api/v1/json/${key}`;
}

let cachedLeagueId: string | null = null;

// Busca el id de la Segunda española por nombre en vez de tener uno fijo escrito a mano,
// para que no se rompa si TheSportsDB cambia sus ids (o si adivinamos mal el de partida).
async function resolveSegundaLeagueId(key: string): Promise<string> {
  if (cachedLeagueId) return cachedLeagueId;
  const res = await fetch(`${base(key)}/search_all_leagues.php?c=Spain&s=Soccer`, { cache: 'no-store' });
  if (!res.ok) throw new TheSportsDbError(`TheSportsDB respondió ${res.status} buscando la liga`);
  const json = await res.json().catch(() => null);
  const list: { idLeague?: string; strLeague?: string }[] = json?.countrys ?? json?.leagues ?? [];
  const found = list.find((l) => /segunda/i.test(l.strLeague ?? ''));
  if (!found?.idLeague) {
    throw new TheSportsDbError('No se encontró la Segunda División entre las ligas de España en TheSportsDB.');
  }
  cachedLeagueId = found.idLeague;
  return cachedLeagueId;
}

function deriveStatus(raw: { strStatus?: string; intHomeScore?: string | null; intAwayScore?: string | null }): string {
  const s = (raw.strStatus ?? '').trim().toUpperCase();
  if (STATUS_MAP[s]) return STATUS_MAP[s];
  const hasScore =
    raw.intHomeScore != null && raw.intHomeScore !== '' && raw.intAwayScore != null && raw.intAwayScore !== '';
  return hasScore ? 'FINISHED' : 'SCHEDULED';
}

export async function fetchTheSportsDbMatches(season: number): Promise<TSDBMatch[]> {
  const key = process.env.THESPORTSDB_KEY || '3';
  const leagueId = await resolveSegundaLeagueId(key);
  const seasonStr = `${season}-${season + 1}`;
  const res = await fetch(`${base(key)}/eventsseason.php?id=${leagueId}&s=${seasonStr}`, { cache: 'no-store' });
  if (!res.ok) throw new TheSportsDbError(`TheSportsDB respondió ${res.status} pidiendo los partidos`);
  const json = await res.json().catch(() => null);
  const events: Record<string, unknown>[] = json?.events ?? [];

  // La Segunda tiene 22 equipos y 42 jornadas: unos 462 partidos en total. Si vuelven muchos
  // menos, es que el plan gratuito está recortando la respuesta, no que falten partidos de verdad.
  if (events.length > 0 && events.length < 400) {
    throw new TheSportsDbError(
      `TheSportsDB solo devolvió ${events.length} partidos de la temporada (se esperaban ~462): parece un límite del plan gratuito, no partidos que falten de verdad.`
    );
  }

  return events.map((raw) => {
    const e = raw as {
      idEvent: string;
      dateEvent: string;
      strTime?: string;
      strStatus?: string;
      intRound?: string;
      strHomeTeam: string;
      strAwayTeam: string;
      strHomeTeamBadge?: string;
      strAwayTeamBadge?: string;
      intHomeScore?: string | null;
      intAwayScore?: string | null;
    };
    const time = e.strTime && e.strTime !== '' ? e.strTime : '00:00:00';
    return {
      id: TSDB_ID_OFFSET + Number(e.idEvent),
      utcDate: `${e.dateEvent}T${time}Z`,
      status: deriveStatus(e),
      matchday: e.intRound ? Number(e.intRound) : 100,
      homeTeam: { name: e.strHomeTeam, crest: e.strHomeTeamBadge || null },
      awayTeam: { name: e.strAwayTeam, crest: e.strAwayTeamBadge || null },
      homeScore: e.intHomeScore != null && e.intHomeScore !== '' ? Number(e.intHomeScore) : null,
      awayScore: e.intAwayScore != null && e.intAwayScore !== '' ? Number(e.intAwayScore) : null,
    };
  });
}
