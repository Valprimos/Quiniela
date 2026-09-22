import { NextResponse } from 'next/server';
import { getSession, Session } from './session';

// Comprueba sesión + que sea admin de su pandilla. Devuelve la sesión o una respuesta de error ya lista.
export async function requireAdmin(): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!session.admin) return NextResponse.json({ error: 'Solo un admin puede hacer esto.' }, { status: 403 });
  return session;
}
