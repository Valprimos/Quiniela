import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Foto de perfil de un jugador de tu misma pandilla. La dirección lleva ?v=<versión>, así que el
// navegador puede guardarla para siempre: al cambiar la foto cambia la versión.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });
  const { id } = await params;

  const { data } = await db().from('players').select('group_id,avatar').eq('id', id).maybeSingle();
  if (!data || data.group_id !== session.gid || !data.avatar) return new NextResponse(null, { status: 404 });

  const m = /^data:image\/jpeg;base64,(.+)$/.exec(data.avatar as string);
  if (!m) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(m[1], 'base64'), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' },
  });
}
