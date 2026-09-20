import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { setSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const mode = body?.mode === 'register' ? 'register' : 'login';
  const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ');
  const pin = String(body?.pin ?? '');

  if (name.length < 2 || name.length > 20) return fail('El nombre debe tener entre 2 y 20 caracteres.');
  if (!/^\d{4,6}$/.test(pin)) return fail('El PIN tiene entre 4 y 6 números.');

  if (mode === 'register') {
    const invite = process.env.INVITE_CODE;
    if (invite && String(body?.inviteCode ?? '').trim() !== invite) {
      return fail('El código de invitación no es correcto.', 403);
    }
    const pin_hash = await bcrypt.hash(pin, 10);
    const { data, error } = await db()
      .from('players')
      .insert({ name, pin_hash })
      .select('id,name')
      .single();
    if (error) {
      if (error.code === '23505') return fail('Ese nombre ya está en uso. Elige otro.');
      return fail('No se pudo crear el jugador. Inténtalo otra vez.', 500);
    }
    await setSession(data.id, data.name);
    return NextResponse.json({ ok: true });
  }

  const { data } = await db()
    .from('players')
    .select('id,name,pin_hash')
    .eq('name_key', name.toLowerCase())
    .maybeSingle();
  const valid = data ? await bcrypt.compare(pin, data.pin_hash) : false;
  if (!data || !valid) return fail('Nombre o PIN incorrectos.', 401);

  await setSession(data.id, data.name);
  return NextResponse.json({ ok: true });
}
