'use client';

import { FormEvent, useEffect, useState } from 'react';

type Player = { id: string; name: string; is_admin: boolean };
type MatchOpt = { id: number; home: { name: string }; away: { name: string }; homeScore: number | null; awayScore: number | null };

async function call(url: string, body: unknown): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, ...json };
}

export default function AdminPanel({
  competition,
  matchday,
  matches,
  onClose,
  onChanged,
}: {
  competition: string;
  matchday: number;
  matches: MatchOpt[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [resetFor, setResetFor] = useState('');
  const [resetPin, setResetPin] = useState('');

  const [fixMatch, setFixMatch] = useState('');
  const [fixHome, setFixHome] = useState('');
  const [fixAway, setFixAway] = useState('');

  const [locked, setLocked] = useState(false);

  useEffect(() => {
    fetch('/api/admin/players')
      .then((r) => r.json())
      .then((j) => setPlayers(j.players ?? []));
  }, []);

  async function resetPinSubmit(e: FormEvent) {
    e.preventDefault();
    const r = await call('/api/admin/reset-pin', { playerId: resetFor, newPin: resetPin });
    setMsg(r.ok ? 'PIN cambiado.' : r.error ?? 'No se pudo cambiar el PIN.');
    if (r.ok) setResetPin('');
  }

  async function fixResultSubmit(e: FormEvent) {
    e.preventDefault();
    const r = await call('/api/admin/fix-result', {
      matchId: Number(fixMatch),
      homeScore: Number(fixHome),
      awayScore: Number(fixAway),
      status: 'FINISHED',
    });
    setMsg(r.ok ? 'Resultado corregido.' : r.error ?? 'No se pudo corregir.');
    if (r.ok) onChanged();
  }

  async function toggleLock(next: boolean) {
    const r = await call('/api/admin/lock-matchday', { competition, matchday, locked: next });
    setMsg(r.ok ? (next ? 'Jornada bloqueada.' : 'Jornada desbloqueada.') : r.error ?? 'No se pudo cambiar.');
    if (r.ok) {
      setLocked(next);
      onChanged();
    }
  }

  async function archiveSeason() {
    const r = await call('/api/admin/archive-season', { competition });
    setMsg(r.ok ? `Temporada archivada. Campeón: ${r.champion}.` : r.error ?? 'No se pudo archivar.');
  }

  return (
    <div className="pinpanel admin">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="sh" style={{ margin: 0 }}>
          Panel de admin
        </h2>
        <button type="button" className="link" onClick={onClose}>
          Cerrar
        </button>
      </div>
      {msg && <p className="okmsg">{msg}</p>}

      <h3 className="sh small">Resetear el PIN de un jugador</h3>
      <form className="row" onSubmit={resetPinSubmit}>
        <select value={resetFor} onChange={(e) => setResetFor(e.target.value)} required>
          <option value="" disabled>
            Elige un jugador
          </option>
          {(players ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          placeholder="PIN nuevo"
          inputMode="numeric"
          value={resetPin}
          onChange={(e) => setResetPin(e.target.value.replace(/\D/g, ''))}
          maxLength={6}
          required
        />
        <button className="primary" type="submit">
          Cambiar
        </button>
      </form>

      <h3 className="sh small">Corregir un resultado (jornada {matchday})</h3>
      <form className="row" onSubmit={fixResultSubmit}>
        <select value={fixMatch} onChange={(e) => setFixMatch(e.target.value)} required>
          <option value="" disabled>
            Elige un partido
          </option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {m.home.name} - {m.away.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Local"
          inputMode="numeric"
          value={fixHome}
          onChange={(e) => setFixHome(e.target.value.replace(/\D/g, ''))}
          style={{ width: 56 }}
          required
        />
        <input
          placeholder="Visit."
          inputMode="numeric"
          value={fixAway}
          onChange={(e) => setFixAway(e.target.value.replace(/\D/g, ''))}
          style={{ width: 56 }}
          required
        />
        <button className="primary" type="submit">
          Corregir
        </button>
      </form>

      <h3 className="sh small">Esta jornada</h3>
      <div className="row">
        <button type="button" className="seg-btn" onClick={() => toggleLock(true)} disabled={locked}>
          Bloquear
        </button>
        <button type="button" className="seg-btn" onClick={() => toggleLock(false)} disabled={!locked}>
          Desbloquear
        </button>
      </div>

      <h3 className="sh small">Temporada</h3>
      <button type="button" className="primary" onClick={archiveSeason}>
        Archivar temporada actual
      </button>
      <p className="hint">
        Guarda la clasificación de hoy en el archivo. Hazlo cuando termine la temporada, antes de que
        empiece la siguiente.
      </p>
    </div>
  );
}
