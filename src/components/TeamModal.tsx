'use client';

import { useEffect, useRef, useState } from 'react';

type Row = {
  matchId: number;
  matchday: number;
  utcDate: string;
  status: string;
  home: boolean;
  rival: string;
  rivalCrest: string | null;
  gf: number | null;
  gc: number | null;
  mark: 'G' | 'E' | 'P' | null;
};

type Rec5 = { pj: number; g: number; e: number; p: number; gf: number; gc: number; pts: number };
type Record_ = {
  total: Rec5;
  home: Rec5;
  away: Rec5;
  cleanSheets: number;
  failedToScore: number;
  biggestWin: { rival: string; score: string } | null;
  biggestLoss: { rival: string; score: string } | null;
};

const MARK_TXT: Record<'G' | 'E' | 'P', string> = { G: 'Ganó', E: 'Empató', P: 'Perdió' };
const fmt = (n: number, d = 0) => n.toLocaleString('es-ES', { maximumFractionDigits: d });
const pct = (n: number, total: number) => (total ? `${fmt((n / total) * 100)}%` : '–');

function HouseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" className="venueicon">
      <path
        d="M3 9.5 10 3l7 6.5M4.5 8.5V17h11V8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M8 17v-5h4v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" className="venueicon">
      <path
        d="M10 2.5c.6 0 1 .8 1 2.3v3.4l5.6 3.3c.3.2.4.4.4.7v1c0 .3-.2.4-.5.3L11 11.8v3l1.8 1.3c.2.2.3.3.3.6v.8c0 .3-.1.4-.4.3L10 17l-2.7.8c-.3.1-.4 0-.4-.3v-.8c0-.3.1-.4.3-.6L9 14.8v-3l-5.5 1.7c-.3.1-.5 0-.5-.3v-1c0-.3.1-.5.4-.7L9 7.2V4.8c0-1.5.4-2.3 1-2.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Crest({ src }: { src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="thcrest" />
  ) : (
    <span className="thcrest" />
  );
}

function StatBlock({ record }: { record: Record_ }) {
  const { total, home, away } = record;
  return (
    <div className="tstats">
      <div className="trow-head">
        <span />
        <span>PJ</span>
        <span>V-E-D</span>
        <span>GF:GC</span>
        <span>% victorias</span>
      </div>
      <div className="trow">
        <span className="tlabel">Total</span>
        <span>{total.pj}</span>
        <span>
          {total.g}-{total.e}-{total.p}
        </span>
        <span>
          {total.gf}:{total.gc}
        </span>
        <span>{pct(total.g, total.pj)}</span>
      </div>
      <div className="trow">
        <span className="tlabel">Como local</span>
        <span>{home.pj}</span>
        <span>
          {home.g}-{home.e}-{home.p}
        </span>
        <span>
          {home.gf}:{home.gc}
        </span>
        <span>{pct(home.g, home.pj)}</span>
      </div>
      <div className="trow">
        <span className="tlabel">Como visitante</span>
        <span>{away.pj}</span>
        <span>
          {away.g}-{away.e}-{away.p}
        </span>
        <span>
          {away.gf}:{away.gc}
        </span>
        <span>{pct(away.g, away.pj)}</span>
      </div>
      <dl className="tfacts">
        <div>
          <dt>Goles por partido</dt>
          <dd>
            {fmt(total.pj ? total.gf / total.pj : 0, 1)} a favor · {fmt(total.pj ? total.gc / total.pj : 0, 1)} en
            contra
          </dd>
        </div>
        <div>
          <dt>Portería a cero</dt>
          <dd>{record.cleanSheets}</dd>
        </div>
        <div>
          <dt>Partidos sin marcar</dt>
          <dd>{record.failedToScore}</dd>
        </div>
        <div>
          <dt>Mayor goleada a favor</dt>
          <dd>{record.biggestWin ? `${record.biggestWin.score} vs ${record.biggestWin.rival}` : '–'}</dd>
        </div>
        <div>
          <dt>Mayor goleada en contra</dt>
          <dd>{record.biggestLoss ? `${record.biggestLoss.score} vs ${record.biggestLoss.rival}` : '–'}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function TeamModal({
  team,
  competition,
  onClose,
  onNavigate,
  onBack,
}: {
  team: string;
  competition: string;
  onClose: () => void;
  onNavigate: (team: string) => void;
  onBack?: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [record, setRecord] = useState<Record_ | null>(null);
  const [error, setError] = useState(false);
  const currentRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setRecord(null);
    setError(false);
    fetch(`/api/team?name=${encodeURIComponent(team)}&competition=${competition}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((j) => {
        if (!alive) return;
        setRows(j.matches);
        setRecord(j.record);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [team, competition]);

  // En cuanto llegan los datos, se abre ya colocado en la jornada actual (el primer
  // partido que todavía no se ha jugado), no siempre al principio de la temporada.
  useEffect(() => {
    if (rows && currentRef.current) {
      currentRef.current.scrollIntoView({ block: 'center' });
    }
  }, [rows]);

  const now = Date.now();
  const currentIdx = rows
    ? (() => {
        const i = rows.findIndex((r) => r.status !== 'FINISHED' && new Date(r.utcDate).getTime() >= now - 3 * 3600e3);
        return i === -1 ? rows.length - 1 : i;
      })()
    : -1;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={`Resultados de ${team}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            {onBack && (
              <button type="button" className="backbtn" onClick={onBack} aria-label="Volver">
                ‹
              </button>
            )}
            {team}
          </h2>
          <button type="button" className="link" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {error && <p className="notice">No se pudo cargar el historial de {team}.</p>}
        {!rows && !error && <p className="muted">Cargando…</p>}
        {record && <StatBlock record={record} />}
        {rows && rows.length === 0 && <p className="muted empty">Todavía no tiene partidos esta temporada.</p>}
        {rows && rows.length > 0 && (
          <ul className="teamhist">
            {rows.map((r, i) => (
              <li key={r.matchId} ref={i === currentIdx ? currentRef : null} className={i === currentIdx ? 'thnow' : ''}>
                <span className="thmd">J{r.matchday}</span>
                <span className="thvenue" title={r.home ? 'En casa' : 'Fuera'}>
                  {r.home ? <HouseIcon /> : <PlaneIcon />}
                </span>
                <button type="button" className="thrivalbtn" onClick={() => onNavigate(r.rival)}>
                  <Crest src={r.rivalCrest} />
                  <span className="thrival">{r.rival}</span>
                </button>
                <span className="thscore">{r.gf != null && r.gc != null ? `${r.gf}-${r.gc}` : '–'}</span>
                {r.mark && (
                  <span className={`thmark thmark-${r.mark}`} title={MARK_TXT[r.mark]}>
                    {r.mark}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
