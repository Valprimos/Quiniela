'use client';

import { useEffect, useState } from 'react';

type Row = {
  matchId: number;
  utcDate: string;
  competition: string;
  stageLabel: string | null;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};
type Summary = { winsA: number; winsB: number; draws: number; goalsA: number; goalsB: number; played: number };

const COMP_LABEL: Record<string, string> = { PD: 'Primera', CL: 'Champions' };

function Crest({ src, size = 20 }: { src: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="thcrest" style={{ width: size, height: size }} />
  ) : (
    <span className="thcrest" style={{ width: size, height: size }} />
  );
}

function seasonLabel(iso: string) {
  const d = new Date(iso);
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${String(y).slice(2)}/${String(y + 1).slice(2)}`;
}

// El contenido de verdad (resumen + listado), reutilizado tanto en el modal que se abre
// desde un partido como en el buscador libre de "Cara a cara" de Estadísticas.
export function H2HBody({
  teamA,
  teamB,
  crestA,
  crestB,
}: {
  teamA: string;
  teamB: string;
  crestA: string | null;
  crestB: string | null;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setSummary(null);
    setRows(null);
    setError(false);
    fetch(`/api/h2h?teamA=${encodeURIComponent(teamA)}&teamB=${encodeURIComponent(teamB)}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((j) => {
        if (!alive) return;
        setSummary(j.summary);
        setRows(j.matches);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [teamA, teamB]);

  const total = summary?.played ?? 0;
  const wA = total ? (summary!.winsA / total) * 100 : 0;
  const wD = total ? (summary!.draws / total) * 100 : 0;
  const wB = total ? (summary!.winsB / total) * 100 : 0;
  const dominant =
    summary && total >= 3 && summary.winsA !== summary.winsB
      ? summary.winsA > summary.winsB
        ? teamA
        : teamB
      : null;

  return (
    <>
      {error && <p className="notice">No se pudo cargar el cara a cara.</p>}
      {!rows && !error && <p className="muted">Cargando…</p>}

      {summary && (
        <div className="h2hsummary">
          {total === 0 ? (
            <p className="muted empty">Todavía no hay enfrentamientos guardados entre estos dos equipos.</p>
          ) : (
            <>
              <div className="h2hbar">
                {wA > 0 && (
                  <span className="h2hseg h2hseg-a" style={{ flex: wA }}>
                    {summary.winsA}
                  </span>
                )}
                {wD > 0 && (
                  <span className="h2hseg h2hseg-d" style={{ flex: wD }}>
                    {summary.draws}
                  </span>
                )}
                {wB > 0 && (
                  <span className="h2hseg h2hseg-b" style={{ flex: wB }}>
                    {summary.winsB}
                  </span>
                )}
              </div>
              <div className="h2hlegend">
                <span>
                  <Crest src={crestA} size={16} /> {teamA} ({summary.winsA})
                </span>
                <span>
                  <i className="dot dot-d" /> Empates ({summary.draws})
                </span>
                <span>
                  <Crest src={crestB} size={16} /> {teamB} ({summary.winsB})
                </span>
              </div>
              {dominant && <p className="h2hdominant">{dominant} manda en este cruce</p>}
              <p className="hint">
                Goles: {teamA} {summary.goalsA} · {teamB} {summary.goalsB}, en {total}{' '}
                {total === 1 ? 'partido' : 'partidos'}
              </p>
            </>
          )}
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className="teamhist h2hlist">
          {rows.map((r) => {
            const homeWon = r.homeScore != null && r.awayScore != null && r.homeScore > r.awayScore;
            const awayWon = r.homeScore != null && r.awayScore != null && r.awayScore > r.homeScore;
            return (
              <li key={r.matchId} className={`h2hrow${r.status !== 'FINISHED' ? ' h2hrow-pending' : ''}`}>
                <span className="thmd">
                  {COMP_LABEL[r.competition] ?? r.competition} {seasonLabel(r.utcDate)}
                  {r.stageLabel && ` · ${r.stageLabel}`}
                </span>
                <span className="h2hmatch">
                  <span className={`h2hside${homeWon ? ' h2hside-win' : ''}`}>
                    <Crest src={r.homeCrest} />
                    {r.homeTeam}
                  </span>
                  <span className="h2hscoreline">
                    {r.homeScore ?? '–'}-{r.awayScore ?? '–'}
                  </span>
                  <span className={`h2hside h2hside-right${awayWon ? ' h2hside-win' : ''}`}>
                    {r.awayTeam}
                    <Crest src={r.awayCrest} />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function H2HModal({
  teamA,
  teamB,
  crestA,
  crestB,
  onClose,
}: {
  teamA: string;
  teamB: string;
  crestA: string | null;
  crestB: string | null;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label={`Cara a cara entre ${teamA} y ${teamB}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="h2htitle">
            <Crest src={crestA} size={32} />
            <span className="h2hvs">vs</span>
            <Crest src={crestB} size={32} />
          </h2>
          <button type="button" className="link" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p className="h2hnames">
          {teamA} · {teamB}
        </p>
        <H2HBody teamA={teamA} teamB={teamB} crestA={crestA} crestB={crestB} />
      </div>
    </div>
  );
}
