import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { rememberAccount, setSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Para comparar nombres de pandilla sin que importen mayúsculas, tildes ni espacios de más
const norm = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  // login: jugador que ya existe · join: jugador nuevo en una pandilla que ya existe · create: pandilla nueva
  const mode = body?.mode === 'create' ? 'create' : body?.mode === 'join' ? 'join' : 'login';
  const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ');
  const pin = String(body?.pin ?? '');
  const code = String(body?.code ?? '').trim();
  const groupName = String(body?.groupName ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);

  if (!groupName) return fail('Escribe el nombre de la pandilla.');
  if (mode === 'create' && groupName.length < 2) return fail('El nombre de la pandilla debe tener entre 2 y 40 caracteres.');
  if (name.length < 2 || name.length > 20) return fail('El nombre debe tener entre 2 y 20 caracteres.');
  if (!/^\d{4,6}$/.test(pin)) return fail('El PIN tiene entre 4 y 6 números.');
  if (code.length < 3 || code.length > 30) return fail('El código de pandilla debe tener entre 3 y 30 caracteres.');

  const supabase = db();
  const { data: found } = await supabase
    .from('groups')
    .select('id,name')
    .eq('invite_code', code)
    .maybeSingle();

  if (mode === 'create') {
    // Crear nunca se une a una pandilla existente: si el código está cogido, se pide otro
    if (found) return fail('Ese código de pandilla ya está en uso. Elige otro.', 409);

    const { data: newGroup, error: gErr } = await supabase
      .from('groups')
      .insert({ name: groupName, invite_code: code })
      .select('id,name')
      .single();

    if (gErr) {
      if (gErr.code === '23505') return fail('Ese código de pandilla ya está en uso. Elige otro.', 409);
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
    await rememberAccount({ pid: player.id, gid: newGroup.id, name: player.name, group: newGroup.name, admin: true });
    return NextResponse.json({ ok: true, created: true, groupName: newGroup.name });
  }

  // join y login: hace falta acertar el nombre Y el código. Un solo mensaje para ambos fallos,
  // así no se puede averiguar qué códigos existen probando.
  const group = found && norm(found.name) === norm(groupName) ? found : null;
  if (!group) return fail('El nombre de la pandilla o el código no coinciden.', 401);

  if (mode === 'join') {
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
    await rememberAccount({ pid: data.id, gid: group.id, name: data.name, group: group.name, admin: false });
    return NextResponse.json({ ok: true, created: false, groupName: group.name });
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
  await rememberAccount({ pid: player.id, gid: group.id, name: player.name, group: group.name, admin: !!player.is_admin });
  return NextResponse.json({ ok: true, groupName: group.name });
}
