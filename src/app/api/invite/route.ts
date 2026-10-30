import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Código y nombre de la pandilla de quien lo pide, para armar el enlace y el QR de invitación.
// Cualquier miembro lo ve: ya conoce el código, porque con él se unió.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data } = await db().from('groups').select('name,invite_code').eq('id', session.gid).maybeSingle();
  if (!data) return NextResponse.json({ error: 'No se encontró tu pandilla.' }, { status: 404 });
  return NextResponse.json({ code: data.invite_code, groupName: data.name });
}
