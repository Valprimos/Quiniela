import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { currentSeason } from '@/lib/season';
import { isCompetitionCode } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

// Guarda una foto fija de la clasificación final de la temporada actual para esta pandilla.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const competition = isCompetitionCode(body?.competition) ? body.competition : 'PD';
  const season = currentSeason();

  const supabase = db();
  const [{ data: players }, { data: points }] = await Promise.all([
    supabase.from('players').select('id,name').eq('group_id', session.gid),
    supabase.from('player_points').select('player_id,points').eq('competition', competition).eq('season', season),
  ]);
  const total = new Map<string, number>();
  for (const r of points ?? []) total.set(r.player_id, (total.get(r.player_id) ?? 0) + r.points);

  const ranked = (players ?? [])
    .map((p) => ({ id: p.id, name: p.name, points: total.get(p.id) ?? 0 }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'es'));
  if (!ranked.length) return NextResponse.json({ error: 'No hay jugadores que archivar.' }, { status: 400 });

  const rows = ranked.map((r, i) => ({
    group_id: session.gid,
    competition,
    season,
    player_id: r.id,
    player_name: r.name,
    points: r.points,
    pos: i + 1,
  }));
  const { error } = await supabase
    .from('season_archive')
    .upsert(rows, { onConflict: 'group_id,competition,season,player_id' });
  if (error) return NextResponse.json({ error: 'No se pudo archivar la temporada.' }, { status: 500 });
  return NextResponse.json({ ok: true, champion: ranked[0]?.name });
}
