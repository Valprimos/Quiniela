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

function PlayerRow({
  player,
  isSelf,
  onChanged,
}: {
  player: Player;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmKick, setConfirmKick] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function doReset(e: FormEvent) {
    e.preventDefault();
    const r = await call('/api/admin/reset-pin', { playerId: player.id, newPin: pin });
    setMsg(r.ok ? 'PIN cambiado.' : (r.error as string) ?? 'No se pudo cambiar el PIN.');
    if (r.ok) {
      setPin('');
      setResetOpen(false);
    }
  }

  async function doToggleAdmin() {
    const r = await call('/api/admin/toggle-admin', { playerId: player.id, admin: !player.is_admin });
    if (r.ok) onChanged();
    else setMsg((r.error as string) ?? 'No se pudo cambiar el rol.');
  }

  async function doKick() {
    if (!confirmKick) {
      setConfirmKick(true);
      return;
    }
    const r = await call('/api/admin/kick-player', { playerId: player.id });
    if (r.ok) onChanged();
    else setMsg((r.error as string) ?? 'No se pudo expulsar al jugador.');
  }

  return (
    <li className="adminplayer">
      <div className="row adminplayer-head">
        <span className="pname" style={{ fontSize: 15 }}>
          {player.name}
          {player.is_admin && <span className="badge">Admin</span>}
        </span>
        <div className="row">
          <button type="button" className="link" onClick={() => setResetOpen((v) => !v)}>
            PIN
          </button>
          {!isSelf && (
            <button type="button" className="link" onClick={doToggleAdmin}>
              {player.is_admin ? 'Quitar admin' : 'Hacer admin'}
            </button>
          )}
          {!isSelf && (
            <button type="button" className={`link${confirmKick ? ' danger' : ''}`} onClick={doKick}>
              {confirmKick ? '¿Seguro? Confirmar' : 'Expulsar'}
            </button>
          )}
        </div>
      </div>
      {resetOpen && (
        <form className="row" onSubmit={doReset}>
          <input
            placeholder="PIN nuevo"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            maxLength={6}
            required
          />
          <button className="primary" type="submit">
            Cambiar
          </button>
        </form>
      )}
      {msg && <p className="okmsg">{msg}</p>}
    </li>
  );
}

export default function AdminPanel({
  competition,
  matchday,
  matches,
  meId,
  onClose,
  onChanged,
}: {
  competition: string;
  matchday: number;
  matches: MatchOpt[];
  meId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [fixMatch, setFixMatch] = useState('');
  const [fixHome, setFixHome] = useState('');
  const [fixAway, setFixAway] = useState('');

  const [locked, setLocked] = useState(false);

  const loadPlayers = () => {
    fetch('/api/admin/players')
      .then((r) => r.json())
      .then((j) => setPlayers(j.players ?? []));
  };
  useEffect(loadPlayers, []);

  function playersChanged() {
    loadPlayers();
    onChanged();
  }

  async function fixResultSubmit(e: FormEvent) {
    e.preventDefault();
    const r = await call('/api/admin/fix-result', {
      matchId: Number(fixMatch),
      homeScore: Number(fixHome),
      awayScore: Number(fixAway),
      status: 'FINISHED',
    });
    setMsg(r.ok ? 'Resultado corregido.' : (r.error as string) ?? 'No se pudo corregir.');
    if (r.ok) onChanged();
  }

  async function toggleLock(next: boolean) {
    const r = await call('/api/admin/lock-matchday', { competition, matchday, locked: next });
    setMsg(r.ok ? (next ? 'Jornada bloqueada.' : 'Jornada desbloqueada.') : (r.error as string) ?? 'No se pudo cambiar.');
    if (r.ok) {
      setLocked(next);
      onChanged();
    }
  }

  async function archiveSeason() {
    const r = await call('/api/admin/archive-season', { competition });
    setMsg(r.ok ? `Temporada archivada. Campeón: ${r.champion}.` : (r.error as string) ?? 'No se pudo archivar.');
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

      <h3 className="sh small">Jugadores</h3>
      <ul className="adminplayers">
        {(players ?? []).map((p) => (
          <PlayerRow key={p.id} player={p} isSelf={p.id === meId} onChanged={playersChanged} />
        ))}
      </ul>

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
