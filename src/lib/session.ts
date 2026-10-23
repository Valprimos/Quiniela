import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

const COOKIE = 'q_session';
const MAX_AGE = 60 * 60 * 24 * 180; // 180 días

export type Session = { pid: string; name: string; gid: string; admin: boolean; exp: number };

function sign(data: string): string {
  return createHmac('sha256', process.env.SESSION_SECRET!).update(data).digest('base64url');
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [data, sig] = raw.split('.');
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const session: Session = JSON.parse(Buffer.from(data, 'base64url').toString());
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export async function setSession(pid: string, name: string, gid: string, admin: boolean): Promise<void> {
  const payload: Session = { pid, name, gid, admin, exp: Date.now() + MAX_AGE * 1000 };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  (await cookies()).set(COOKIE, `${data}.${sign(data)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

// ---------- Cuentas guardadas en este dispositivo (para pasar de una liga a otra sin repetir el login) ----------
// Una cookie firmada y solo para el servidor (httpOnly) con las ligas en las que ya has entrado aquí.
// Cambiar de liga no pide PIN: es lo mismo que mantener la sesión abierta en cada una.

const ACCOUNTS_COOKIE = 'q_accounts';
const MAX_ACCOUNTS = 8;

export type Account = { pid: string; gid: string; name: string; group: string; admin: boolean; exp: number };

export async function getAccounts(): Promise<Account[]> {
  const raw = (await cookies()).get(ACCOUNTS_COOKIE)?.value;
  if (!raw) return [];
  const [data, sig] = raw.split('.');
  if (!data || !sig) return [];
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return [];
  try {
    const list: Account[] = JSON.parse(Buffer.from(data, 'base64url').toString());
    return Array.isArray(list) ? list.filter((a) => a && a.pid && a.exp > Date.now()) : [];
  } catch {
    return [];
  }
}

export async function saveAccounts(list: Account[]): Promise<void> {
  const jar = await cookies();
  if (!list.length) {
    jar.delete(ACCOUNTS_COOKIE);
    return;
  }
  const data = Buffer.from(JSON.stringify(list.slice(0, MAX_ACCOUNTS))).toString('base64url');
  jar.set(ACCOUNTS_COOKIE, `${data}.${sign(data)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

// Añade la liga a la lista (o actualiza sus datos) y la deja la primera
export async function rememberAccount(a: Omit<Account, 'exp'>): Promise<void> {
  const rest = (await getAccounts()).filter((x) => x.pid !== a.pid);
  await saveAccounts([{ ...a, exp: Date.now() + MAX_AGE * 1000 }, ...rest]);
}

export async function forgetAccount(pid: string): Promise<void> {
  await saveAccounts((await getAccounts()).filter((x) => x.pid !== pid));
}
