'use client';

import { FormEvent, useEffect, useState } from 'react';

type TeamNameGroup = { key: string; names: string[]; seasons: number[]; matches: number };

function TeamNamesDebug({ competition }: { competition: string }) {
  const [query, setQuery] = useState('');
  const [teams, setTeams] = useState<TeamNameGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTeams(null);
    setError(null);
    fetch(`/api/admin/team-names?competition=${competition}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setTeams(j.teams)))
      .catch(() => setError('No se pudo cargar.'));
  }, [competition]);

  const filtered = teams?.filter((t) => !query || t.names.some((n) => n.toLowerCase().includes(query.toLowerCase())));

  return (
    <div>
      <input
        placeholder="Buscar equipo (p. ej. Celta)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', marginBottom: 8 }}
      />
      {error && <p className="notice">{error}</p>}
      {!teams && !error && <p className="muted">Cargando…</p>}
      {filtered && filtered.length === 0 && <p className="muted">Nada con ese nombre guardado en {competition}.</p>}
      {filtered && filtered.length > 0 && (
        <ul className="teamnames">
          {filtered.map((t) => (
            <li key={t.key}>
              <b>{t.names.join(' / ')}</b>
              <span className="muted">
                {' '}
                — temporadas {t.seasons.join(', ')} · {t.matches} filas
                {t.names.length > 1 && ' ⚠️ varios nombres sin agrupar'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

type EditMatch = {
  id: number;
  home: string;
  away: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  isPleno: boolean;
  locked: boolean;
  pick: string | null;
  plenoHome: number | null;
  plenoAway: number | null;
};

function stateLabel(m: EditMatch): string {
  if (m.status === 'FINISHED') return `Terminado ${m.homeScore}-${m.awayScore}`;
  return m.locked ? 'Cerrado' : 'Abierto';
}

// Permite al admin poner, cambiar o quitar el pronóstico de cualquier jugador, aunque el partido esté cerrado.
function PredictionEditor({
  competition,
  matchday,
  players,
  onChanged,
}: {
  competition: string;
  matchday: number;
  players: Player[];
  onChanged: () => void;
}) {
  const [playerId, setPlayerId] = useState('');
  const [list, setList] = useState<EditMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<number, { h: string; a: string }>>({});

  // Al abrir, el primer jugador de la lista
  useEffect(() => {
    if (!playerId && players.length) setPlayerId(players[0].id);
  }, [players, playerId]);

  useEffect(() => {
    if (!playerId) return;
    let alive = true;
    setList(null);
    setError(null);
    setSaved(null);
    fetch(`/api/admin/predictions?playerId=${playerId}&competition=${competition}&matchday=${matchday}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) return setError(j.error);
        setList(j.matches);
        setDraft(
          Object.fromEntries(
            (j.matches as EditMatch[])
              .filter((m) => m.isPleno)
              .map((m) => [m.id, { h: m.plenoHome != null ? String(m.plenoHome) : '', a: m.plenoAway != null ? String(m.plenoAway) : '' }])
          )
        );
      })
      .catch(() => alive && setError('No se pudieron cargar los pronósticos.'));
    return () => {
      alive = false;
    };
  }, [playerId, competition, matchday]);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '';

  function patch(id: number, changes: Partial<EditMatch>) {
    setList((l) => l && l.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  }

  async function save(m: EditMatch, body: { pick?: string; plenoHome?: number; plenoAway?: number }) {
    setBusy(m.id);
    setError(null);
    setSaved(null);
    const r = await call('/api/admin/predictions', { playerId, matchId: m.id, ...body });
    setBusy(null);
    if (!r.ok) return setError((r.error as string) ?? 'No se pudo guardar.');
    patch(m.id, {
      pick: r.pick as string,
      plenoHome: (r.plenoHome as number | null) ?? null,
      plenoAway: (r.plenoAway as number | null) ?? null,
    });
    setSaved(`Guardado: ${m.home} - ${m.away} para ${nameOf(playerId)}.`);
    onChanged();
  }

  async function clear(m: EditMatch) {
    setBusy(m.id);
    setError(null);
    setSaved(null);
    const res = await fetch('/api/admin/predictions', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId, matchId: m.id }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(j.error ?? 'No se pudo quitar.');
    patch(m.id, { pick: null, plenoHome: null, plenoAway: null });
    if (m.isPleno) setDraft((d) => ({ ...d, [m.id]: { h: '', a: '' } }));
    setSaved(`Quitado: ${m.home} - ${m.away} para ${nameOf(playerId)}.`);
    onChanged();
  }

  function savePleno(m: EditMatch) {
    const d = draft[m.id] ?? { h: '', a: '' };
    if (d.h === '' || d.a === '') return setError('Pon los dos goles del marcador.');
    save(m, { plenoHome: Number(d.h), plenoAway: Number(d.a) });
  }

  return (
    <div className="pedit">
      <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} aria-label="Jugador">
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {error && <p className="notice">{error}</p>}
      {saved && <p className="okmsg">{saved}</p>}
      {!list && !error && <p className="muted">Cargando…</p>}
      {list && list.length === 0 && <p className="muted">Esta jornada no tiene partidos.</p>}
      {list && list.length > 0 && (
        <ul className="pedit-list">
          {list.map((m) => (
            <li key={m.id} className="pedit-row">
              <div className="pedit-teams">
                <b>
                  {m.home} - {m.away}
                </b>
                <small className={m.locked ? 'pedit-closed' : undefined}>
                  {stateLabel(m)}
                  {m.isPleno && ' · pleno al 15'}
                </small>
              </div>
              {m.isPleno ? (
                <div className="pedit-score">
                  <input
                    inputMode="numeric"
                    aria-label={`Goles de ${m.home}`}
                    value={draft[m.id]?.h ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [m.id]: { h: e.target.value.replace(/\D/g, '').slice(0, 2), a: d[m.id]?.a ?? '' } }))
                    }
                  />
                  <span>-</span>
                  <input
                    inputMode="numeric"
                    aria-label={`Goles de ${m.away}`}
                    value={draft[m.id]?.a ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [m.id]: { a: e.target.value.replace(/\D/g, '').slice(0, 2), h: d[m.id]?.h ?? '' } }))
                    }
                  />
                  <button type="button" className="seg-btn" disabled={busy === m.id} onClick={() => savePleno(m)}>
                    Guardar
                  </button>
                </div>
              ) : (
                <div className="pedit-picks" role="group" aria-label={`Pronóstico de ${m.home} - ${m.away}`}>
                  {['1', 'X', '2'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={m.pick === k}
                      disabled={busy === m.id}
                      onClick={() => m.pick !== k && save(m, { pick: k })}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}
              <div className="pedit-info">
                <span className="muted">
                  {m.pick
                    ? m.isPleno && m.plenoHome != null
                      ? `Tiene puesto ${m.plenoHome}-${m.plenoAway}`
                      : `Tiene puesto ${m.pick}`
                    : 'Sin pronóstico'}
                </span>
                {m.pick && (
                  <button type="button" className="link danger" disabled={busy === m.id} onClick={() => clear(m)}>
                    Quitar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  const [backfilling, setBackfilling] = useState(false);

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

  async function backfillHistory() {
    setBackfilling(true);
    const r = await call('/api/admin/backfill-history', { competition });
    setBackfilling(false);
    if (!r.ok) {
      setMsg((r.error as string) ?? 'No se pudo traer el historial.');
      return;
    }
    const results = (r.results as { season: number; count?: number; error?: string }[]) ?? [];
    setMsg(
      results
        .map((x) => (x.error ? `${x.season}: ${x.error}` : `${x.season}: ${x.count} partidos`))
        .join(' · ')
    );
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

      <h3 className="sh small">Editar pronósticos (jornada {matchday})</h3>
      <p className="hint">
        Pon, cambia o quita el pronóstico de cualquier jugador, aunque el partido ya esté cerrado o
        terminado. Los puntos y las estadísticas se recalculan solos.
      </p>
      <PredictionEditor competition={competition} matchday={matchday} players={players ?? []} onChanged={onChanged} />

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

      <h3 className="sh small">Historial de temporadas anteriores</h3>
      <button type="button" className="primary" onClick={backfillHistory} disabled={backfilling}>
        {backfilling ? 'Trayendo...' : 'Traer historial (últimas 4 temporadas)'}
      </button>
      <p className="hint">
        Rellena el "Cara a cara" entre equipos con temporadas pasadas, usando una clave gratuita de
        api-football.com (variable de entorno <code>API_FOOTBALL_KEY</code>). No toca la
        sincronización en directo de esta temporada.
      </p>

      <h3 className="sh small">Equipos guardados ({competition})</h3>
      <p className="hint">
        Para comprobar si un equipo falta o está guardado con dos nombres distintos sin agrupar.
      </p>
      <TeamNamesDebug competition={competition} />
    </div>
  );
}
