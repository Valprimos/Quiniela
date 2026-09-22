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
  const groupName = String(body?.groupName ?? '').trim().slice(0, 40);

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
      await setSession(data.id, data.name, group.id, false);
      return NextResponse.json({ ok: true, created: false, groupName: group.name });
    }

    // El código no existe todavía: se crea una pandilla nueva y quien la crea es el admin.
    const { data: newGroup, error: gErr } = await supabase
      .from('groups')
      .insert({ name: groupName || `Pandilla de ${name}`, invite_code: code })
      .select('id,name')
      .single();
    if (gErr) {
      if (gErr.code === '23505') return fail('Ese código de pandilla ya está en uso. Elige otro.');
      return fail('No se pudo crear la pandilla. Inténtalo otra vez.', 500);
    }
    const pin_hash = await bcrypt.hash(pin, 10);
    const { data: player, error: pErr } = await supabase
      .from('players')
      .insert({ name, pin_hash, group_id: newGroup.id, is_admin: true })
      .select('id,name')
      .single();
    if (pErr) return fail('No se pudo crear el jugador. Inténtalo otra vez.', 500);
    await supabase.from('groups').update({ created_by: player.id }).eq('id', newGroup.id);
    await setSession(player.id, player.name, newGroup.id, true);
    return NextResponse.json({ ok: true, created: true, groupName: newGroup.name });
  }

  // login
  if (!group) return fail('Código de pandilla incorrecto.', 401);
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
