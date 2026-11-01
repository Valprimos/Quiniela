import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { fetchAll } from '@/lib/paging';

export const dynamic = 'force-dynamic';

// Copia de seguridad en JSON para no depender solo de Supabase: todos los partidos de todas las temporadas
// (son públicos y comunes a todas las pandillas) y, de la pandilla del admin, sus jugadores, pronósticos y
// archivo de temporadas. Nunca incluye PIN ni fotos de perfil.
export async function GET() {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const supabase = db();
  let failure: string | null = null;
  const fail = (what: string, message: string) => {
    console.error(`Copia de seguridad: error leyendo ${what}`, message);
    failure ??= what;
  };

  const { data: group } = await supabase.from('groups').select('id,name,created_at').eq('id', session.gid).maybeSingle();
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id,name,is_admin,created_at')
    .eq('group_id', session.gid)
    .order('created_at');
  if (playersError) fail('jugadores', playersError.message);
  const playerIds = (players ?? []).map((p) => p.id);

  const matches = await fetchAll<Record<string, unknown>>(async (from, to) => {
    const res = await supabase.from('matches').select('*').order('id').range(from, to);
    if (res.error) fail('partidos', res.error.message);
    return res as { data: Record<string, unknown>[] | null };
  });

  const predictions: Record<string, unknown>[] = [];
  // Por tandas de jugadores para no pasar listas enormes en la URL
  for (let i = 0; i < playerIds.length; i += 50) {
    const ids = playerIds.slice(i, i + 50);
    const rows = await fetchAll<Record<string, unknown>>(async (from, to) => {
      const res = await supabase
        .from('predictions')
        .select('*')
        .in('player_id', ids)
        .order('match_id')
        .order('player_id')
        .range(from, to);
      if (res.error) fail('pronósticos', res.error.message);
      return res as { data: Record<string, unknown>[] | null };
    });
    predictions.push(...rows);
  }

  const archive = await fetchAll<Record<string, unknown>>(async (from, to) => {
    const res = await supabase
      .from('season_archive')
      .select('*')
      .eq('group_id', session.gid)
      .order('season')
      .order('competition')
      .order('pos')
      .range(from, to);
    if (res.error) fail('archivo de temporadas', res.error.message);
    return res as { data: Record<string, unknown>[] | null };
  });

  // Si falta una parte, mejor avisar que entregar una copia incompleta como si estuviera bien
  if (failure) {
    return NextResponse.json({ error: `No se pudo completar la copia (falló: ${failure}). Inténtalo de nuevo.` }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const body = JSON.stringify({
    app: 'quiniela',
    formato: 1,
    exportadoEn: new Date().toISOString(),
    pandilla: group ?? { id: session.gid },
    jugadores: players ?? [],
    partidos: matches,
    pronosticos: predictions,
    archivoTemporadas: archive,
    resumen: {
      jugadores: playerIds.length,
      partidos: matches.length,
      pronosticos: predictions.length,
      archivoTemporadas: archive.length,
    },
  });

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="quiniela-copia-${today}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
