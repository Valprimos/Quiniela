import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { pushConfigured, sendPush } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Manda un aviso de prueba a este dispositivo
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sesión caducada. Vuelve a entrar.' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: 'Los avisos no están configurados.' }, { status: 503 });

  const body = await req.json().catch(() => null);
  const endpoint = String(body?.endpoint ?? '');
  const { data } = await db()
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('endpoint', endpoint)
    .eq('player_id', session.pid)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: 'Este dispositivo no tiene los avisos activados.' }, { status: 404 });

  const outcome = await sendPush(data, {
    title: 'Quiniela',
    body: 'Así te llegarán los avisos cuando se acerque una jornada.',
    url: '/',
    tag: 'quiniela-prueba',
  });
  if (outcome === 'gone') {
    await db().from('push_subscriptions').delete().eq('id', data.id);
    return NextResponse.json({ error: 'El navegador ha cancelado los avisos. Actívalos de nuevo.' }, { status: 410 });
  }
  if (outcome === 'error') return NextResponse.json({ error: 'No se pudo enviar el aviso.' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
