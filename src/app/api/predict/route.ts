import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { isLocked } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Sesión caducada. Vuelve a entrar.', 401);

  const body = await req.json().catch(() => null);
  const matchId = Number(body?.matchId);
  const pick = body?.pick;
  const hasPlenoGuess = body?.plenoHome != null && body?.plenoAway != null;
  if (!Number.isInteger(matchId)) return fail('Partido no válido.');

  let plenoHome = 0;
  let plenoAway = 0;
  if (hasPlenoGuess) {
    plenoHome = Number(body.plenoHome);
    plenoAway = Number(body.plenoAway);
    if (
      !Number.isInteger(plenoHome) ||
      !Number.isInteger(plenoAway) ||
      plenoHome < 0 ||
      plenoAway < 0 ||
      plenoHome > 20 ||
      plenoAway > 20
    ) {
      return fail('El marcador no es válido.');
    }
  } else if (!['1', 'X', '2'].includes(pick)) {
    return fail('Pronóstico no válido.');
  }

  const supabase = db();
  const { data: match } = await supabase
    .from('matches')
    .select('id,status,utc_date,admin_locked,is_pleno')
    .eq('id', matchId)
    .maybeSingle();
  if (!match) return fail('Partido no encontrado.', 404);
  if (isLocked(match.status, match.utc_date, match.admin_locked)) {
    return fail('Este partido ya está cerrado.', 409);
  }
  if (hasPlenoGuess && !match.is_pleno) return fail('Este partido no es el pleno al 15.');
  if (!hasPlenoGuess && match.is_pleno) return fail('Este partido es el pleno al 15: pon un marcador exacto.');

  // En el pleno al 15 el marcador exacto determina también el 1X2, para mantenerlo coherente.
  const finalPick = hasPlenoGuess ? (plenoHome > plenoAway ? '1' : plenoHome < plenoAway ? '2' : 'X') : pick;

  const { error } = await supabase.from('predictions').upsert(
    {
      player_id: session.pid,
      match_id: matchId,
      pick: finalPick,
      ...(hasPlenoGuess ? { pleno_home: plenoHome, pleno_away: plenoAway } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'player_id,match_id' }
  );
  if (error) return fail('No se pudo guardar el pronóstico.', 500);
  return NextResponse.json({ ok: true });
}

// Quitar un pronóstico ya marcado (solo mientras el partido siga abierto)
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Sesión caducada. Vuelve a entrar.', 401);

  const body = await req.json().catch(() => null);
  const matchId = Number(body?.matchId);
  if (!Number.isInteger(matchId)) return fail('Partido no válido.');

  const { data: match } = await db()
    .from('matches')
    .select('id,status,utc_date,admin_locked')
    .eq('id', matchId)
    .maybeSingle();
  if (!match) return fail('Partido no encontrado.', 404);
  if (isLocked(match.status, match.utc_date, match.admin_locked)) {
    return fail('Este partido ya está cerrado.', 409);
  }

  const { error } = await db().from('predictions').delete().eq('player_id', session.pid).eq('match_id', matchId);
  if (error) return fail('No se pudo quitar el pronóstico.', 500);
  return NextResponse.json({ ok: true });
}
