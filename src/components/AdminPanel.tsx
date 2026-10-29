'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { COMPETITIONS } from '@/lib/competitions';
import CompLogo from './CompLogo';
import { RowsSkeleton } from './Skeleton';

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
      {!list && !error && <RowsSkeleton rows={3} />}
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

type Round = { matchday: number; label: string };
type RoundMatch = {
  id: number;
  utcDate: string;
  status: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  isPleno: boolean;
  adminLocked: boolean;
  manualOverride: boolean;
};
type RoundData = { rounds: Round[]; matchday: number | null; matches: RoundMatch[]; plenoManual?: boolean };

// Elige competición y jornada dentro del propio panel, sin tocar lo que se ve en la app
function RoundPicker({
  comp,
  round,
  onComp,
  onMatchday,
}: {
  comp: string;
  round: RoundData | null;
  onComp: (c: string) => void;
  onMatchday: (md: number) => void;
}) {
  const rounds = round?.rounds ?? [];
  const idx = rounds.findIndex((r) => r.matchday === round?.matchday);
  const go = (i: number) => rounds[i] && onMatchday(rounds[i].matchday);
  return (
    <div className="rpick">
      <div className="seg rpick-comps" role="group" aria-label="Competición">
        {COMPETITIONS.map((c) => (
          <button key={c.code} type="button" aria-pressed={comp === c.code} onClick={() => onComp(c.code)}>
            <CompLogo code={c.code} size={20} />
            {c.short}
          </button>
        ))}
      </div>
      <div className="rpick-row">
        <button type="button" className="seg-btn" aria-label="Jornada anterior" disabled={idx <= 0} onClick={() => go(idx - 1)}>
          ‹
        </button>
        <select
          value={round?.matchday ?? ''}
          onChange={(e) => onMatchday(Number(e.target.value))}
          aria-label="Jornada"
          disabled={!rounds.length}
        >
          {!round && <option value="">Cargando…</option>}
          {rounds.map((r) => (
            <option key={r.matchday} value={r.matchday}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="seg-btn"
          aria-label="Jornada siguiente"
          disabled={idx < 0 || idx >= rounds.length - 1}
          onClick={() => go(idx + 1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}

function scoreText(m: RoundMatch): string {
  if (m.homeScore == null || m.awayScore == null) return 'Sin resultado';
  return `${m.homeScore}-${m.awayScore}${m.status === 'FINISHED' ? '' : ' (no terminado)'}`;
}

// Corregir el resultado de cualquier partido de la jornada elegida
function ResultsEditor({ round, onSaved }: { round: RoundData | null; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<number, { h: string; a: string }>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Los cuadros se rellenan con el resultado actual cada vez que llegan datos nuevos
  useEffect(() => {
    setDraft(
      Object.fromEntries(
        (round?.matches ?? []).map((m) => [
          m.id,
          { h: m.homeScore != null ? String(m.homeScore) : '', a: m.awayScore != null ? String(m.awayScore) : '' },
        ])
      )
    );
  }, [round]);

  // El aviso solo se borra al cambiar de jornada (no al recargar tras guardar)
  const shownMatchday = round?.matchday ?? null;
  useEffect(() => {
    setMsg(null);
  }, [shownMatchday]);

  async function save(m: RoundMatch) {
    const d = draft[m.id] ?? { h: '', a: '' };
    if (d.h === '' || d.a === '') return setMsg({ ok: false, text: 'Pon los dos goles del resultado.' });
    setBusy(m.id);
    const r = await call('/api/admin/fix-result', {
      matchId: m.id,
      homeScore: Number(d.h),
      awayScore: Number(d.a),
      status: 'FINISHED',
    });
    setBusy(null);
    setMsg(
      r.ok
        ? { ok: true, text: `Corregido: ${m.home} ${d.h}-${d.a} ${m.away}.` }
        : { ok: false, text: (r.error as string) ?? 'No se pudo corregir.' }
    );
    if (r.ok) onSaved();
  }

  async function auto(m: RoundMatch) {
    setBusy(m.id);
    const r = await call('/api/admin/fix-result', { matchId: m.id, clearOverride: true });
    setBusy(null);
    setMsg(
      r.ok
        ? { ok: true, text: `${m.home} - ${m.away} volverá a actualizarse solo con la próxima sincronización.` }
        : { ok: false, text: (r.error as string) ?? 'No se pudo cambiar.' }
    );
    if (r.ok) onSaved();
  }

  const set = (id: number, key: 'h' | 'a', v: string) =>
    setDraft((d) => ({ ...d, [id]: { h: d[id]?.h ?? '', a: d[id]?.a ?? '', [key]: v.replace(/\D/g, '').slice(0, 2) } }));

  if (!round) return <RowsSkeleton rows={3} />;
  if (!round.matches.length) return <p className="muted">No hay partidos en esta jornada.</p>;
  return (
    <>
      {msg && <p className={msg.ok ? 'okmsg' : 'notice'}>{msg.text}</p>}
      <ul className="pedit-list">
        {round.matches.map((m) => (
          <li key={m.id} className="pedit-row">
            <div className="pedit-teams">
              <b>
                {m.home} - {m.away}
              </b>
              <small>
                Ahora: {scoreText(m)}
                {m.manualOverride && ' · ajustado a mano'}
              </small>
            </div>
            <div className="pedit-score">
              <input
                inputMode="numeric"
                aria-label={`Goles de ${m.home}`}
                value={draft[m.id]?.h ?? ''}
                onChange={(e) => set(m.id, 'h', e.target.value)}
              />
              <span>-</span>
              <input
                inputMode="numeric"
                aria-label={`Goles de ${m.away}`}
                value={draft[m.id]?.a ?? ''}
                onChange={(e) => set(m.id, 'a', e.target.value)}
              />
              <button type="button" className="seg-btn" disabled={busy === m.id} onClick={() => save(m)}>
                Corregir
              </button>
            </div>
            {m.manualOverride && (
              <div className="pedit-info">
                <span className="muted">Se ha puesto a mano</span>
                <button type="button" className="link" disabled={busy === m.id} onClick={() => auto(m)}>
                  Volver a automático
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

const kickoff = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hasKickedOff = (m: RoundMatch) => m.status !== 'SCHEDULED' && m.status !== 'TIMED';

// Elegir a mano el pleno al 15 de la jornada, o devolverlo a automático (el penúltimo partido)
function PlenoPicker({ comp, round, onSaved }: { comp: string; round: RoundData | null; onSaved: () => void }) {
  const [busy, setBusy] = useState<number | 'auto' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(body: { matchId?: number; auto?: boolean }, askIfPlayed: boolean) {
    if (!round || round.matchday == null) return;
    if (askIfPlayed && round.matches.some(hasKickedOff)) {
      const ok = window.confirm(
        'Esta jornada ya tiene partidos empezados. Cambiar el pleno cambia los puntos de quien tenga pronósticos en él. ¿Seguir?'
      );
      if (!ok) return;
    }
    setBusy(body.auto ? 'auto' : body.matchId ?? null);
    setMsg(null);
    const r = await call('/api/admin/pleno', { competition: comp, matchday: round.matchday, ...body });
    setBusy(null);
    setMsg(
      r.ok
        ? { ok: true, text: body.auto ? 'Pleno automático: el penúltimo partido.' : 'Pleno elegido a mano.' }
        : { ok: false, text: (r.error as string) ?? 'No se pudo cambiar el pleno.' }
    );
    if (r.ok) onSaved();
  }

  if (!round) return <RowsSkeleton rows={3} />;
  if (!round.matches.length) return <p className="muted">No hay partidos en esta jornada.</p>;
  return (
    <>
      <p className="hint">
        {round.plenoManual ? 'Pleno elegido a mano: no se mueve solo.' : 'Pleno automático: el penúltimo partido de la jornada.'}
      </p>
      {msg && <p className={msg.ok ? 'okmsg' : 'notice'}>{msg.text}</p>}
      <ul className="pedit-list">
        {round.matches.map((m) => (
          <li key={m.id} className="pedit-row">
            <div className="pedit-info">
              <div className="pedit-teams">
                <b>
                  {m.home} - {m.away}
                </b>
                <small>{kickoff(m.utcDate)}</small>
              </div>
              {m.isPleno ? (
                <span className="adm-tag">Pleno al 15</span>
              ) : (
                <button type="button" className="seg-btn" disabled={busy != null} onClick={() => send({ matchId: m.id }, true)}>
                  Hacer pleno
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {round.plenoManual && (
        <button type="button" className="link" disabled={busy != null} onClick={() => send({ auto: true }, true)}>
          Volver a automático
        </button>
      )}
    </>
  );
}

type PlenoItem = { matchday: number; label: string; from: string | null; to: string | null; predictions: number; played: boolean };

// Busca jornadas (también pasadas) con el pleno mal puesto y deja corregirlas, avisando de los puntos
function PlenoRecalc({ comp, onFixed }: { comp: string; onFixed: () => void }) {
  const [data, setData] = useState<{ items: PlenoItem[]; manual: number } | null>(null);
  const [busy, setBusy] = useState<number | 'all' | 'check' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setData(null);
    setMsg(null);
  }, [comp]);

  async function check() {
    setBusy('check');
    setMsg(null);
    const j = await fetch(`/api/admin/pleno-recalc?competition=${comp}`, { cache: 'no-store' })
      .then((r) => r.json())
      .catch(() => ({ error: 'No se pudo revisar.' }));
    setBusy(null);
    if (j.error) setMsg({ ok: false, text: j.error });
    else setData(j);
  }

  async function fix(matchdays?: number[]) {
    const n = matchdays ? matchdays.length : data?.items.length ?? 0;
    const ok = window.confirm(
      `Vas a cambiar el pleno de ${n} ${n === 1 ? 'jornada' : 'jornadas'}. Esto cambia los puntos de quien tenga pronósticos en esos partidos, también en jornadas ya jugadas. ¿Seguir?`
    );
    if (!ok) return;
    setBusy(matchdays?.[0] ?? 'all');
    const r = await call('/api/admin/pleno-recalc', { competition: comp, matchdays });
    setBusy(null);
    if (!r.ok) {
      setMsg({ ok: false, text: (r.error as string) ?? 'No se pudo corregir.' });
      return;
    }
    setMsg({ ok: true, text: `${r.fixed} ${r.fixed === 1 ? 'jornada corregida' : 'jornadas corregidas'}.` });
    onFixed();
    check();
  }

  return (
    <div className="pedit" style={{ marginTop: 18 }}>
      <h3 className="sh small">Corregir jornadas pasadas</h3>
      <p className="hint">Busca jornadas donde el pleno no es el penúltimo partido. Corregirlas cambia los puntos.</p>
      <button type="button" className="seg-btn" disabled={busy != null} onClick={check}>
        {busy === 'check' ? 'Revisando…' : 'Revisar jornadas'}
      </button>
      {msg && <p className={msg.ok ? 'okmsg' : 'notice'}>{msg.text}</p>}
      {data && !data.items.length && <p className="okmsg">Todas las jornadas tienen el pleno bien puesto.</p>}
      {data && data.manual > 0 && (
        <p className="hint">
          {data.manual} {data.manual === 1 ? 'jornada elegida' : 'jornadas elegidas'} a mano, no se tocan.
        </p>
      )}
      {data && data.items.length > 0 && (
        <>
          <p className="notice">
            Cambiar el pleno cambia los puntos de quien tenga pronósticos en ese partido. Se aplica a todas las pandillas.
          </p>
          <ul className="pedit-list">
            {data.items.map((it) => (
              <li key={it.matchday} className="pedit-row">
                <div className="pedit-teams">
                  <b>{it.label}</b>
                  <small>Ahora: {it.from ?? 'sin pleno'}</small>
                  <small>Debería ser: {it.to}</small>
                  <small className={it.played ? 'pedit-closed' : undefined}>
                    {it.predictions} {it.predictions === 1 ? 'pronóstico afectado' : 'pronósticos afectados'}
                    {it.played && ' · ya jugado'}
                  </small>
                </div>
                <div className="pedit-info">
                  <span />
                  <button type="button" className="seg-btn" disabled={busy != null} onClick={() => fix([it.matchday])}>
                    {busy === it.matchday ? 'Corrigiendo…' : 'Corregir'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {data.items.length > 1 && (
            <button type="button" className="primary" disabled={busy != null} onClick={() => fix()}>
              {busy === 'all' ? 'Corrigiendo…' : `Corregir las ${data.items.length} jornadas`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

type MissingData = { total: number; players: { id: string; name: string; made: number }[] };

// Quién de la pandilla no ha pronosticado (o no del todo) la jornada elegida
function MissingPanel({ comp, matchday }: { comp: string; matchday: number | null }) {
  const [data, setData] = useState<MissingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (matchday == null) return;
    setData(null);
    setError(null);
    fetch(`/api/admin/missing?competition=${comp}&matchday=${matchday}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setData(j)))
      .catch(() => setError('No se pudo cargar.'));
  }, [comp, matchday]);

  if (matchday == null) return <p className="muted">No hay partidos en esta competición.</p>;
  if (error) return <p className="notice">{error}</p>;
  if (!data) return <RowsSkeleton rows={4} />;
  if (!data.total) return <p className="muted">No hay partidos que pronosticar en esta jornada.</p>;

  const pending = data.players.filter((p) => p.made < data.total);
  const done = data.players.filter((p) => p.made >= data.total);
  return (
    <>
      <p className="hint">
        {pending.length === 0
          ? 'Todos han pronosticado la jornada completa.'
          : `Faltan ${pending.length} de ${data.players.length} por completar la jornada.`}
      </p>
      {pending.length > 0 && (
        <ul className="miss-list">
          {pending.map((p) => (
            <li key={p.id} className="miss-row">
              <b>{p.name}</b>
              <small>
                {p.made === 0 ? 'No ha puesto nada' : `Faltan ${data.total - p.made} de ${data.total}`}
              </small>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && <p className="hint">Al día: {done.map((p) => p.name).join(', ')}.</p>}
    </>
  );
}

type SyncInfo = {
  competitions: { code: string; name: string; lastOk: string | null; lastError: string | null }[];
  config: { footballToken: boolean; cronSecret: boolean };
  detail: boolean;
};
type SyncResult = { code: string; name: string; ok: boolean; count: number; error: string | null };

function ago(iso: string | null): string {
  if (!iso) return 'nunca';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'hace instantes';
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

// Cuándo se actualizaron por última vez los resultados y botón para forzarlo
function SyncPanel() {
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetch('/api/admin/sync', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setInfo(j)))
      .catch(() => setError('No se pudo comprobar el estado.'));
  }, []);
  useEffect(reload, [reload]);

  async function syncNow() {
    setBusy(true);
    setError(null);
    const r = await call('/api/admin/sync', {});
    setBusy(false);
    if (!r.ok) return setError((r.error as string) ?? 'No se pudo sincronizar.');
    setResults(r.results as SyncResult[]);
    reload();
  }

  if (!info && !error) return <RowsSkeleton rows={2} />;
  return (
    <>
      {error && <p className="notice">{error}</p>}
      {info && !info.config.footballToken && <p className="notice">Falta FOOTBALL_DATA_TOKEN en Vercel.</p>}
      {info && (
        <ul className="syncs">
          {info.competitions.map((c) => (
            <li key={c.code}>
              <CompLogo code={c.code} size={26} />
              <span className="sync-txt">
                <b>{c.name}</b>
                <small>Última vez correcta: {ago(c.lastOk)}</small>
                {c.lastError && <small className="sync-err">{c.lastError}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button type="button" className="primary" disabled={busy} onClick={syncNow}>
          {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </div>
      {results && (
        <ul className="syncs">
          {results.map((r) => (
            <li key={r.code}>
              <span className="sync-txt">
                <b>{r.name}</b>
                <small className={r.ok ? undefined : 'sync-err'}>
                  {r.ok ? `${r.count} partidos actualizados` : r.error ?? 'Ya se estaba sincronizando'}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

type Tool = 'jugadores' | 'resultados' | 'pronosticos' | 'pendientes' | 'pleno' | 'sync' | 'jornada' | 'temporada' | 'historial' | 'equipos';
const TOOLS: { id: Tool; title: string; hint: string }[] = [
  { id: 'jugadores', title: 'Jugadores y PIN', hint: 'Cambiar PIN, dar admin, expulsar' },
  { id: 'resultados', title: 'Resultados', hint: 'Corregir el resultado de un partido' },
  { id: 'pronosticos', title: 'Pronósticos', hint: 'Poner o cambiar lo de un jugador' },
  { id: 'pendientes', title: 'Sin pronosticar', hint: 'Ver quién falta en una jornada' },
  { id: 'pleno', title: 'Pleno al 15', hint: 'Elegir a mano o corregir jornadas' },
  { id: 'sync', title: 'Sincronización', hint: 'Ver y forzar la actualización de resultados' },
  { id: 'jornada', title: 'Bloquear jornada', hint: 'Cerrar o abrir los pronósticos' },
  { id: 'temporada', title: 'Archivar temporada', hint: 'Guardar la clasificación final' },
  { id: 'historial', title: 'Historial', hint: 'Traer temporadas anteriores' },
  { id: 'equipos', title: 'Equipos guardados', hint: 'Revisar nombres de equipos' },
];

export default function AdminPanel({
  competition,
  matchday,
  meId,
  onClose,
  onChanged,
}: {
  competition: string;
  matchday: number;
  matches?: MatchOpt[];
  meId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tool, setTool] = useState<Tool | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  // Competición y jornada que se eligen dentro del panel (empiezan en las de la app, pero son independientes)
  const [pc, setPc] = useState(competition);
  const [pm, setPm] = useState<number | null>(matchday);
  const [round, setRound] = useState<RoundData | null>(null);
  const needsRound = tool === 'resultados' || tool === 'pronosticos' || tool === 'jornada' || tool === 'pendientes' || tool === 'pleno';

  const loadPlayers = () => {
    fetch('/api/admin/players')
      .then((r) => r.json())
      .then((j) => setPlayers(j.players ?? []));
  };
  useEffect(loadPlayers, []);

  const loadRound = useCallback(() => {
    const qs = `competition=${pc}${pm != null ? `&matchday=${pm}` : ''}`;
    return fetch(`/api/admin/round?${qs}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        setRound(j.error ? { rounds: [], matchday: null, matches: [] } : j);
        // Se fija la jornada que eligió el servidor: así no cambia sola al corregir un resultado
        if (!j.error && pm == null && j.matchday != null) setPm(j.matchday);
      })
      .catch(() => setRound({ rounds: [], matchday: null, matches: [] }));
  }, [pc, pm]);
  useEffect(() => {
    if (needsRound) loadRound();
  }, [needsRound, loadRound]);

  function pickComp(c: string) {
    if (c === pc) return;
    setPc(c);
    setPm(null); // el servidor elige la primera jornada con partidos pendientes
    setRound(null);
  }
  function pickMatchday(md: number) {
    setPm(md);
    setRound(null);
  }

  function open(t: Tool | null) {
    setMsg(null);
    setTool(t);
  }

  function playersChanged() {
    loadPlayers();
    onChanged();
  }

  const resolvedMd = round?.matchday ?? null;
  const lockedAll = !!round && round.matches.length > 0 && round.matches.every((m) => m.adminLocked);
  const lockedAny = !!round && round.matches.some((m) => m.adminLocked);

  async function toggleLock(next: boolean) {
    if (resolvedMd == null) return;
    const r = await call('/api/admin/lock-matchday', { competition: pc, matchday: resolvedMd, locked: next });
    setMsg(r.ok ? (next ? 'Jornada bloqueada.' : 'Jornada desbloqueada.') : (r.error as string) ?? 'No se pudo cambiar.');
    if (r.ok) {
      loadRound();
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

  const compName = COMPETITIONS.find((c) => c.code === competition)?.short ?? competition;
  const current = TOOLS.find((t) => t.id === tool);

  return (
    <div className="pinpanel admin">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {tool ? (
          <button type="button" className="link" onClick={() => open(null)}>
            ‹ Panel de admin
          </button>
        ) : (
          <h2 className="sh" style={{ margin: 0 }}>
            Panel de admin
          </h2>
        )}
        <button type="button" className="link" onClick={onClose}>
          Cerrar
        </button>
      </div>
      {msg && <p className="okmsg">{msg}</p>}

      {!tool && (
        <div className="admin-tiles">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" className="admin-tile" onClick={() => open(t.id)}>
              <b>{t.title}</b>
              <small>{t.hint}</small>
            </button>
          ))}
        </div>
      )}

      {current && <h3 className="sh small">{current.title}</h3>}

      {tool === 'jugadores' && (
        <ul className="adminplayers">
          {(players ?? []).map((p) => (
            <PlayerRow key={p.id} player={p} isSelf={p.id === meId} onChanged={playersChanged} />
          ))}
        </ul>
      )}

      {needsRound && <RoundPicker comp={pc} round={round} onComp={pickComp} onMatchday={pickMatchday} />}

      {tool === 'resultados' && (
        <ResultsEditor
          key={pc}
          round={round}
          onSaved={() => {
            loadRound();
            onChanged();
          }}
        />
      )}

      {tool === 'pronosticos' && (
        <>
          {resolvedMd != null && (
            <PredictionEditor competition={pc} matchday={resolvedMd} players={players ?? []} onChanged={onChanged} />
          )}
          {round && resolvedMd == null && <p className="muted">No hay partidos en esta competición.</p>}
        </>
      )}

      {tool === 'pendientes' && (round ? <MissingPanel comp={pc} matchday={resolvedMd} /> : <RowsSkeleton rows={4} />)}

      {tool === 'pleno' && (
        <>
          <PlenoPicker
            key={pc}
            comp={pc}
            round={round}
            onSaved={() => {
              loadRound();
              onChanged();
            }}
          />
          <PlenoRecalc comp={pc} onFixed={() => { loadRound(); onChanged(); }} />
        </>
      )}

      {tool === 'sync' && <SyncPanel />}

      {tool === 'jornada' && (
        <>
          <p className="hint">
            {!round
              ? 'Cargando…'
              : lockedAll
                ? 'Jornada bloqueada.'
                : lockedAny
                  ? 'Algunos partidos bloqueados.'
                  : 'Jornada abierta.'}
          </p>
          <div className="row">
            <button type="button" className="seg-btn" onClick={() => toggleLock(true)} disabled={!round || lockedAll}>
              Bloquear
            </button>
            <button type="button" className="seg-btn" onClick={() => toggleLock(false)} disabled={!round || !lockedAny}>
              Desbloquear
            </button>
          </div>
        </>
      )}

      {tool === 'temporada' && (
        <>
          <button type="button" className="primary" onClick={archiveSeason}>
            Archivar temporada actual ({compName})
          </button>
          <p className="hint">Guarda la clasificación final en el archivo.</p>
        </>
      )}

      {tool === 'historial' && (
        <>
          <button type="button" className="primary" onClick={backfillHistory} disabled={backfilling}>
            {backfilling ? 'Trayendo...' : `Traer historial de ${compName} (últimas 4 temporadas)`}
          </button>
          <p className="hint">
            Rellena el Cara a cara con temporadas pasadas (<code>API_FOOTBALL_KEY</code>).
          </p>
        </>
      )}

      {tool === 'equipos' && (
        <>
          <TeamNamesDebug competition={competition} />
        </>
      )}
    </div>
  );
}
