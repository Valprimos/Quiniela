import { db } from './db';
import { COMPETITIONS } from './competitions';
import { currentSeason } from './season';

const PENDING = ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'LIVE'];

// Competición con el partido más próximo (o ya en juego): la que debe abrirse al entrar en la app.
// Si juega antes la Champions que La Liga, se abre en Champions. Sin partidos, la primera de la lista.
export async function soonestCompetition(
  supabase: ReturnType<typeof db>,
  season: ReturnType<typeof currentSeason>,
  now = Date.now()
): Promise<string> {
  const { data } = await supabase
    .from('matches')
    .select('competition,utc_date')
    .eq('season', season)
    .in('competition', COMPETITIONS.map((c) => c.code))
    .in('status', PENDING)
    // un partido en juego empezó hace menos de ~3 h; uno "pendiente" más antiguo es un aplazado
    .gte('utc_date', new Date(now - 3 * 3600e3).toISOString())
    .order('utc_date', { ascending: true })
    .limit(1);
  return data?.[0]?.competition ?? COMPETITIONS[0].code;
}
