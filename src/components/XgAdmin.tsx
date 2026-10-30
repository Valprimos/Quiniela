'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Competition = 'PD' | 'CL';
type Match = {
  id: number;
  matchday: number;
  stage: string | null;
  date: string;
  home: string;
  away: string;
  score: string;
  homeXg: number | null;
  awayXg: number | null;
  source: string | null;
};
type Status = { finished: number; withXg: number; matches: Match[] };

async function post(body: unknown): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const res = await fetch('/api/admin/xg', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, ...json };
}

const PAGE_SIZE = 30;
const dateFormatter = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function XgAdmin({ onChanged }: { onChanged: () => void }) {
  const [competition, setCompetition] = useState<Competition>('PD');
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | 'import' | null>(null);
  const [draft, setDraft] = useState<Record<number, { h: string; a: string }>>({});
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(() => {
    fetch(`/api/admin/xg?competition=${competition}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : (setError(null), setStatus(j))))
      .catch(() => setError('No se pudieron cargar los partidos.'));
  }, [competition]);
  useEffect(load, [load]);
  useEffect(() => {
    setDraft({});
    setSearch('');
    setVisibleCount(PAGE_SIZE);
  }, [competition]);

  const matches = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('es');
    return (status?.matches ?? []).filter((m) => !q || `${m.home} ${m.away} ${m.stage ?? ''}`.toLocaleLowerCase('es').includes(q));
  }, [status, search]);

  async function importNow() {
    setBusy('import');
    setMsg(null);
    const r = await post({ action: 'import' });
    setBusy(null);
    if (!r.ok) return setError(r.error ?? 'No se pudo importar.');
    setError(null);
    setMsg(`Importados ${r.imported} partidos de Understat. xG disponible en ${r.found} partidos; faltan ${r.stillMissing} de ${r.finished} finalizados.`);
    load();
    onChanged();
  }

  async function save(m: Match) {
    const d = draft[m.id];
    const homeXg = d?.h ?? (m.homeXg == null ? '' : String(m.homeXg));
    const awayXg = d?.a ?? (m.awayXg == null ? '' : String(m.awayXg));
    setBusy(m.id);
    const r = await post({ action: 'set', matchId: m.id, homeXg, awayXg });
    setBusy(null);
    if (!r.ok) return setError(r.error ?? 'No se pudo guardar.');
    setError(null);
    setMsg(`xG guardado: ${m.home} – ${m.away}.`);
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
      <div className="xg-switch" role="group" aria-label="Competición para editar xG">
        <button type="button" className={competition === 'PD' ? 'seg-btn active' : 'seg-btn'} onClick={() => { setStatus(null); setCompetition('PD'); }}>La Liga</button>
        <button type="button" className={competition === 'CL' ? 'seg-btn active' : 'seg-btn'} onClick={() => { setStatus(null); setCompetition('CL'); }}>Champions</button>
      </div>
      {!status && !error && <p className="muted">Cargando partidos…</p>}
      {status && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            xG cargado en <b>{status.withXg}</b> de {status.finished} partidos finalizados de {competition === 'PD' ? 'La Liga' : 'Champions'}.
            {' '}Puedes añadir o corregir el xG local y visitante en cualquier partido de esta temporada.
          </p>
          {competition === 'PD' && (
            <>
              <button type="button" className="primary" onClick={importNow} disabled={busy !== null}>
                {busy === 'import' ? 'Importando…' : 'Importar xG de Understat'}
              </button>
              <p className="hint">La importación de Understat actualiza los xG automáticos y respeta los que hayas guardado manualmente. Para Champions, introduce los valores manualmente.</p>
            </>
          )}
          <label className="hint xg-search">
            Buscar equipo o fase
            <input value={search} onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }} placeholder="Ej. Barcelona, Arsenal…" />
          </label>
          <h3 className="sh small">Partidos finalizados ({matches.length})</h3>
          {matches.length === 0 ? <p className="muted">No hay partidos finalizados para mostrar.</p> : (
            <ul className="xg-list">
              {matches.slice(0, visibleCount).map((m) => {
                const homeValue = draft[m.id]?.h ?? (m.homeXg == null ? '' : String(m.homeXg));
                const awayValue = draft[m.id]?.a ?? (m.awayXg == null ? '' : String(m.awayXg));
                return (
                  <li key={m.id}>
                    <span className="xg-t">
                      <b>{m.home} – {m.away}</b>
                      <small>{dateFormatter.format(new Date(m.date))} · {competition === 'PD' ? `J${m.matchday}` : (m.stage || `J${m.matchday}`)} · {m.score}{m.source ? ` · ${m.source === 'manual' ? 'manual' : 'Understat'}` : ' · sin xG'}</small>
                    </span>
                    <input
                      inputMode="decimal"
                      placeholder="xG local"
                      aria-label={`xG de ${m.home}`}
                      value={homeValue}
                      onChange={(e) => setDraft((x) => ({ ...x, [m.id]: { h: e.target.value, a: x[m.id]?.a ?? (m.awayXg == null ? '' : String(m.awayXg)) } }))}
                    />
                    <input
                      inputMode="decimal"
                      placeholder="xG visit."
                      aria-label={`xG de ${m.away}`}
                      value={awayValue}
                      onChange={(e) => setDraft((x) => ({ ...x, [m.id]: { h: x[m.id]?.h ?? (m.homeXg == null ? '' : String(m.homeXg)), a: e.target.value } }))}
                    />
                    <button type="button" className="seg-btn" onClick={() => save(m)} disabled={busy !== null || !homeValue || !awayValue}>
                      {busy === m.id ? 'Guardando…' : m.homeXg == null || m.awayXg == null ? 'Guardar' : 'Actualizar'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {matches.length > visibleCount && <button type="button" className="seg-btn" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>Cargar partidos anteriores</button>}
        </>
      )}
    </div>
  );
}
