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

function pointsPct(r: Rec5): number | null {
  return r.pj ? (r.pts / (r.pj * 3)) * 100 : null;
}
function pctColor(p: number): string {
  if (p >= 60) return 'var(--ok)';
  if (p >= 40) return 'var(--foco)';
  return 'var(--ko)';
}

function HouseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
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
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path
        d="M10 2.5c.6 0 1 .8 1 2.3v3.4l5.6 3.3c.3.2.4.4.4.7v1c0 .3-.2.4-.5.3L11 11.8v3l1.8 1.3c.2.2.3.3.3.6v.8c0 .3-.1.4-.4.3L10 17l-2.7.8c-.3.1-.4 0-.4-.3v-.8c0-.3.1-.4.3-.6L9 14.8v-3l-5.5 1.7c-.3.1-.5 0-.5-.3v-1c0-.3.1-.5.4-.7L9 7.2V4.8c0-1.5.4-2.3 1-2.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TotalIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="10" cy="10" r="2" fill="currentColor" />
    </svg>
  );
}

function Crest({ src, size = 20 }: { src: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="thcrest" style={{ width: size, height: size }} />
  ) : (
    <span className="thcrest" style={{ width: size, height: size }} />
  );
}

function TeamCard({ icon, label, r }: { icon: React.ReactNode; label: string; r: Rec5 }) {
  const p = pointsPct(r);
  const color = p != null ? pctColor(p) : 'var(--muted)';
  return (
    <div className="tcard">
      <div className="tcard-top">
        <span className="ticon" style={{ color }}>
          {icon}
        </span>
        <span className="tcard-label">{label}</span>
      </div>
      <div className="tcard-pct" style={{ color, ['--w' as string]: `${p ?? 0}%` }}>
        <b>{p != null ? `${fmt(p)}%` : '–'}</b>
        <small>de puntos</small>
      </div>
      <div className="tcard-detail">
        <span>
          {r.g}V {r.e}E {r.p}D
        </span>
        <span>
          {r.gf}:{r.gc}
        </span>
      </div>
    </div>
  );
}

function StatBlock({ record }: { record: Record_ }) {
  return (
    <div className="tstats">
      <div className="tcards">
        <TeamCard icon={<TotalIcon />} label="Total" r={record.total} />
        <TeamCard icon={<HouseIcon />} label="Casa" r={record.home} />
        <TeamCard icon={<PlaneIcon />} label="Fuera" r={record.away} />
      </div>
      <dl className="tfacts">
        <div>
          <dt>Goles por partido</dt>
          <dd>
            {fmt(record.total.pj ? record.total.gf / record.total.pj : 0, 1)} a favor ·{' '}
            {fmt(record.total.pj ? record.total.gc / record.total.pj : 0, 1)} en contra
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
  team: { name: string; crest: string | null };
  competition: string;
  onClose: () => void;
  onNavigate: (name: string, crest: string | null) => void;
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
    fetch(`/api/team?name=${encodeURIComponent(team.name)}&competition=${competition}`, { cache: 'no-store' })
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
  }, [team.name, competition]);

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
      <div className="modal" role="dialog" aria-label={`Resultados de ${team.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head teamhead">
          <div className="teamhead-title">
            {onBack && (
              <button type="button" className="backbtn" onClick={onBack} aria-label="Volver">
                ‹
              </button>
            )}
            <Crest src={team.crest} size={30} />
            <h2>{team.name}</h2>
          </div>
          <button type="button" className="link" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {error && <p className="notice">No se pudo cargar el historial de {team.name}.</p>}
        {!rows && !error && <p className="muted">Cargando…</p>}
        {record && <StatBlock record={record} />}
        {rows && rows.length === 0 && <p className="muted empty">Todavía no tiene partidos esta temporada.</p>}
        {rows && rows.length > 0 && (
          <ul className="teamhist">
            {rows.map((r, i) => (
              <li
                key={r.matchId}
                ref={i === currentIdx ? currentRef : null}
                className={`thmark-row-${r.mark ?? 'none'}${i === currentIdx ? ' thnow' : ''}`}
              >
                <span className="thmd">J{r.matchday}</span>
                <span className="thvenue" title={r.home ? 'En casa' : 'Fuera'}>
                  {r.home ? <HouseIcon /> : <PlaneIcon />}
                </span>
                <button type="button" className="thrivalbtn" onClick={() => onNavigate(r.rival, r.rivalCrest)}>
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
