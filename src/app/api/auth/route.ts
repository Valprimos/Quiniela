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
  const code = String(body?.code ?? '').trim();

  if (name.length < 2 || name.length > 20) return fail('El nombre debe tener entre 2 y 20 caracteres.');
  if (!/^\d{4,6}$/.test(pin)) return fail('El PIN tiene entre 4 y 6 números.');
  if (code.length < 3 || code.length > 30) return fail('El código de pandilla debe tener entre 3 y 30 caracteres.');

  const supabase = db();
  const { data: group } = await supabase
    .from('groups')
    .select('id,name')
    .eq('invite_code', code)
    .maybeSingle();

  // Ya no se crean pandillas nuevas: solo se puede jugar en la que ya existe.
  if (!group) return fail('Código de pandilla incorrecto.', 401);

  if (mode === 'register') {
    const pin_hash = await bcrypt.hash(pin, 10);
    const { data, error } = await supabase
      .from('players')
      .insert({ name, pin_hash, group_id: group.id })
      .select('id,name')
      .single();
    if (error) {
      if (error.code === '23505') return fail('Ese nombre ya está en uso en tu pandilla. Elige otro.');
      return fail('No se pudo crear el jugador. Inténtalo otra vez.', 500);
    }
    await setSession(data.id, data.name, group.id, false);
    return NextResponse.json({ ok: true, groupName: group.name });
  }

  // login
  const { data: player } = await supabase
    .from('players')
    .select('id,name,pin_hash,is_admin')
    .eq('group_id', group.id)
    .eq('name_key', name.toLowerCase())
    .maybeSingle();
  const valid = player ? await bcrypt.compare(pin, player.pin_hash) : false;
  if (!player || !valid) return fail('Nombre o PIN incorrectos.', 401);

  await setSession(player.id, player.name, group.id, player.is_admin);
  return NextResponse.json({ ok: true, groupName: group.name });
}
