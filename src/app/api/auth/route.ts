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

  if (mode === 'register') {
    const invite = process.env.INVITE_CODE;
    if (invite && String(body?.inviteCode ?? '').trim() !== invite) {
      return fail('El código de invitación no es correcto.', 403);
    }

    if (group) {
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

      // Se pasan los 4 argumentos requeridos por setSession
      await setSession(data.id, data.name, group.id, false);
      return NextResponse.json({ ok: true });
    }

    const pin_hash = await bcrypt.hash(pin, 10);
    const { data, error } = await supabase
      .from('players')
      .insert({ name, pin_hash })
      .select('id,name')
      .single();

    if (error) {
      if (error.code === '23505') return fail('Ese nombre ya está en uso. Elige otro.');
      return fail('No se pudo crear el jugador. Inténtalo otra vez.', 500);
    }

    // Se pasan los 4 argumentos requeridos por setSession
    await setSession(data.id, data.name, '', false);
    return NextResponse.json({ ok: true });
  }

  // login
  const { data } = await supabase
    .from('players')
    .select('id,name,pin_hash,group_id')
    .eq('name_key', name.toLowerCase())
    .maybeSingle();

  const valid = data ? await bcrypt.compare(pin, data.pin_hash) : false;
  if (!data || !valid) return fail('Nombre o PIN incorrectos.', 401);

  // Se pasan los 4 argumentos requeridos por setSession
  await setSession(data.id, data.name, data.group_id ?? '', false);
  return NextResponse.json({ ok: true });
}
