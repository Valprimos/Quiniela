import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { currentSeason } from '@/lib/season';
import { isCompetitionCode } from '@/lib/competitions';
import { isLocked } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// El jugador tiene que ser de la pandilla del admin
async function ownPlayer(playerId: string, gid: string) {
  const { data } = await db().from('players').select('id,group_id').eq('id', playerId).maybeSingle();
  return data && data.group_id === gid ? data : null;
}

// Partidos de una jornada con el pronóstico que tiene puesto un jugador
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const playerId = p.get('playerId') ?? '';
  const competition = p.get('competition');
  const matchday = Number(p.get('matchday'));
  if (!isCompetitionCode(competition) || !Number.isInteger(matchday)) return fail('Jornada no válida.');
  if (!(await ownPlayer(playerId, session.gid))) return fail('Ese jugador no es de tu pandilla.', 404);

  const supabase = db();
  const { data: matches } = await supabase
    .from('matches')
    .select('id,utc_date,status,home_name,away_name,home_score,away_score,is_pleno,admin_locked')
    .eq('competition', competition)
    .eq('season', currentSeason())
    .eq('matchday', matchday)
    .order('utc_date', { ascending: true })
    .order('id', { ascending: true });
  const rows = matches ?? [];

  const { data: preds } = rows.length
    ? await supabase
        .from('predictions')
        .select('match_id,pick,pleno_home,pleno_away')
        .eq('player_id', playerId)
        .in('match_id', rows.map((m) => m.id))
    : { data: [] };
  const byMatch = new Map((preds ?? []).map((x) => [x.match_id, x]));

  return NextResponse.json({
    matches: rows.map((m) => {
      const pr = byMatch.get(m.id);
      return {
        id: m.id,
        utcDate: m.utc_date,
        status: m.status,
        home: m.home_name,
        away: m.away_name,
        homeScore: m.home_score,
        awayScore: m.away_score,
        isPleno: !!m.is_pleno,
        locked: isLocked(m.status, m.utc_date, m.admin_locked),
        pick: pr?.pick ?? null,
        plenoHome: pr?.pleno_home ?? null,
        plenoAway: pr?.pleno_away ?? null,
      };
    }),
  });
}

// Pone o cambia el pronóstico de un jugador, aunque el partido esté cerrado o ya terminado.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const playerId = String(body?.playerId ?? '');
  const matchId = Number(body?.matchId);
  if (!Number.isInteger(matchId)) return fail('Partido no válido.');
  if (!(await ownPlayer(playerId, session.gid))) return fail('Ese jugador no es de tu pandilla.', 404);

  const supabase = db();
  const { data: match } = await supabase.from('matches').select('id,is_pleno').eq('id', matchId).maybeSingle();
  if (!match) return fail('Partido no encontrado.', 404);

  const hasScore = body?.plenoHome != null && body?.plenoAway != null;
  let pick: string;
  let plenoHome: number | null = null;
  let plenoAway: number | null = null;
  if (match.is_pleno) {
    // Igual que cuando juega el propio jugador: en el pleno al 15 se da el marcador exacto
    if (!hasScore) return fail('Este partido es el pleno al 15: pon un marcador exacto.');
    plenoHome = Number(body.plenoHome);
    plenoAway = Number(body.plenoAway);
    const bad = (n: number) => !Number.isInteger(n) || n < 0 || n > 20;
    if (bad(plenoHome) || bad(plenoAway)) return fail('El marcador no es válido.');
    pick = plenoHome > plenoAway ? '1' : plenoHome < plenoAway ? '2' : 'X';
  } else {
    if (hasScore) return fail('Este partido no es el pleno al 15.');
    if (!['1', 'X', '2'].includes(body?.pick)) return fail('Pronóstico no válido.');
    pick = body.pick;
  }

  const { error } = await supabase.from('predictions').upsert(
    {
      player_id: playerId,
      match_id: matchId,
      pick,
      pleno_home: plenoHome,
      pleno_away: plenoAway,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'player_id,match_id' }
  );
  if (error) return fail('No se pudo guardar el pronóstico.', 500);
  return NextResponse.json({ ok: true, pick, plenoHome, plenoAway });
}

// Quita un pronóstico (también en partidos cerrados)
export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const playerId = String(body?.playerId ?? '');
  const matchId = Number(body?.matchId);
  if (!Number.isInteger(matchId)) return fail('Partido no válido.');
  if (!(await ownPlayer(playerId, session.gid))) return fail('Ese jugador no es de tu pandilla.', 404);

  const { error } = await db().from('predictions').delete().eq('player_id', playerId).eq('match_id', matchId);
  if (error) return fail('No se pudo quitar el pronóstico.', 500);
  return NextResponse.json({ ok: true });
}
