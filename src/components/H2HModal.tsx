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

function Crest({ src }: { src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="thcrest" />
  ) : (
    <span className="thcrest" />
  );
}

function seasonLabel(iso: string) {
  const d = new Date(iso);
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${String(y).slice(2)}/${String(y + 1).slice(2)}`;
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={`Cara a cara entre ${teamA} y ${teamB}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="h2htitle">
            <Crest src={crestA} />
            <span className="h2hvs">vs</span>
            <Crest src={crestB} />
          </h2>
          <button type="button" className="link" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p className="h2hnames">
          {teamA} · {teamB}
        </p>

        {error && <p className="notice">No se pudo cargar el cara a cara.</p>}
        {!rows && !error && <p className="muted">Cargando…</p>}

        {summary && (
          <div className="h2hsummary">
            {total === 0 ? (
              <p className="muted empty">Todavía no hay enfrentamientos guardados entre estos dos equipos.</p>
            ) : (
              <>
                <div className="h2hbar">
                  {wA > 0 && <span className="h2hseg h2hseg-a" style={{ flex: wA }}>{summary!.winsA}</span>}
                  {wD > 0 && <span className="h2hseg h2hseg-d" style={{ flex: wD }}>{summary!.draws}</span>}
                  {wB > 0 && <span className="h2hseg h2hseg-b" style={{ flex: wB }}>{summary!.winsB}</span>}
                </div>
                <div className="h2hlegend">
                  <span>
                    <i className="dot dot-a" /> {teamA} ({summary!.winsA})
                  </span>
                  <span>
                    <i className="dot dot-d" /> Empates ({summary!.draws})
                  </span>
                  <span>
                    <i className="dot dot-b" /> {teamB} ({summary!.winsB})
                  </span>
                </div>
                <p className="hint">
                  Goles: {teamA} {summary!.goalsA} · {teamB} {summary!.goalsB}, en {total}{' '}
                  {total === 1 ? 'partido' : 'partidos'}
                </p>
              </>
            )}
          </div>
        )}

        {rows && rows.length > 0 && (
          <ul className="teamhist h2hlist">
            {rows.map((r) => (
              <li key={r.matchId}>
                <span className="thmd">
                  {COMP_LABEL[r.competition] ?? r.competition} {seasonLabel(r.utcDate)}
                  {r.stageLabel && ` · ${r.stageLabel}`}
                </span>
                <span className="h2hmatch">
                  <Crest src={r.homeCrest} />
                  <span className="thrival">
                    {r.homeTeam} {r.homeScore ?? '–'}-{r.awayScore ?? '–'} {r.awayTeam}
                  </span>
                  <Crest src={r.awayCrest} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
