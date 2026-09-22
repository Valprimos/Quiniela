import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { isCompetitionCode } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const competition = isCompetitionCode(req.nextUrl.searchParams.get('competition'))
    ? req.nextUrl.searchParams.get('competition')!
    : 'PD';

  const { data } = await db()
    .from('season_archive')
    .select('season,player_name,points,pos')
    .eq('group_id', session.gid)
    .eq('competition', competition)
    .order('season', { ascending: false })
    .order('pos');

  const bySeason = new Map<number, { player_name: string; points: number; pos: number }[]>();
  for (const r of data ?? []) {
    const arr = bySeason.get(r.season) ?? [];
    arr.push(r);
    bySeason.set(r.season, arr);
  }
  const seasons = [...bySeason.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([season, standings]) => ({ season, standings }));

  return NextResponse.json({ seasons });
}
