import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { currentSeason } from '@/lib/season';
import { STAGE_LABEL, isCompetitionCode } from '@/lib/competitions';
import { applyPleno, hasStarted, manualMatchdays, planPleno } from '@/lib/pleno';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function load(competition: string) {
  const { data } = await db()
    .from('matches')
    .select('id,matchday,stage,utc_date,status,home_name,away_name,is_pleno')
    .eq('competition', competition)
    .eq('season', currentSeason());
  return data ?? [];
}

// Jornadas (también las ya jugadas) cuyo pleno no es el penúltimo partido, sin cambiar nada.
// Las jornadas con el pleno elegido a mano no se tocan y se cuentan aparte.
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const competition = req.nextUrl.searchParams.get('competition');
  if (!isCompetitionCode(competition)) return fail('Competición no válida.');

  const rows = await load(competition);
  const all = planPleno(rows, { force: true });
  const manual = await manualMatchdays(db(), rows, all.map((c) => c.matchday));
  const name = (id: number) => {
    const m = rows.find((x) => x.id === id);
    return m ? `${m.home_name} - ${m.away_name}` : null;
  };

  const supabase = db();
  const items = [];
  for (const c of all.filter((x) => !manual.has(x.matchday)).sort((a, b) => a.matchday - b.matchday)) {
    const stage = rows.find((m) => m.matchday === c.matchday)?.stage;
    const label = c.matchday >= 100 ? (stage && STAGE_LABEL[stage]) || `Eliminatoria ${c.matchday - 99}` : `Jornada ${c.matchday}`;
    // Pronósticos puestos en el pleno actual y en el nuevo: son los que cambian de puntos
    const { count } = await supabase
      .from('predictions')
      .select('match_id', { count: 'exact', head: true })
      .in('match_id', [...c.from, c.to]);
    const started = rows.some((m) => (c.from.includes(m.id) || m.id === c.to) && hasStarted(m));
    items.push({
      matchday: c.matchday,
      label,
      from: c.from.map(name).filter(Boolean).join(' / ') || null,
      to: name(c.to),
      predictions: count ?? 0,
      played: started,
    });
  }
  return NextResponse.json({ items, manual: manual.size });
}

// Corrige las jornadas indicadas (o todas las pendientes de corregir si no se indica ninguna).
// Cambia los puntos de quien tenga pronósticos en el pleno antiguo o en el nuevo.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const competition = body?.competition;
  if (!isCompetitionCode(competition)) return fail('Competición no válida.');
  const only = Array.isArray(body?.matchdays) ? body.matchdays.map(Number).filter(Number.isInteger) : undefined;

  const rows = await load(competition);
  let changes = planPleno(rows, { force: true, only });
  const manual = await manualMatchdays(db(), rows, changes.map((c) => c.matchday));
  changes = changes.filter((c) => !manual.has(c.matchday));
  const fixed = await applyPleno(db(), rows, changes);
  return NextResponse.json({ ok: true, fixed });
}
