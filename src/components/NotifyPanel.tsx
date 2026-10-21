'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  currentEndpoint,
  currentSubscription,
  pushSupport,
  subscribeBrowser,
  unsubscribeBrowser,
  type PushSupport,
} from '@/lib/pushClient';

const LEADS: [number, string][] = [
  [1, '1 hora antes'],
  [3, '3 horas antes'],
  [12, '12 horas antes'],
  [24, '1 día antes'],
];

type Status = { configured: boolean; subscribed: boolean; leadHours: number };

export default function NotifyPanel({ onClose }: { onClose: () => void }) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const sup = pushSupport();
    setSupport(sup);
    setDenied(typeof Notification !== 'undefined' && Notification.permission === 'denied');
    const endpoint = sup === 'ok' ? await currentEndpoint() : null;
    const qs = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
    const res = await fetch(`/api/push${qs}`, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setStatus(await res.json());
    else setStatus({ configured: false, subscribed: false, leadHours: 3 });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function save(leadHours: number, sub?: PushSubscription) {
    const s = sub ?? (await currentSubscription());
    if (!s) throw new Error('nosub');
    const json = s.toJSON();
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: s.endpoint, keys: json.keys, leadHours }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudieron activar los avisos.');
  }

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error('Los avisos no están configurados en el servidor.');
      const sub = await subscribeBrowser(key);
      await save(status?.leadHours ?? 3, sub);
      setMsg({ ok: true, text: 'Avisos activados en este dispositivo.' });
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setMsg({
        ok: false,
        text:
          m === 'denied'
            ? 'No has dado permiso. Puedes activarlo en los ajustes del navegador para esta web.'
            : m || 'No se pudieron activar los avisos.',
      });
    }
    setBusy(false);
    refresh();
  }

  async function changeLead(hours: number) {
    setStatus((s) => (s ? { ...s, leadHours: hours } : s));
    try {
      await save(hours);
      setMsg({ ok: true, text: 'Antelación guardada.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar.' });
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    const endpoint = await unsubscribeBrowser();
    if (endpoint) {
      await fetch('/api/push', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
    setBusy(false);
    setMsg({ ok: true, text: 'Avisos desactivados en este dispositivo.' });
    refresh();
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const endpoint = await currentEndpoint();
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setBusy(false);
    setMsg(
      res?.ok
        ? { ok: true, text: 'Aviso enviado. Debería llegarte en unos segundos.' }
        : { ok: false, text: body?.error ?? 'No se pudo enviar el aviso.' }
    );
    if (res && !res.ok) refresh();
  }

  let content: React.ReactNode;
  if (!support || !status) {
    content = <p className="muted">Comprobando…</p>;
  } else if (!status.configured) {
    content = <p className="muted">Los avisos aún no están configurados en el servidor.</p>;
  } else if (support === 'ios-install') {
    content = (
      <p className="muted">
        En iPhone los avisos solo funcionan con la web instalada. Pulsa <b>Compartir</b> y luego{' '}
        <b>Añadir a pantalla de inicio</b>, abre la Quiniela desde ese icono y vuelve aquí.
      </p>
    );
  } else if (support === 'unsupported') {
    content = <p className="muted">Este navegador no admite avisos. Prueba con Chrome, Edge, Firefox o Safari actualizado.</p>;
  } else if (denied && !status.subscribed) {
    content = (
      <p className="muted">
        Los avisos están bloqueados para esta web. Actívalos en los ajustes del navegador (permisos del
        sitio) y vuelve aquí.
      </p>
    );
  } else if (!status.subscribed) {
    content = (
      <>
        <p className="muted">
          Te avisamos en este dispositivo cuando se acerque un partido y todavía no lo hayas pronosticado.
        </p>
        <div className="row">
          <button className="primary notify-btn" type="button" disabled={busy} onClick={enable}>
            Activar avisos
          </button>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <div className="field inline">
          <label htmlFor="lead">Avisarme</label>
          <select id="lead" value={status.leadHours} onChange={(e) => changeLead(Number(e.target.value))}>
            {LEADS.map(([h, label]) => (
              <option key={h} value={h}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <p className="hint">
          Antes del primer partido que te falte por pronosticar. Si ya lo tienes todo, no te molestamos.
        </p>
        <div className="row">
          <button className="seg-btn" type="button" disabled={busy} onClick={test}>
            Enviar prueba
          </button>
          <button className="link danger" type="button" disabled={busy} onClick={disable}>
            Desactivar
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="pinpanel notifypanel" aria-label="Avisos">
      <h3 className="sh small">Avisos de jornada</h3>
      {content}
      {msg && (
        <p className={msg.ok ? 'okmsg' : 'notice'} role="status">
          {msg.text}
        </p>
      )}
      <div className="row">
        <button className="link" type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </section>
  );
}
