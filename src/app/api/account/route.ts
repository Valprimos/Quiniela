import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Cambiar el PIN (hay que conocer el actual)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Sesión caducada. Vuelve a entrar.', 401);

  const body = await req.json().catch(() => null);
  const pin = String(body?.pin ?? '');
  const newPin = String(body?.newPin ?? '');
  if (!/^\d{4,6}$/.test(newPin)) return fail('El PIN nuevo tiene entre 4 y 6 números.');

  const { data } = await db().from('players').select('pin_hash').eq('id', session.pid).maybeSingle();
  if (!data || !(await bcrypt.compare(pin, data.pin_hash))) return fail('El PIN actual no es correcto.', 403);

  const { error } = await db()
    .from('players')
    .update({ pin_hash: await bcrypt.hash(newPin, 10) })
    .eq('id', session.pid);
  if (error) return fail('No se pudo cambiar el PIN.', 500);
  return NextResponse.json({ ok: true });
}
