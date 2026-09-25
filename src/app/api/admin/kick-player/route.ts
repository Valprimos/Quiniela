import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// Expulsa a un jugador de la pandilla (borra también sus pronósticos, por la referencia
// en cascada de la base de datos). No se puede expulsar a uno mismo por esta vía.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const playerId = String(body?.playerId ?? '');
  if (playerId === session.pid) {
    return NextResponse.json({ error: 'No puedes expulsarte a ti mismo.' }, { status: 400 });
  }

  const supabase = db();
  const { data: target } = await supabase.from('players').select('id,group_id').eq('id', playerId).maybeSingle();
  if (!target || target.group_id !== session.gid) {
    return NextResponse.json({ error: 'Ese jugador no es de tu pandilla.' }, { status: 404 });
  }

  const { error } = await supabase.from('players').delete().eq('id', playerId);
  if (error) return NextResponse.json({ error: 'No se pudo expulsar al jugador.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
