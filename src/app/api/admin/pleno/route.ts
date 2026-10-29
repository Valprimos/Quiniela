import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { currentSeason } from '@/lib/season';
import { isCompetitionCode } from '@/lib/competitions';
import { applyPleno, planPleno } from '@/lib/pleno';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const MISSING_TABLE = 'Falta ejecutar supabase/migration-7-pleno-manual.sql en Supabase.';

// Elige a mano el pleno al 15 de una jornada ({ matchId }) o lo devuelve a automático ({ auto: true }).
// Los partidos son comunes a todas las pandillas, así que el cambio se ve en todas.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const competition = isCompetitionCode(body?.competition) ? body.competition : null;
  const matchday = Number(body?.matchday);
  if (!competition || !Number.isInteger(matchday)) return fail('Jornada no válida.');

  const supabase = db();
  const { data } = await supabase
    .from('matches')
    .select('id,matchday,utc_date,status,is_pleno')
    .eq('competition', competition)
    .eq('season', currentSeason())
    .eq('matchday', matchday);
  const rows = data ?? [];
  if (!rows.length) return fail('Esa jornada no tiene partidos.', 404);
  const ids = rows.map((m) => m.id);

  const clear = await supabase.from('pleno_overrides').delete().in('match_id', ids);
  if (clear.error) return fail(MISSING_TABLE, 500);

  if (body?.auto) {
    // Vuelve al penúltimo partido, aunque la jornada ya esté jugada: lo pide un admin a propósito
    await applyPleno(supabase, rows, planPleno(rows, { force: true }));
    return NextResponse.json({ ok: true, auto: true });
  }

  const matchId = Number(body?.matchId);
  if (!ids.includes(matchId)) return fail('Ese partido no es de esta jornada.');

  const ins = await supabase.from('pleno_overrides').insert({ match_id: matchId });
  if (ins.error) return fail(MISSING_TABLE, 500);

  const others = ids.filter((id) => id !== matchId);
  const off = await supabase.from('matches').update({ is_pleno: false }).in('id', others);
  const on = await supabase.from('matches').update({ is_pleno: true }).eq('id', matchId);
  if (off.error || on.error) return fail('No se pudo cambiar el pleno.', 500);
  return NextResponse.json({ ok: true });
}
