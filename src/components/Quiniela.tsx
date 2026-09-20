'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Pick = '1' | 'X' | '2';
type Team = { name: string; crest: string | null };
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
type RankRow = { playerId: string; name: string; points: number };
type StateDTO = {
  me: { id: string; name: string };
  season: number;
  matchday: number;
  currentMatchday: number;
  matchdays: number[];
  matches: MatchDTO[];
  finished: number;
  rankingJornada: RankRow[];
  rankingGeneral: RankRow[];
};

const PICKS: Pick[] = ['1', 'X', '2'];

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
      {score != null && <span className="score">{score}</span>}
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

function Ranking({ rows, meId }: { rows: RankRow[]; meId: string }) {
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
            <span className="who">{r.name}</span>
            <span className="pts">{r.points}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function Quiniela() {
  const router = useRouter();
  const [data, setData] = useState<StateDTO | null>(null);
  const [md, setMd] = useState<number | null>(null);
  const [tab, setTab] = useState<'pronosticos' | 'clasificacion'>('pronosticos');
  const [scope, setScope] = useState<'jornada' | 'general'>('jornada');
  const [error, setError] = useState<string | null>(null);

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

  async function choose(m: MatchDTO, pick: Pick) {
    if (m.locked || !data) return;
    setData({
      ...data,
      matches: data.matches.map((x) => (x.id === m.id ? { ...x, myPick: pick } : x)),
    });
    const res = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matchId: m.id, pick }),
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

  return (
    <main className="wrap">
      <header className="top">
        <span className="brand">Quiniela {seasonLabel}</span>
        <button type="button" className="link" onClick={logout}>
          Salir ({data.me.name})
        </button>
      </header>

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
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === 'pronosticos'}
          onClick={() => setTab('pronosticos')}
        >
          Pronósticos
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === 'clasificacion'}
          onClick={() => setTab('clasificacion')}
        >
          Clasificación
        </button>
      </div>

      {tab === 'pronosticos' ? (
        data.matches.length ? (
          <ul className="matches">
            {data.matches.map((m) => (
              <MatchRow key={m.id} m={m} onPick={choose} />
            ))}
          </ul>
        ) : (
          <p className="muted empty">Aún no hay partidos cargados para esta jornada.</p>
        )
      ) : (
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
            rows={scope === 'jornada' ? data.rankingJornada : data.rankingGeneral}
            meId={data.me.id}
          />
        </>
      )}
    </main>
  );
}
