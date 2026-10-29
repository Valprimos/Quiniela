import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { currentSeason } from '@/lib/season';
import { isCompetitionCode } from '@/lib/competitions';
import { NOT_PLAYED } from '@/lib/pleno';

export const dynamic = 'force-dynamic';

// Quién de la pandilla no ha pronosticado todavía (o no del todo) una jornada.
// Un pleno con 1X2 pero sin marcador exacto cuenta como sin pronosticar.
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const competition = p.get('competition');
  const matchday = Number(p.get('matchday'));
  if (!isCompetitionCode(competition) || !Number.isInteger(matchday)) {
    return NextResponse.json({ error: 'Jornada no válida.' }, { status: 400 });
  }

  const supabase = db();
  const [{ data: matchRows }, { data: playerRows }] = await Promise.all([
    supabase
      .from('matches')
      .select('id,status,is_pleno')
      .eq('competition', competition)
      .eq('season', currentSeason())
      .eq('matchday', matchday),
    supabase.from('players').select('id,name').eq('group_id', session.gid).order('name'),
  ]);
  const matches = (matchRows ?? []).filter((m) => !NOT_PLAYED.includes(m.status));
  const players = playerRows ?? [];
  const total = matches.length;
  if (!total || !players.length) return NextResponse.json({ total, players: [] });

  const { data: preds } = await supabase
    .from('predictions')
    .select('player_id,match_id,pleno_home,pleno_away')
    .in('match_id', matches.map((m) => m.id))
    .in('player_id', players.map((x) => x.id))
    .limit(5000);

  const pleno = new Set(matches.filter((m) => m.is_pleno).map((m) => m.id));
  const made = new Map<string, number>();
  for (const x of preds ?? []) {
    if (pleno.has(x.match_id) && (x.pleno_home == null || x.pleno_away == null)) continue;
    made.set(x.player_id, (made.get(x.player_id) ?? 0) + 1);
  }

  return NextResponse.json({
    total,
    players: players
      .map((x) => ({ id: x.id, name: x.name, made: made.get(x.id) ?? 0 }))
      .sort((a, b) => a.made - b.made || a.name.localeCompare(b.name)),
  });
}
