import webpush from 'web-push';
import { db } from './db';
import { currentSeason } from './season';
import { OpenMatch, Reminder, Sub, planReminders } from './reminders';

export type Payload = Reminder['payload'];

let configured = false;
export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function setup(): void {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

// 'gone' = el navegador ya no acepta esa suscripción (hay que borrarla); 'error' = fallo puntual
export async function sendPush(sub: SubRow, payload: Payload): Promise<'ok' | 'gone' | 'error'> {
  setup();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 3, urgency: 'high' } // si el móvil está apagado, no tiene sentido entregarlo tarde
    );
    return 'ok';
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? 'gone' : 'error';
  }
}

export type RunResult = {
  subscriptions: number;
  planned: number;
  sent: number;
  removed: number;
  failed: number;
  dry?: { subId: string; body: string }[];
};

// Revisa los partidos que están a punto de empezar y avisa a quien no haya pronosticado.
export async function runReminders(dry = false): Promise<RunResult> {
  const supabase = db();
  const now = Date.now();
  const result: RunResult = { subscriptions: 0, planned: 0, sent: 0, removed: 0, failed: 0 };

  const { data: subRows } = await supabase
    .from('push_subscriptions')
    .select('id,player_id,endpoint,p256dh,auth,lead_hours');
  const rows = subRows ?? [];
  result.subscriptions = rows.length;
  if (!rows.length) return result;

  // Partidos aún abiertos de los próximos 10 días (son pocos: unas decenas)
  const { data: matchRows } = await supabase
    .from('matches')
    .select('id,competition,matchday,stage,utc_date,status,admin_locked')
    .eq('season', currentSeason())
    .in('status', ['SCHEDULED', 'TIMED'])
    .gt('utc_date', new Date(now).toISOString())
    .lte('utc_date', new Date(now + 10 * 86400e3).toISOString());
  const matches = (matchRows ?? []) as OpenMatch[];
  if (!matches.length) return result;

  const playerIds = [...new Set(rows.map((r) => r.player_id as string))];
  const { data: predRows } = await supabase
    .from('predictions')
    .select('player_id,match_id')
    .in('player_id', playerIds)
    .in('match_id', matches.map((m) => m.id));
  const predicted = new Set((predRows ?? []).map((p) => `${p.player_id}:${p.match_id}`));

  const { data: sentRows } = await supabase
    .from('push_sent')
    .select('subscription_id,key')
    .in('subscription_id', rows.map((r) => r.id));
  const sent = new Set((sentRows ?? []).map((s) => `${s.subscription_id}|${s.key}`));

  const subs: Sub[] = rows.map((r) => ({ id: r.id, playerId: r.player_id, leadHours: r.lead_hours }));
  const plan = planReminders({ now, matches, subs, predicted, sent });
  result.planned = plan.length;

  if (dry) {
    result.dry = plan.map((p) => ({ subId: p.subId, body: p.payload.body }));
    return result;
  }
  if (!plan.length) {
    // Limpieza de avisos viejos
    await supabase.from('push_sent').delete().lt('sent_at', new Date(now - 30 * 86400e3).toISOString());
    return result;
  }
  if (!pushConfigured()) return result;

  const byId = new Map(rows.map((r) => [r.id as string, r as SubRow]));
  for (const r of plan) {
    // Se reservan las claves ANTES de enviar: si dos ejecuciones del cron coinciden, solo una avisa
    const { data: claimed } = await supabase
      .from('push_sent')
      .upsert(
        r.keys.map((key) => ({ subscription_id: r.subId, key })),
        { onConflict: 'subscription_id,key', ignoreDuplicates: true }
      )
      .select('key');
    if (!claimed?.length) continue;

    const outcome = await sendPush(byId.get(r.subId)!, r.payload);
    if (outcome === 'ok') {
      result.sent++;
    } else if (outcome === 'gone') {
      await supabase.from('push_subscriptions').delete().eq('id', r.subId);
      result.removed++;
    } else {
      // Fallo puntual: se libera la reserva para reintentarlo en la próxima pasada
      await supabase
        .from('push_sent')
        .delete()
        .eq('subscription_id', r.subId)
        .in('key', claimed.map((c) => c.key as string));
      result.failed++;
    }
  }
  return result;
}
