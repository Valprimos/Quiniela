import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAccounts, getSession, rememberAccount, setSession } from '@/lib/session';
import { groupNames } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

const MAX_AVATAR_CHARS = 90_000; // ~65 KB de imagen: de sobra para una foto de perfil pequeña

// Cambiar tu nombre y/o tu foto de perfil.
//   { name }                       nombre nuevo
//   { avatar, applyAll? }          foto en data URL JPEG, o null para quitarla
//   (applyAll: la misma foto en todas las ligas guardadas en este dispositivo)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Sesión caducada. Vuelve a entrar.', 401);
  const body = await req.json().catch(() => null);
  if (!body) return fail('Petición no válida.');

  const supabase = db();
  let name = session.name;

  if (body.name !== undefined) {
    const next = String(body.name).trim().replace(/\s+/g, ' ');
    if (next.length < 2 || next.length > 20) return fail('El nombre debe tener entre 2 y 20 caracteres.');
    if (next !== session.name) {
      const { error } = await supabase.from('players').update({ name: next }).eq('id', session.pid);
      if (error) {
        if (error.code === '23505') return fail('Ese nombre ya está en uso en tu pandilla. Elige otro.');
        return fail('No se pudo cambiar el nombre.', 500);
      }
      name = next;
      await setSession(session.pid, name, session.gid, session.admin);
      const names = await groupNames([session.gid]);
      await rememberAccount({ pid: session.pid, gid: session.gid, name, group: names.get(session.gid) ?? 'Mi liga', admin: session.admin });
    }
  }

  let avatar: number | null | undefined;
  if (body.avatar !== undefined) {
    let patch: { avatar: string | null; avatar_updated_at: string | null };
    if (body.avatar === null) {
      patch = { avatar: null, avatar_updated_at: null };
    } else {
      const text = String(body.avatar);
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(text);
      if (!m || text.length > MAX_AVATAR_CHARS) return fail('La foto no es válida o es demasiado grande.');
      const head = Buffer.from(m[1].slice(0, 8), 'base64');
      if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return fail('La foto debe ser una imagen JPEG.');
      patch = { avatar: text, avatar_updated_at: new Date().toISOString() };
    }

    // La misma foto en todas las ligas guardadas aquí (solo las de la lista firmada de este dispositivo)
    const targets = new Set([session.pid]);
    if (body.applyAll) for (const a of await getAccounts()) targets.add(a.pid);

    const { error } = await supabase.from('players').update(patch).in('id', [...targets]);
    if (error) {
      return fail(
        error.code === '42703' || /avatar/i.test(error.message ?? '')
          ? 'Falta ejecutar la migración de la foto de perfil en Supabase (migration-5-perfil.sql).'
          : 'No se pudo guardar la foto.',
        500
      );
    }
    avatar = patch.avatar_updated_at ? new Date(patch.avatar_updated_at).getTime() : null;
  }

  return NextResponse.json({ ok: true, name, ...(avatar !== undefined ? { avatar } : {}) });
}
