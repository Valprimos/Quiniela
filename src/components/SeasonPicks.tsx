'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar';
import { RankEditor, RankReadOnly, type TeamInfo } from './SeasonRank';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { RowsSkeleton } from './Skeleton';
import {
  AWARD_GROUP_LABEL,
  AwardDef,
  AwardScore,
  PTS_EXACT,
  PTS_ZONE,
  PTS_ZONE_EXACT,
  TeamScore,
  ZONE_LABEL,
  ZONE_ORDER,
  Zones,
  fmtDeadline,
  fmtShort,
  untilText,
} from '@/lib/seasonPicks';
import { clear as clearCache } from '@/lib/clientCache';

type Everyone = {
  playerId: string;
  name: string;
  avatar: number | null;
  hasPicks: boolean;
  ranking: string[] | null;
  teamRows: TeamScore[];
  awards: Record<string, string>;
  awardRows: AwardScore[];
  rankingPoints: number;
  awardPoints: number;
  total: number;
};

type Data = {
  available: boolean;
  season: number;
  deadline: string | null;
  closed: boolean;
  teams: TeamInfo[];
  zones: Zones;
  maxPoints: { ranking: number; awards: number; total: number };
  awardsDef: AwardDef[];
  mine: { ranking: string[] | null; awards: Record<string, string> };
  progress: { ranking: boolean; awards: boolean; done: number; total: number };
  pending: string[];
  members: string[];
  me: { id: string; name: string };
  results: { order: string[] | null; source: 'oficial' | 'provisional' | 'calculada' | 'ninguna'; final: boolean; awards: Record<string, string[]> };
  everyone: Everyone[] | null;
};

type Tab = 'clasificacion' | 'premios' | 'ranking';
type Save = 'idle' | 'saving' | 'saved' | 'error';

const TABS: [Tab, string][] = [
  ['clasificacion', 'Clasificación'],
  ['premios', 'Premios individuales'],
  ['ranking', 'Ranking'],
];

