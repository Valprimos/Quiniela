import { NextRequest, NextResponse } from 'next/server';
import {
  clearSession,
  forgetAccount,
  getAccounts,
  getSession,
  rememberAccount,
  saveAccounts,
  setSession,
} from '@/lib/session';
import { avatarVersion, groupNames, loadPlayers } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Ligas guardadas en este dispositivo, con sus datos al día. No exige sesión: así la pantalla de
// entrada puede ofrecer volver a una liga guardada.
export async function GET() {
  const session = await getSession();
  let list = await getAccounts();

  // Quien ya tenía la sesión abierta antes de existir esta lista: se añade su liga actual
  if (session && !list.some((a) => a.pid === session.pid)) {
    const names = await groupNames([session.gid]);
    await rememberAccount({
      pid: session.pid,
      gid: session.gid,
      name: session.name,
      group: names.get(session.gid) ?? 'Mi liga',
      admin: session.admin,
    });
    list = await getAccounts();
  }
  if (!list.length) return NextResponse.json({ accounts: [] });

  const players = await loadPlayers(list.map((a) => a.pid));
  const byId = new Map(players.map((p) => [p.id, p]));
  const groups = await groupNames(players.map((p) => p.group_id));

  // Si alguien ya no existe (expulsado), se quita de la lista
  const alive = list.filter((a) => byId.has(a.pid));
  if (alive.length !== list.length && players.length) await saveAccounts(alive);

  return NextResponse.json({
    accounts: alive.map((a) => {
      const p = byId.get(a.pid)!;
      return {
        pid: a.pid,
        name: p.name,
        group: groups.get(p.group_id) ?? a.group,
        admin: p.is_admin,
        current: session?.pid === a.pid,
        avatar: avatarVersion(p.avatar_updated_at),
      };
    }),
  });
}

// switch: pasar a otra liga guardada. leave: salir de la liga actual (y pasar a otra si queda alguna).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const action = body?.action;

  async function activate(pid: string): Promise<boolean> {
    const [p] = await loadPlayers([pid]);
    if (!p) {
      await forgetAccount(pid);
      return false;
    }
    const names = await groupNames([p.group_id]);
    await setSession(p.id, p.name, p.group_id, p.is_admin);
    await rememberAccount({ pid: p.id, gid: p.group_id, name: p.name, group: names.get(p.group_id) ?? 'Mi liga', admin: p.is_admin });
    return true;
  }

  if (action === 'switch') {
    const pid = String(body?.pid ?? '');
    if (!(await getAccounts()).some((a) => a.pid === pid)) return fail('Esa liga no está guardada en este dispositivo.', 404);
    if (!(await activate(pid))) return fail('Ese jugador ya no existe.', 404);
    return NextResponse.json({ ok: true });
  }

  if (action === 'leave') {
    const session = await getSession();
    if (session) await forgetAccount(session.pid);
    await clearSession();
    for (const a of await getAccounts()) {
      if (await activate(a.pid)) return NextResponse.json({ ok: true, switched: true });
    }
    return NextResponse.json({ ok: true, switched: false });
  }

  return fail('Acción no válida.');
}
