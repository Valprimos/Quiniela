import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { currentSeason } from '@/lib/season';
import { STAGE_LABEL, isCompetitionCode } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

const PENDING = ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'LIVE'];

// Jornadas de una competición y los partidos de una de ellas. El panel de admin lo usa para
// elegir competición y jornada por su cuenta, sin tener que cambiar la que se ve en la app.
// Sin ?matchday se devuelve la primera jornada con partidos pendientes (o la última).
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const competition = p.get('competition');
  if (!isCompetitionCode(competition)) return NextResponse.json({ error: 'Competición no válida.' }, { status: 400 });

  const { data } = await db()
    .from('matches')
    .select('id,matchday,stage,utc_date,status,home_name,away_name,home_score,away_score,is_pleno,admin_locked,manual_override')
    .eq('competition', competition)
    .eq('season', currentSeason())
    .order('matchday', { ascending: true })
    .order('utc_date', { ascending: true })
    .order('id', { ascending: true });
  const all = data ?? [];

  const byDay = new Map<number, typeof all>();
  for (const m of all) (byDay.get(m.matchday) ?? byDay.set(m.matchday, []).get(m.matchday)!).push(m);
  const days = [...byDay.keys()].sort((a, b) => a - b);
  if (!days.length) return NextResponse.json({ rounds: [], matchday: null, matches: [] });

  const rounds = days.map((d) => {
    const stage = byDay.get(d)![0].stage;
    const label = d >= 100 ? (stage && STAGE_LABEL[stage]) || `Eliminatoria ${d - 99}` : `Jornada ${d}`;
    return { matchday: d, label };
  });

  const asked = Number(p.get('matchday'));
  const matchday = days.includes(asked)
    ? asked
    : days.find((d) => byDay.get(d)!.some((m) => PENDING.includes(m.status))) ?? days[days.length - 1];

  return NextResponse.json({
    rounds,
    matchday,
    matches: byDay.get(matchday)!.map((m) => ({
      id: m.id,
      utcDate: m.utc_date,
      status: m.status,
      home: m.home_name,
      away: m.away_name,
      homeScore: m.home_score,
      awayScore: m.away_score,
      isPleno: !!m.is_pleno,
      adminLocked: !!m.admin_locked,
      manualOverride: !!m.manual_override,
    })),
  });
}