export default function SeasonPicks({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  useBodyScrollLock();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('clasificacion');
  const [now, setNow] = useState(() => Date.now());

  // Borrador local (se guarda solo, unos instantes después de tocar algo)
  const [order, setOrder] = useState<string[]>([]);
  const [rankTouched, setRankTouched] = useState(false);
  const [awards, setAwards] = useState<Record<string, string>>({});
  const [save, setSave] = useState<Save>('idle');
  const dirty = useRef(false);
  const latest = useRef({ order, rankTouched, awards });
  latest.current = { order, rankTouched, awards };

  const load = useCallback(() => {
    return fetch('/api/season-picks', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: Data & { error?: string }) => {
        if (j.error || !j.available) {
          setError(j.error ?? 'Esta sección todavía no está activada.');
          return;
        }
        setData(j);
        if (!dirty.current) {
          setOrder(j.mine.ranking ?? j.results.order ?? j.teams.map((t) => t.name));
          setRankTouched(!!j.mine.ranking);
          setAwards(j.mine.awards ?? {});
        }
        setError(null);
      })
      .catch(() => setError('No se pudieron cargar las predicciones.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // Reloj: cuenta atrás y, al llegar la hora, se recarga para ver las predicciones de todos
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (data && !data.closed && data.deadline && now >= new Date(data.deadline).getTime()) {
      dirty.current = false;
      load();
    }
  }, [now, data, load]);

  const editable = !!data && !data.closed;

  const persist = useCallback(
    async (keepalive = false) => {
      if (!dirty.current) return;
      const cur = latest.current;
      dirty.current = false;
      setSave('saving');
      try {
        const res = await fetch('/api/season-picks', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          keepalive,
          body: JSON.stringify({
            ...(cur.rankTouched ? { ranking: cur.order } : {}),
            awards: cur.awards,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          setError(j?.error ?? 'No se pudo guardar.');
          dirty.current = true;
          setSave('error');
          return;
        }
        const j = await res.json();
        setError(null);
        setSave('saved');
        clearCache('seasonbrief');
        setData((d) => (d ? { ...d, progress: j.progress ?? d.progress } : d));
        onChanged();
      } catch {
        dirty.current = true;
        setSave('error');
      }
    },
    [onChanged]
  );

  // Autoguardado con una pequeña espera, para no mandar una petición por cada letra
  useEffect(() => {
    if (!dirty.current || !editable) return;
    const t = setTimeout(() => void persist(), 900);
    return () => clearTimeout(t);
  }, [order, awards, rankTouched, editable, persist]);

  const touch = () => {
    dirty.current = true;
    setSave('idle');
  };
  const changeOrder = (next: string[]) => {
    touch();
    setRankTouched(true);
    setOrder(next);
  };
  const changeAward = (key: string, v: string) => {
    touch();
    setAwards((a) => ({ ...a, [key]: v }));
  };
  const close = () => {
    void persist(true);
    onClose();
  };

  // Escape cierra
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El progreso se calcula con el borrador, para que las casillas reaccionen al momento
  const live = useMemo(() => {
    if (!data) return { ranking: false, awards: false, done: 0 };
    const ranking = rankTouched;
    const aw = data.awardsDef.every((a) => (awards[a.key] ?? '').trim());
    return { ranking, awards: aw, done: Number(ranking) + Number(aw) };
  }, [data, rankTouched, awards]);

  const left = data?.deadline ? new Date(data.deadline).getTime() - now : null;
  const urgent = editable && left != null && left < 24 * 3600e3 && live.done < 2;

  return (
    <div
      className="modal-backdrop sp-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      role="dialog"
      aria-modal="true"
      aria-label="Predicciones de temporada"
    >
      <div className="sp-modal">
        <header className="sp-head">
          <div className="sp-title">
            <span className="sp-trophy" aria-hidden="true">
              🏆
            </span>
            <div>
              <h2>Predicciones de temporada</h2>
              {data && (
                <small>
                  {String(data.season).slice(2)}/{String(data.season + 1).slice(2)}
                </small>
              )}
            </div>
          </div>
          <button type="button" className="backbtn" aria-label="Cerrar" onClick={close}>
            ×
          </button>
        </header>

        {data?.deadline && (
          <p className={`sp-deadline${urgent ? ' urgent' : ''}${data.closed ? ' closed' : ''}`}>
            {data.closed ? (
              <>
                <b>Cerradas</b> · {fmtShort(data.deadline)}. Ya se ven las de todos.
              </>
            ) : (
              <>
                Cierran el <b>{fmtDeadline(data.deadline)}</b>
                {left != null && <> · faltan {untilText(left)}</>}
              </>
            )}
          </p>
        )}

        <div className="sp-tabs" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {label}
              {editable && k === 'clasificacion' && <i className={live.ranking ? 'ok' : ''} aria-hidden="true" />}
              {editable && k === 'premios' && <i className={live.awards ? 'ok' : ''} aria-hidden="true" />}
            </button>
          ))}
        </div>

        <div className="sp-body">
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          {!data && !error && <RowsSkeleton rows={6} />}

          {data && tab === 'clasificacion' && (
            <ClasificacionTab
              data={data}
              editable={editable}
              order={order}
              rankTouched={rankTouched}
              onOrder={changeOrder}
            />
          )}
          {data && tab === 'premios' && (
            <PremiosTab data={data} editable={editable} awards={awards} onChange={changeAward} />
          )}
          {data && tab === 'ranking' && <RankingTab data={data} />}
        </div>

        {editable && (
          <footer className="sp-foot" aria-live="polite">
            <span className={`sp-save ${save}`}>
              {save === 'saving' && 'Guardando…'}
              {save === 'saved' && 'Guardado ✓'}
              {save === 'error' && 'No se pudo guardar. Reintentando al tocar algo.'}
              {save === 'idle' && (dirty.current ? 'Cambios sin guardar…' : 'Se guarda solo')}
            </span>
            <span className="sp-count">{live.done}/3 hechas</span>
          </footer>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Rules({ data }: { data: Data }) {
  const z = data.zones;
  const range = (k: keyof Zones) => (z[k][0] === z[k][1] ? `${z[k][0]}.º` : `${z[k][0]}.º–${z[k][1]}.º`);
  return (
    <details className="sp-rules">
      <summary>¿Cómo se puntúa?</summary>
      <ul>
        <li>
          Equipo en su <b>posición exacta</b>: <b>{PTS_EXACT}</b> puntos.
        </li>
        <li>
          En los <b>puestos clave</b> ({ZONE_ORDER.map((k) => `${ZONE_LABEL[k]} ${range(k)}`).join(' · ')}): si aciertas que
          acaba dentro de ese tramo pero no en su posición, <b>{PTS_ZONE}</b>; si además es la posición exacta, <b>{PTS_ZONE_EXACT}</b>{' '}
          en total (no se suman).
        </li>
        <li>
          Premios individuales, campeón y finalista de Champions: <b>3</b> puntos cada uno; Bota de Oro mundial: <b>5</b>.
        </li>
        <li>
          * Las plazas de Champions y Europa League pueden variar según el rendimiento europeo de LaLiga.
        </li>
        <li>
          Máximo posible: <b>{data.maxPoints.total}</b> ({data.maxPoints.ranking} de clasificación y {data.maxPoints.awards} de premios).
        </li>
        <li>MVP de la temporada: <b>5</b> puntos.</li>
      </ul>
    </details>
  );
}

function ClasificacionTab({
  data,
  editable,
  order,
  rankTouched,
  onOrder,
}: {
  data: Data;
  editable: boolean;
  order: string[];
  rankTouched: boolean;
  onOrder: (o: string[]) => void;
}) {
  const me = data.everyone?.find((e) => e.playerId === data.me.id);
  return (
    <>
      <Rules data={data} />
      {editable ? (
        <>
          <p className="sp-hint">
            {rankTouched
              ? 'Así queda tu clasificación. Arrastra los equipos o usa las flechas y los números.'
              : data.results.order
                ? 'La clasificación parte de la actual. Arrastra los equipos o usa las flechas y los números.'
                : 'Arrastra los equipos o usa las flechas y los números para ordenarlos.'}
          </p>
          <RankEditor order={order} teams={data.teams} zones={data.zones} onChange={onOrder} />
        </>
      ) : me?.ranking ? (
        <>
          <p className="sp-hint">
            Tu clasificación, comparada con la {data.results.source === 'oficial' ? 'oficial' : 'actual'}. Cada fila
            muestra dónde está ahora cada equipo.
          </p>
          <RankReadOnly rows={me.teamRows} teams={data.teams} zones={data.zones} />
        </>
      ) : (
        <p className="muted empty">No llegaste a hacer tu clasificación a tiempo.</p>
      )}
    </>
  );
}

function PremiosTab({
  data,
  editable,
  awards,
  onChange,
}: {
  data: Data;
  editable: boolean;
  awards: Record<string, string>;
  onChange: (key: string, v: string) => void;
}) {
  const me = data.everyone?.find((e) => e.playerId === data.me.id);
  const groups = (['liga', 'champions', 'mundial'] as const).map((g) => ({
    g,
    items: data.awardsDef.filter((a) => a.group === g),
  }));
  return (
    <>
      <h3>Premios individuales</h3>
      {editable && <p className="sp-hint">Escribe el nombre del jugador o del equipo para campeón y finalista.</p>}
      {groups.map(({ g, items }) => (
        <section key={g} className="sp-awards">
          <h3>{AWARD_GROUP_LABEL[g]}</h3>
          {items.map((a) => {
            const res = data.results.awards[a.key];
            const row = me?.awardRows.find((r) => r.key === a.key);
            return (
              <div key={a.key} className="sp-award">
                <label htmlFor={`aw-${a.key}`}>
                  {a.label}
                  <small>+{a.pts}</small>
                </label>
                {editable ? (
                  <input
                    id={`aw-${a.key}`}
                    value={awards[a.key] ?? ''}
                    maxLength={60}
                    autoComplete="off"
                    placeholder={a.team ? 'Equipo' : a.goalkeeper ? 'Portero' : 'Jugador'}
                    onChange={(e) => onChange(a.key, e.target.value)}
                  />
                ) : (
                  <div className={`sp-award-ro${row?.hit ? ' hit' : row?.decided ? ' miss' : ''}`}>
                    <b>{awards[a.key] || '—'}</b>
                    {row?.decided ? (
                      <span>
                        {row.hit ? `+${row.pts}` : '0'} · {res?.join(', ')}
                      </span>
                    ) : (
                      <span>sin resolver</span>
                    )}
                  </div>
                )}
                {a.key === 'mvp' && <small className="sp-award-note">Premio subjetivo votado entre los miembros.</small>}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}

function RankingTab({ data }: { data: Data }) {
  const [open, setOpen] = useState<string | null>(null);

  if (!data.closed || !data.everyone) {
    const total = data.members.length;
    const sent = total - data.pending.length;
    return (
      <div className="sp-locked">
        <span aria-hidden="true">🔒</span>
        <b>Se publican al cerrar</b>
        <p>
          Hasta {data.deadline ? fmtShort(data.deadline) : 'que cierre el plazo'} nadie ve lo que ha puesto nadie. Entonces
          aparecerá aquí lo de todos, con los puntos.
        </p>
        <p className="sp-lockcount">
          {sent} de {total} lo tienen completo
          {data.pending.length > 0 && <> · faltan: {data.pending.join(', ')}</>}
        </p>
      </div>
    );
  }

  const src =
    data.results.source === 'oficial'
      ? 'Puntos con la clasificación final oficial.'
      : data.results.source === 'calculada'
        ? 'Puntos con la clasificación final calculada.'
        : data.results.source === 'provisional'
          ? 'Puntos provisionales: con la clasificación de hoy (los premios puntúan cuando se resuelven).'
          : 'Todavía no hay resultados: los puntos empiezan a contar con los primeros partidos.';

  let pos = 0;
  let prev: number | null = null;

  return (
    <>
      <p className="sp-hint">{src}</p>
      <ul className="sp-board">
        {data.everyone.map((e, i) => {
          if (e.total !== prev) {
            pos = i + 1;
            prev = e.total;
          }
          const isOpen = open === e.playerId;
          return (
            <li key={e.playerId} className={e.playerId === data.me.id ? 'me' : undefined}>
              <button type="button" className="sp-board-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.playerId)}>
                <span className="sp-board-pos">{e.hasPicks ? pos : '–'}</span>
                <Avatar id={e.playerId} name={e.name} v={e.avatar} size={32} />
                <span className="sp-board-name">
                  <b>{e.name}</b>
                  <small>{e.hasPicks ? `${e.rankingPoints} clasificación · ${e.awardPoints} premios` : 'No hizo predicciones'}</small>
                </span>
                <span className="sp-board-total">{e.total}</span>
                <span aria-hidden="true" className="sp-caret">
                  {isOpen ? '▴' : '▾'}
                </span>
              </button>
              {isOpen && e.hasPicks && (
                <div className="sp-board-detail">
                  {e.ranking ? (
                    <RankReadOnly rows={e.teamRows} teams={data.teams} zones={data.zones} />
                  ) : (
                    <p className="muted">Sin clasificación.</p>
                  )}
                  <ul className="sp-aw-list">
                    {data.awardsDef.map((a) => {
                      const r = e.awardRows.find((x) => x.key === a.key);
                      return (
                        <li key={a.key} className={r?.hit ? 'hit' : r?.decided ? 'miss' : ''}>
                          <span>
                            {AWARD_GROUP_LABEL[a.group]} · {a.label}
                          </span>
                          <b>{e.awards[a.key] || '—'}</b>
                          {r?.hit && <em>+{r.pts}</em>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
