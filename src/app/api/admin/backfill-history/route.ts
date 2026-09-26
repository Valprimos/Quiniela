import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { currentSeason } from '@/lib/season';
import { AF_LEAGUE_ID, ApiFootballError, fetchApiFootballMatches } from '@/lib/apifootball';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SeasonResult = { season: number; count?: number; error?: string };

// Trae las últimas temporadas completas (no la actual) de una competición desde
// api-football.com, para sembrar de historial el "cara a cara" entre equipos.
// No toca la sincronización en directo de la temporada actual.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const raw = body?.competition;
  if (raw !== 'PD' && raw !== 'CL') {
    return NextResponse.json({ error: 'Competición no válida.' }, { status: 400 });
  }
  const competition: 'PD' | 'CL' = raw;
  if (!process.env.API_FOOTBALL_KEY) {
    return NextResponse.json({ error: 'Falta la variable de entorno API_FOOTBALL_KEY.' }, { status: 400 });
  }

  const leagueId = AF_LEAGUE_ID[competition];
  const now = currentSeason();
  const seasons = [now - 1, now - 2, now - 3, now - 4];
  const supabase = db();

  const { data: overridden } = await supabase
    .from('matches')
    .select('id')
    .eq('competition', competition)
    .eq('manual_override', true);
  const keepAsIs = new Set((overridden ?? []).map((r) => r.id));

  const results: SeasonResult[] = [];
  for (const season of seasons) {
    try {
      const matches = await fetchApiFootballMatches(leagueId, season);
      const rows = matches
        .filter((m) => !keepAsIs.has(m.id))
        .map((m) => ({
          id: m.id,
          competition,
          season,
          matchday: m.matchday,
          stage: null,
          utc_date: m.utcDate,
          status: m.status,
          home_name: m.homeTeam.name,
          away_name: m.awayTeam.name,
          home_crest: m.homeTeam.crest,
          away_crest: m.awayTeam.crest,
          home_score: m.homeScore,
          away_score: m.awayScore,
          updated_at: new Date().toISOString(),
        }));
      if (rows.length) {
        const { error } = await supabase.from('matches').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
      }
      results.push({ season, count: rows.length });
    } catch (e) {
      const msg = e instanceof ApiFootballError ? e.message : 'Fallo al traer esta temporada';
      results.push({ season, error: msg });
    }
  }

  return NextResponse.json({ results });
}
