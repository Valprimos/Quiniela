import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { pushConfigured } from '@/lib/push';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const ALLOWED_LEADS = [1, 3, 12, 24];

// ¿Este dispositivo está suscrito? y con qué antelación
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Sesión caducada. Vuelve a entrar.', 401);
  const endpoint = req.nextUrl.searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ configured: pushConfigured(), subscribed: false });
  const { data } = await db()
    .from('push_subscriptions')
    .select('lead_hours')
    .eq('endpoint', endpoint)
    .eq('player_id', session.pid)
    .maybeSingle();
  return NextResponse.json({
    configured: pushConfigured(),
    subscribed: !!data,
    leadHours: data?.lead_hours ?? 3,
  });
}

// Activar los avisos en este dispositivo, o cambiar la antelación
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Sesión caducada. Vuelve a entrar.', 401);
  if (!pushConfigured()) return fail('Los avisos no están configurados en el servidor.', 503);

  const body = await req.json().catch(() => null);
  const endpoint = String(body?.endpoint ?? '');
  const p256dh = String(body?.keys?.p256dh ?? '');
  const auth = String(body?.keys?.auth ?? '');
  const leadHours = Number(body?.leadHours ?? 3);
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) {
    return fail('Suscripción no válida.');
  }
  if (!ALLOWED_LEADS.includes(leadHours)) return fail('Antelación no válida.');

  // Si el dispositivo estaba suscrito con otro jugador (móvil compartido), pasa al actual
  const { error } = await db()
    .from('push_subscriptions')
    .upsert(
      {
        player_id: session.pid,
        endpoint,
        p256dh,
        auth,
        lead_hours: leadHours,
        user_agent: (req.headers.get('user-agent') ?? '').slice(0, 200),
      },
      { onConflict: 'endpoint' }
    );
  if (error) return fail('No se pudieron activar los avisos.', 500);
  return NextResponse.json({ ok: true, leadHours });
}

// Desactivar los avisos en este dispositivo
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: true }); // al salir de sesión da igual
  const body = await req.json().catch(() => null);
  const endpoint = String(body?.endpoint ?? '');
  if (!endpoint) return fail('Falta el dispositivo.');
  await db().from('push_subscriptions').delete().eq('endpoint', endpoint).eq('player_id', session.pid);
  return NextResponse.json({ ok: true });
}
