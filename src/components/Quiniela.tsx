'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Stats from './Stats';
import TeamModal from './TeamModal';
import Archive from './Archive';
import AdminPanel from './AdminPanel';

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
  liveResult: Pick | null;
  provisional: boolean;
  started: boolean;
  locked: boolean;
  myPick: Pick | null;
  picks: { name: string; pick: Pick }[];
};
type RankRow = { playerId: string; name: string; points: number; delta: number; provisional?: number };
type CompetitionInfo = { code: string; name: string; short: string; freeTier: boolean };
type StateDTO = {
  me: { id: string; name: string; admin: boolean };
  season: number;
  competition: string;
  competitions: CompetitionInfo[];
  matchday: number;
  stageLabel: string | null;
  currentMatchday: number;
  matchdays: number[];
  matches: MatchDTO[];
  finished: number;
  finishedTotal: number;
  jornadaComplete: boolean;
  jornadaLive: boolean;
  rankingJornada: RankRow[];
  rankingGeneral: RankRow[];
  rankingCombinada: RankRow[];
  syncNotice: string[] | null;
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

function TeamLine({
  team,
  score,
  onOpen,
}: {
  team: Team;
  score: number | null;
  onOpen: (name: string) => void;
}) {
  return (
    <button type="button" className="team teambtn" onClick={() => onOpen(team.name)}>
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
    </button>
  );
}

function Consensus({ m }: { m: MatchDTO }) {
  const n = m.picks.length;
  if (!n) return null;
  const count: Record<Pick, number> = { '1': 0, X: 0, '2': 0 };
  for (const c of m.picks) count[c.pick]++;
  const real = m.result ?? (m.provisional ? m.liveResult : null);
  const hits = real ? count[real] : null;
  return (
    <div className="consensus">
      <div className="bar">
        {PICKS.filter((p) => count[p] > 0).map((p) => (
          <span
            key={p}
            className={`cseg${real === p ? (m.result ? ' real' : ' live') : ''}`}
            style={{ flex: count[p] }}
          >
            {p} {Math.round((count[p] / n) * 100)}%
          </span>
        ))}
      </div>
      <span className="chits">
        {hits != null
          ? `${m.provisional ? 'Van' : 'Acertaron'} ${hits} de ${n}`
          : `${n} ${n === 1 ? 'pronóstico' : 'pronósticos'}`}
      </span>
    </div>
  );
}

function MatchRow({
  m,
  onPick,
  onOpenTeam,
}: {
  m: MatchDTO;
  onPick: (m: MatchDTO, p: Pick) => void;
  onOpenTeam: (name: string) => void;
}) {
  return (
    <li className={`match${m.provisional ? ' live' : ''}`}>
      <div className="match-info">
        <div className="when">
          {m.provisional && <i className="livedot" aria-hidden="true" />}
          {whenLabel(m)}
        </div>
        <TeamLine team={m.home} score={m.started ? m.homeScore : null} onOpen={onOpenTeam} />
        <TeamLine team={m.away} score={m.started ? m.awayScore : null} onOpen={onOpenTeam} />
      </div>

      <div className="slip" role="group" aria-label={`Pronóstico: ${m.home.name} contra ${m.away.name}`}>
        {PICKS.map((p) => {
          const selected = m.myPick === p;
          const real = m.result ?? (m.provisional ? m.liveResult : null);
          const cls = ['box'];
          if (selected) cls.push('sel');
          if (real) {
            if (p === real) cls.push('real');
            if (selected) cls.push(p === real ? (m.provisional ? 'hit-live' : 'hit') : m.provisional ? 'miss-live' : 'miss');
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
            const real = m.result ?? (m.provisional ? m.liveResult : null);
            const state = real ? (c.pick === real ? 'hit' : 'miss') : '';
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
  provisional,
}: {
  rows: RankRow[];
  meId: string;
  showDelta: boolean;
  crown: boolean;
  provisional: boolean;
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
            <span className="pts">
              {r.points}
              {provisional && !!r.provisional && <small className="ptslive">+{r.provisional} en vivo</small>}
            </span>
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
  const cache = useRef(new Map<string, StateDTO>());
  const [data, setData] = useState<StateDTO | null>(null);
  const [competition, setCompetition] = useState('PD');
  const [md, setMd] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'pronosticos' | 'clasificacion' | 'estadisticas'>('pronosticos');
  const [scope, setScope] = useState<'jornada' | 'general' | 'combinada'>('jornada');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showPin, setShowPin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const keyOf = (comp: string, matchday: number | null) => `${comp}:${matchday ?? 'current'}`;

  const fetchState = useCallback(
    async (comp: string, matchday: number | null): Promise<StateDTO | null> => {
      const qs = matchday ? `?competition=${comp}&matchday=${matchday}` : `?competition=${comp}`;
      const res = await fetch(`/api/state${qs}`, { cache: 'no-store' });
      if (res.status === 401) {
        router.replace('/login');
        return null;
      }
      if (!res.ok) throw new Error();
      return (await res.json()) as StateDTO;
    },
    [router]
  );

  const load = useCallback(
    async (comp: string, matchday: number | null) => {
      const key = keyOf(comp, matchday);
      const cached = cache.current.get(key);
      if (cached) {
        setData(cached);
        setError(null);
      } else {
        setLoading(true);
      }
      try {
        const fresh = await fetchState(comp, matchday);
        if (!fresh) return;
        cache.current.set(key, fresh);
        // Solo pisar la pantalla si seguimos mirando lo mismo (evita carreras al cambiar rápido)
        setData((prev) => (prev && prev !== fresh ? fresh : fresh));
        setError(null);
        // Precarga silenciosa de las jornadas vecinas, para que las flechas respondan al instante
        const idx = fresh.matchdays.indexOf(fresh.matchday);
        const neighbors = [fresh.matchdays[idx - 1], fresh.matchdays[idx + 1]].filter(
          (n): n is number => n != null
        );
        for (const n of neighbors) {
          const nk = keyOf(comp, n);
          if (!cache.current.has(nk)) {
            fetchState(comp, n)
              .then((s) => s && cache.current.set(nk, s))
              .catch(() => {});
          }
        }
      } catch {
        if (!cached) setError('No se pudo cargar la jornada. Reintentando en un minuto.');
      } finally {
        setLoading(false);
      }
    },
    [fetchState]
  );

  useEffect(() => {
    load(competition, md);
  }, [competition, md, load]);

  // Refresco automático: más seguido si hay algo en juego
  useEffect(() => {
    const t = setInterval(
      () => {
        if (!document.hidden) load(competition, md);
      },
      data?.jornadaLive ? 20_000 : 60_000
    );
    return () => clearInterval(t);
  }, [competition, md, load, data?.jornadaLive]);

  // Reloj para las cuentas atrás
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  function changeCompetition(next: string) {
    if (next === competition) return;
    setCompetition(next);
    setMd(null);
    setScope('jornada');
  }

  // Pulsar la casilla ya marcada quita el pronóstico
  async function choose(m: MatchDTO, pick: Pick) {
    if (m.locked || !data) return;
    const next: Pick | null = m.myPick === pick ? null : pick;
    const updated = { ...data, matches: data.matches.map((x) => (x.id === m.id ? { ...x, myPick: next } : x)) };
    setData(updated);
    cache.current.set(keyOf(competition, md), updated);
    const res = await fetch('/api/predict', {
      method: next ? 'POST' : 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next ? { matchId: m.id, pick: next } : { matchId: m.id }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? 'No se pudo guardar el pronóstico.');
      cache.current.delete(keyOf(competition, md));
      load(competition, md);
    } else {
      setError(null);
    }
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  function refreshNow() {
    cache.current.delete(keyOf(competition, md));
    load(competition, md);
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

  const open = data.matches.filter((m) => !m.locked);
  const missing = open.filter((m) => !m.myPick).length;
  const nextClose = open.length
    ? Math.min(...open.map((m) => new Date(m.utcDate).getTime())) - now
    : null;

  const rankRows =
    scope === 'jornada' ? data.rankingJornada : scope === 'general' ? data.rankingGeneral : data.rankingCombinada;

  async function shareRanking() {
    if (!data) return;
    const compLabel = data.competitions.find((c) => c.code === data.competition)?.short ?? '';
    const title =
      scope === 'jornada'
        ? `Quiniela ${compLabel} ${seasonLabel}, jornada ${data.matchday}`
        : scope === 'general'
          ? `Quiniela ${compLabel} ${seasonLabel}, clasificación general`
          : `Quiniela ${seasonLabel}, clasificación combinada`;
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
          {data.me.admin && (
            <button type="button" className="link" onClick={() => setShowAdmin((v) => !v)}>
              Admin
            </button>
          )}
          <button type="button" className="link" onClick={() => setShowPin((v) => !v)}>
            Cambiar PIN
          </button>
          <button type="button" className="link" onClick={logout}>
            Salir ({data.me.name})
          </button>
        </div>
      </header>

      <div className="seg complist" role="group" aria-label="Competición">
        {data.competitions.map((c) => (
          <button
            key={c.code}
            type="button"
            aria-pressed={competition === c.code}
            onClick={() => changeCompetition(c.code)}
          >
            {c.short}
            {!c.freeTier && <sup title="Necesita un plan de pago en football-data.org">*</sup>}
          </button>
        ))}
      </div>

      {showPin && <PinPanel onClose={() => setShowPin(false)} />}
      {showAdmin && (
        <AdminPanel
          competition={competition}
          matchday={data.matchday}
          matches={data.matches}
          onClose={() => setShowAdmin(false)}
          onChanged={refreshNow}
        />
      )}
      {openTeam && <TeamModal team={openTeam} competition={competition} onClose={() => setOpenTeam(null)} />}

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
      {data.stageLabel && <p className="stagelabel">{data.stageLabel}</p>}

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

      <div className={`fadebox${loading ? ' loading' : ''}`}>
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
                  <MatchRow key={m.id} m={m} onPick={choose} onOpenTeam={setOpenTeam} />
                ))}
              </ul>
            </>
          ) : (
            <p className="muted empty">Aún no hay partidos cargados para esta jornada.</p>
          ))}

        {tab === 'clasificacion' && (
          <>
            <div className="seg" role="group" aria-label="Tipo de clasificación">
              <button type="button" aria-pressed={scope === 'jornada'} onClick={() => setScope('jornada')}>
                Jornada {data.matchday}
              </button>
              <button type="button" aria-pressed={scope === 'general'} onClick={() => setScope('general')}>
                General
              </button>
              <button type="button" aria-pressed={scope === 'combinada'} onClick={() => setScope('combinada')}>
                Combinada
              </button>
            </div>
            {scope === 'combinada' && (
              <p className="hint">Suma los puntos de las tres competiciones esta temporada.</p>
            )}
            <Ranking
              rows={rankRows}
              meId={data.me.id}
              showDelta={scope === 'general'}
              crown={scope === 'jornada' && data.jornadaComplete}
              provisional={scope === 'jornada' && data.jornadaLive}
            />
            <div className="share">
              <button type="button" className="link" onClick={shareRanking}>
                Compartir clasificación
              </button>
              {shareMsg && <span className="muted"> {shareMsg}</span>}
              {' · '}
              <button type="button" className="link" onClick={() => setShowArchive((v) => !v)}>
                Archivo de temporadas
              </button>
            </div>
            {showArchive && <Archive competition={competition} />}
          </>
        )}

        {tab === 'estadisticas' && (
          <Stats meId={data.me.id} competition={competition} version={data.finishedTotal} onTeamClick={setOpenTeam} />
        )}
      </div>
    </main>
  );
}
