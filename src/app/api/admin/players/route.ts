import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const { data } = await db()
    .from('players')
    .select('id,name,is_admin,created_at')
    .eq('group_id', session.gid)
    .order('created_at');
  return NextResponse.json({ players: data ?? [] });
}
