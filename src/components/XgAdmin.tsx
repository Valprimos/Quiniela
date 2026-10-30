'use client';

import { useCallback, useEffect, useState } from 'react';

type Missing = { id: number; matchday: number; home: string; away: string; score: string };
type Status = { finished: number; withXg: number; missing: Missing[]; missingTotal: number };

async function post(body: unknown): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const res = await fetch('/api/admin/xg', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, ...json };
}

// Herramienta de admin para el índice de suerte: importar el xG de La Liga y, si falla o falta algún
// partido, ponerlo a mano.
export default function XgAdmin({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<number, { h: string; a: string }>>({});

  const load = useCallback(() => {
    fetch('/api/admin/xg', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : (setError(null), setStatus(j))))
      .catch(() => setError('No se pudo cargar.'));
  }, []);
  useEffect(load, [load]);

  async function importNow() {
    setBusy(true);
    setMsg(null);
    const r = await post({ action: 'import' });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? 'No se pudo importar.');
    setError(null);
    setMsg(`Importados ${r.imported} partidos (Understat trae ${r.found} con xG). Faltan ${r.stillMissing} de ${r.finished} terminados.`);
    load();
    onChanged();
  }

  async function save(m: Missing) {
    const d = draft[m.id];
    const r = await post({ action: 'set', matchId: m.id, homeXg: d?.h, awayXg: d?.a });
    if (!r.ok) return setError(r.error ?? 'No se pudo guardar.');
    setError(null);
    setMsg(`Guardado: ${m.home} – ${m.away}.`);
    setDraft((x) => {
      const { [m.id]: _gone, ...rest } = x;
      return rest;
    });
    load();
    onChanged();
  }

  return (
    <div>
      {error && <p className="notice">{error}</p>}
      {msg && <p className="okmsg">{msg}</p>}
      {!status && !error && <p className="muted">Cargando…</p>}
      {status && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            Con xG: <b>{status.withXg}</b> de {status.finished} partidos terminados de La Liga. El xG alimenta el índice de suerte
            (Estadísticas &gt; Grupo).
          </p>
          <button type="button" className="primary" onClick={importNow} disabled={busy}>
            {busy ? 'Importando…' : 'Importar xG de Understat'}
          </button>
          <p className="hint">
            Understat no tiene API oficial: si falla o su web cambia, pon el xG a mano abajo. Revisa sus condiciones de uso. Lo
            puesto a mano no lo pisa la importación. La Champions no tiene xG.
          </p>

          {status.missing.length > 0 && (
            <>
              <h3 className="sh small">Sin xG ({status.missingTotal})</h3>
              <ul className="xg-list">
                {status.missing.map((m) => (
                  <li key={m.id}>
                    <span className="xg-t">
                      <b>
                        {m.home} – {m.away}
                      </b>
                      <small>
                        J{m.matchday} · {m.score}
                      </small>
                    </span>
                    <input
                      inputMode="decimal"
                      placeholder="xG local"
                      aria-label={`xG de ${m.home}`}
                      value={draft[m.id]?.h ?? ''}
                      onChange={(e) => setDraft((x) => ({ ...x, [m.id]: { h: e.target.value, a: x[m.id]?.a ?? '' } }))}
                    />
                    <input
                      inputMode="decimal"
                      placeholder="xG visit."
                      aria-label={`xG de ${m.away}`}
                      value={draft[m.id]?.a ?? ''}
                      onChange={(e) => setDraft((x) => ({ ...x, [m.id]: { h: x[m.id]?.h ?? '', a: e.target.value } }))}
                    />
                    <button type="button" className="seg-btn" onClick={() => save(m)} disabled={!draft[m.id]?.h || !draft[m.id]?.a}>
                      Guardar
                    </button>
                  </li>
                ))}
              </ul>
              {status.missingTotal > status.missing.length && <p className="hint">Se muestran los {status.missing.length} más recientes.</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
