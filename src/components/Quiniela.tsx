'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Stats from './Stats';

type Pick = '1' | 'X' | '2';
type Mark = 'G' | 'E' | 'P';
type Team = { name: string; crest: string | null; pos: number | null; form: Mark[] };
type MatchDTO = {
  id: number;
  utcDate: string;
  status: string;
  home: Team;
  away: Team;
  homeScore: number | null;
  awayScore: number | null;
  result: Pick | null;
  started: boolean;
  locked: boolean;
  myPick: Pick | null;
  picks: { name: string; pick: Pick }[];
};
type RankRow = { playerId: string; name: string; points: number; delta: number };
type StateDTO = {
  me: { id: string; name: string };
  season: number;
  matchday: number;
  currentMatchday: number;
  matchdays: number[];
  matches: MatchDTO[];
  finished: number;
  finishedTotal: number;
  jornadaComplete: boolean;
  rankingJornada: RankRow[];
  rankingGeneral: RankRow[];
};

const PICKS: Pick[] = ['1', 'X', '2'];
const MARK_TXT: Record<Mark, string> = { G: 'ganó', E: 'empató', P: 'perdió' };

function whenLabel(m: MatchDTO): string {
  switch (m.status) {
    case 'IN_PLAY':
    case 'LIVE':
      return 'En juego';
    case 'PAUSED':
      return 'Descanso';
    case 'FINISHED':
      return 'Final';
    case 'POSTPONED':
      return 'Aplazado';
    case 'SUSPENDED':
      return 'Suspendido';
    case 'CANCELLED':
      return 'Cancelado';
  }
  const d = new Date(m.utcDate);
  const day = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const hour = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${hour}`;
}

function pickLabel(p: Pick, m: MatchDTO): string {
  return p === '1' ? `Gana ${m.home.name}` : p === '2' ? `Gana ${m.away.name}` : 'Empate';
}

function untilLabel(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'en menos de un minuto';
  if (min < 60) return `en ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `en ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  const d = Math.round(h / 24);
  return `en ${d} ${d === 1 ? 'día' : 'días'}`;
}

function FormDots({ form }: { form: Mark[] }) {
  if (!form.length) return null;
  return (
    <span
      className="form"
      role="img"
      aria-label={`Últimos partidos: ${form.map((f) => MARK_TXT[f]).join(', ')}`}
    >
      {form.map((f, i) => (
        <i key={i} className={`f f-${f}`} />
      ))}
    </span>
  );
}

function TeamLine({ team, score }: { team: Team; score: number | null }) {
  return (
    <div className="team">
      {team.crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.crest} alt="" loading="lazy" />
      ) : (
        <span className="crest-empty" />
      )}
      <span className="name">{team.name}</span>
      {team.pos != null && (
        <span className="tpos" title="Puesto en la Liga">
          {team.pos}º
        </span>
      )}
      <FormDots form={team.form} />
      {score != null && <span className="score">{score}</span>}
    </div>
  );
}

function Consensus({ m }: { m: MatchDTO }) {
  const n = m.picks.length;
  if (!n) return null;
  const count: Record<Pick, number> = { '1': 0, X: 0, '2': 0 };
  for (const c of m.picks) count[c.pick]++;
  const hits = m.result ? count[m.result] : null;
  return (
    <div className="consensus">
      <div className="bar">
        {PICKS.filter((p) => count[p] > 0).map((p) => (
          <span
            key={p}
            className={`cseg${m.result === p ? ' real' : ''}`}
            style={{ flex: count[p] }}
          >
            {p} {Math.round((count[p] / n) * 100)}%
          </span>
        ))}
      </div>
      <span className="chits">
        {hits != null ? `Acertaron ${hits} de ${n}` : `${n} ${n === 1 ? 'pronóstico' : 'pronósticos'}`}
      </span>
    </div>
  );
}

function MatchRow({ m, onPick }: { m: MatchDTO; onPick: (m: MatchDTO, p: Pick) => void }) {
  return (
    <li className="match">
      <div className="match-info">
        <div className="when">{whenLabel(m)}</div>
        <TeamLine team={m.home} score={m.started ? m.homeScore : null} />
        <TeamLine team={m.away} score={m.started ? m.awayScore : null} />
      </div>

      <div className="slip" role="group" aria-label={`Pronóstico: ${m.home.name} contra ${m.away.name}`}>
        {PICKS.map((p) => {
          const selected = m.myPick === p;
          const cls = ['box'];
          if (selected) cls.push('sel');
          if (m.result) {
            if (p === m.result) cls.push('real');
            if (selected) cls.push(p === m.result ? 'hit' : 'miss');
          }
          return (
            <button
              key={p}
              type="button"
              className={cls.join(' ')}
              disabled={m.locked}
              aria-pressed={selected}
              aria-label={pickLabel(p, m)}
              onClick={() => onPick(m, p)}
            >
              {p}
            </button>
          );
        })}
      </div>

      <Consensus m={m} />

      {m.picks.length > 0 && (
        <ul className="chips" aria-label="Pronósticos de los jugadores">
          {m.picks.map((c, i) => {
            const state = m.result ? (c.pick === m.result ? 'hit' : 'miss') : '';
            return (
              <li key={i} className={`chip ${state}`}>
                {c.name}
                <b>{c.pick}</b>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function Ranking({
  rows,
  meId,
  showDelta,
  crown,
}: {
  rows: RankRow[];
  meId: string;
  showDelta: boolean;
  crown: boolean;
}) {
  let pos = 0;
  let prev: number | null = null;
  return (
    <ol className="rank">
      {rows.map((r, i) => {
        if (r.points !== prev) {
          pos = i + 1;
          prev = r.points;
        }
        return (
          <li key={r.playerId} className={r.playerId === meId ? 'me' : ''}>
            <span className="pos">{pos}</span>
            <span className="who">
              {r.name}
              {crown && pos === 1 && r.points > 0 && <span className="badge">Ganó la jornada</span>}
            </span>
            <span className="delta">
              {showDelta && r.delta > 0 && <span className="up">▲{r.delta}</span>}
              {showDelta && r.delta < 0 && <span className="down">▼{-r.delta}</span>}
            </span>
            <span className="pts">{r.points}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PinPanel({ onClose }: { onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin, newPin }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: 'PIN cambiado.' });
      setPin('');
      setNewPin('');
    } else {
      setMsg({ ok: false, text: json.error ?? 'No se pudo cambiar el PIN.' });
    }
  }

  return (
    <form className="pinpanel" onSubmit={submit}>
      <div className="field">
        <label htmlFor="pin-old">PIN actual</label>
        <input
          id="pin-old"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          maxLength={6}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="pin-new">PIN nuevo (4 a 6 números)</label>
        <input
          id="pin-new"
          type="password"
          inputMode="numeric"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
          maxLength={6}
          autoComplete="new-password"
          required
        />
      </div>
      {msg && (
        <p className={msg.ok ? 'okmsg' : 'notice'} role="status">
          {msg.text}
        </p>
      )}
      <div className="row">
        <button className="primary" type="submit" disabled={busy}>
          Guardar PIN
        </button>
        <button className="link" type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </form>
  );
}

export default function Quiniela() {
  const router = useRouter();
  const [data, setData] = useState<StateDTO | null>(null);
  const [md, setMd] = useState<number | null>(null);
  const [tab, setTab] = useState<'pronosticos' | 'clasificacion' | 'estadisticas'>('pronosticos');
  const [scope, setScope] = useState<'jornada' | 'general'>('jornada');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showPin, setShowPin] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const load = useCallback(
    async (matchday: number | null) => {
      try {
        const res = await fetch(`/api/state${matchday ? `?matchday=${matchday}` : ''}`, {
          cache: 'no-store',
        });
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        if (!res.ok) throw new Error();
        setData((await res.json()) as StateDTO);
        setError(null);
      } catch {
        setError('No se pudo cargar la jornada. Reintentando en un minuto.');
      }
    },
    [router]
  );

  // Carga inicial y refresco cada minuto (marcadores en directo)
  useEffect(() => {
    load(md);
    const t = setInterval(() => {
      if (!document.hidden) load(md);
    }, 60_000);
    return () => clearInterval(t);
  }, [md, load]);

  // Reloj para las cuentas atrás
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Pulsar la casilla ya marcada quita el pronóstico
  async function choose(m: MatchDTO, pick: Pick) {
    if (m.locked || !data) return;
    const next: Pick | null = m.myPick === pick ? null : pick;
    setData({
      ...data,
      matches: data.matches.map((x) => (x.id === m.id ? { ...x, myPick: next } : x)),
    });
    const res = await fetch('/api/predict', {
      method: next ? 'POST' : 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next ? { matchId: m.id, pick: next } : { matchId: m.id }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? 'No se pudo guardar el pronóstico.');
      load(md);
    } else {
      setError(null);
    }
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  if (!data) {
    return (
      <main className="wrap">
        <p className="muted">{error ?? 'Cargando jornada…'}</p>
      </main>
    );
  }

  const idx = data.matchdays.indexOf(data.matchday);
  const prevMd = idx > 0 ? data.matchdays[idx - 1] : null;
  const nextMd = idx >= 0 && idx < data.matchdays.length - 1 ? data.matchdays[idx + 1] : null;
  const seasonLabel = `${String(data.season).slice(2)}/${String(data.season + 1).slice(2)}`;
  const myPoints = data.rankingJornada.find((r) => r.playerId === data.me.id)?.points ?? 0;

  // Recordatorio de pronósticos pendientes y próximo cierre
  const open = data.matches.filter((m) => !m.locked);
  const missing = open.filter((m) => !m.myPick).length;
  const nextClose = open.length
    ? Math.min(...open.map((m) => new Date(m.utcDate).getTime())) - now
    : null;

  const rankRows = scope === 'jornada' ? data.rankingJornada : data.rankingGeneral;

  async function shareRanking() {
    if (!data) return;
    const title =
      scope === 'jornada'
        ? `Quiniela ${seasonLabel}, jornada ${data.matchday}`
        : `Quiniela ${seasonLabel}, clasificación general`;
    let pos = 0;
    let prev: number | null = null;
    const lines = rankRows.map((r, i) => {
      if (r.points !== prev) {
        pos = i + 1;
        prev = r.points;
      }
      return `${pos}. ${r.name}: ${r.points}`;
    });
    const text = `${title}\n${lines.join('\n')}`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setShareMsg('Copiado. Ya puedes pegarlo en el grupo.');
      }
    } catch {
      /* el usuario canceló */
    }
  }

  return (
    <main className="wrap">
      <header className="top">
        <span className="brand">Quiniela {seasonLabel}</span>
        <div className="top-actions">
          <button type="button" className="link" onClick={() => setShowPin((v) => !v)}>
            Cambiar PIN
          </button>
          <button type="button" className="link" onClick={logout}>
            Salir ({data.me.name})
          </button>
        </div>
      </header>

      {showPin && <PinPanel onClose={() => setShowPin(false)} />}

      <section className="jornada" aria-label="Jornada">
        <button
          type="button"
          className="arrow"
          disabled={prevMd == null}
          onClick={() => prevMd != null && setMd(prevMd)}
          aria-label="Jornada anterior"
        >
          ‹
        </button>
        <div className="jtitle">
          <span className="jlabel">Jornada</span>
          <span className="jnum">{data.matchday}</span>
          <span className="jcaret" aria-hidden="true">
            ▾
          </span>
          <select
            className="jselect"
            aria-label="Ir a la jornada"
            value={data.matchday}
            onChange={(e) => setMd(Number(e.target.value))}
          >
            {data.matchdays.map((n) => (
              <option key={n} value={n}>
                Jornada {n}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="arrow"
          disabled={nextMd == null}
          onClick={() => nextMd != null && setMd(nextMd)}
          aria-label="Jornada siguiente"
        >
          ›
        </button>
      </section>

      <p className="progress">
        {data.finished} de {data.matches.length} partidos jugados
        {data.finished > 0 && `. Llevas ${myPoints} ${myPoints === 1 ? 'acierto' : 'aciertos'}`}
        {data.matchday !== data.currentMatchday && (
          <>
            {' '}
            <button type="button" className="link" onClick={() => setMd(null)}>
              Ir a la jornada actual
            </button>
          </>
        )}
      </p>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      <div className="tabs" role="tablist">
        {(
          [
            ['pronosticos', 'Pronósticos'],
            ['clasificacion', 'Clasificación'],
            ['estadisticas', 'Estadísticas'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'pronosticos' &&
        (data.matches.length ? (
          <>
            {open.length > 0 && (
              <p className={`reminder${missing ? ' warn' : ''}`}>
                {missing
                  ? `Te faltan ${missing} ${missing === 1 ? 'partido' : 'partidos'} por rellenar.`
                  : 'Tienes todos los pronósticos puestos.'}{' '}
                {nextClose != null && `Próximo cierre ${untilLabel(Math.max(0, nextClose))}.`}
              </p>
            )}
            <ul className="matches">
              {data.matches.map((m) => (
                <MatchRow key={m.id} m={m} onPick={choose} />
              ))}
            </ul>
          </>
        ) : (
          <p className="muted empty">Aún no hay partidos cargados para esta jornada.</p>
        ))}

      {tab === 'clasificacion' && (
        <>
          <div className="seg" role="group" aria-label="Tipo de clasificación">
            <button
              type="button"
              aria-pressed={scope === 'jornada'}
              onClick={() => setScope('jornada')}
            >
              Jornada {data.matchday}
            </button>
            <button
              type="button"
              aria-pressed={scope === 'general'}
              onClick={() => setScope('general')}
            >
              General
            </button>
          </div>
          <Ranking
            rows={rankRows}
            meId={data.me.id}
            showDelta={scope === 'general'}
            crown={scope === 'jornada' && data.jornadaComplete}
          />
          <div className="share">
            <button type="button" className="link" onClick={shareRanking}>
              Compartir clasificación
            </button>
            {shareMsg && <span className="muted"> {shareMsg}</span>}
          </div>
        </>
      )}

      {tab === 'estadisticas' && <Stats meId={data.me.id} version={data.finishedTotal} />}
    </main>
  );
}
