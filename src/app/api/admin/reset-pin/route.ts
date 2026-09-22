import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// Un admin resetea el PIN de un colega que lo ha olvidado (no hace falta el PIN antiguo)
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const playerId = String(body?.playerId ?? '');
  const newPin = String(body?.newPin ?? '');
  if (!/^\d{4,6}$/.test(newPin)) {
    return NextResponse.json({ error: 'El PIN nuevo tiene entre 4 y 6 números.' }, { status: 400 });
  }

  const supabase = db();
  const { data: target } = await supabase
    .from('players')
    .select('id,group_id')
    .eq('id', playerId)
    .maybeSingle();
  if (!target || target.group_id !== session.gid) {
    return NextResponse.json({ error: 'Ese jugador no es de tu pandilla.' }, { status: 404 });
  }

  const { error } = await supabase
    .from('players')
    .update({ pin_hash: await bcrypt.hash(newPin, 10) })
    .eq('id', playerId);
  if (error) return NextResponse.json({ error: 'No se pudo cambiar el PIN.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
