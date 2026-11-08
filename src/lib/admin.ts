import { NextResponse } from 'next/server';
import { db } from './db';
import { getSession, Session } from './session';

// Comprueba sesión + que sea admin de su pandilla. Devuelve la sesión o una respuesta de error ya lista.
// Vale para todo lo que afecta SOLO a la pandilla del admin (jugadores, PIN, pronósticos, premios...).
export async function requireAdmin(): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!session.admin) return NextResponse.json({ error: 'Solo un admin puede hacer esto.' }, { status: 403 });
  return session;
}

// ---------- Administrador general ----------
// Los partidos, resultados, xG, el pleno al 15 y los bloqueos de jornada son COMPARTIDOS por todas las
// pandillas. Como cualquiera puede crear una pandilla (y queda como admin de ella), ser admin de pandilla
// no basta para tocarlos: hace falta ser administrador general.
//
// Quién lo es:
//   1. Si existe SUPERADMIN_PLAYER_IDS (ids de jugador separados por comas), solo esos jugadores.
//   2. Si no, los admins de la pandilla más antigua (la primera que se creó, que es la tuya).
// En ambos casos se comprueba en la base de datos que el jugador sigue existiendo y sigue siendo admin,
// así que quitar el rol de admin surte efecto al instante y no cuando caduque la cookie.

let oldestGroup: { id: string; at: number } | null = null;
const OLDEST_TTL_MS = 60_000;

async function oldestGroupId(): Promise<string | null> {
  if (oldestGroup && Date.now() - oldestGroup.at < OLDEST_TTL_MS) return oldestGroup.id;
  const { data } = await db().from('groups').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!data) return null;
  oldestGroup = { id: data.id as string, at: Date.now() };
  return oldestGroup.id;
}

export async function isSuperAdmin(session: Session): Promise<boolean> {
  if (!session.admin) return false;
  const { data: player } = await db()
    .from('players')
    .select('id,group_id,is_admin')
    .eq('id', session.pid)
    .maybeSingle();
  if (!player || !player.is_admin) return false;

  const configured = (process.env.SUPERADMIN_PLAYER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length) return configured.includes(player.id as string);

  return (await oldestGroupId()) === player.group_id;
}

// Igual que requireAdmin, pero para lo que afecta a todas las pandillas.
export async function requireSuperAdmin(): Promise<Session | NextResponse> {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  if (!(await isSuperAdmin(session))) {
    return NextResponse.json({ error: 'Solo el administrador general puede hacer esto.' }, { status: 403 });
  }
  return session;
}
