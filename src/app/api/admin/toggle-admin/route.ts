import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// Da o quita el rol de admin a otro jugador de la pandilla. No se puede cambiar el propio
// rol por esta vía (para no dejar la pandilla sin ningún admin por error).
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const playerId = String(body?.playerId ?? '');
  const admin = Boolean(body?.admin);
  if (playerId === session.pid) {
    return NextResponse.json({ error: 'No puedes cambiar tu propio rol de admin.' }, { status: 400 });
  }

  const supabase = db();
  const { data: target } = await supabase.from('players').select('id,group_id').eq('id', playerId).maybeSingle();
  if (!target || target.group_id !== session.gid) {
    return NextResponse.json({ error: 'Ese jugador no es de tu pandilla.' }, { status: 404 });
  }

  const { error } = await supabase.from('players').update({ is_admin: admin }).eq('id', playerId);
  if (error) return NextResponse.json({ error: 'No se pudo cambiar el rol.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
