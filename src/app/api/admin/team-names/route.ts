import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { fetchAll } from '@/lib/paging';
import { normalizeTeamName } from '@/lib/league';

export const dynamic = 'force-dynamic';

// Lista, para una competición, qué nombres de equipo hay guardados de verdad en la base de
// datos (agrupados por su forma normalizada), para diagnosticar sin tener que usar el SQL
// Editor de Supabase. Si un mismo equipo aparece con dos nombres distintos sin agrupar,
// significa que el normalizador no los está igualando.
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const competition = req.nextUrl.searchParams.get('competition') === 'CL' ? 'CL' : 'PD';
  const supabase = db();
  const rows = await fetchAll<{ season: number; home_name: string; away_name: string }>((from, to) =>
    supabase.from('matches').select('season,home_name,away_name').eq('competition', competition).range(from, to)
  );

  const byKey = new Map<string, { names: Set<string>; seasons: Set<number>; count: number }>();
  for (const r of rows) {
    for (const name of [r.home_name, r.away_name]) {
      const key = normalizeTeamName(name);
      let g = byKey.get(key);
      if (!g) byKey.set(key, (g = { names: new Set(), seasons: new Set(), count: 0 }));
      g.names.add(name);
      g.seasons.add(r.season);
      g.count++;
    }
  }

  const teams = [...byKey.entries()]
    .map(([key, g]) => ({
      key,
      names: [...g.names],
      seasons: [...g.seasons].sort((a, b) => a - b),
      matches: g.count,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return NextResponse.json({ competition, teams });
}
