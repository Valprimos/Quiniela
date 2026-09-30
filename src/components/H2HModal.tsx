'use client';

import { Fragment, useEffect, useState } from 'react';
import { pairTeamColors, teamFill } from '@/lib/league';

type Row = {
  matchId: number;
  utcDate: string;
  season: number | null;
  aIsHome: boolean;
  scoreA: number | null;
  scoreB: number | null;
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
const fmt = (n: number, d = 0) => n.toLocaleString('es-ES', { maximumFractionDigits: d });

function Crest({ src, size = 20 }: { src: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="thcrest" style={{ width: size, height: size }} />
  ) : (
    <span className="thcrest" style={{ width: size, height: size }} />
  );
}

function seasonOf(r: Row): number {
  if (r.season != null) return r.season;
  const d = new Date(r.utcDate);
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

// Una fila de comparación: valor de A · etiqueta · valor de B. Se resalta el que "gana".
function Cmp({
  label,
  a,
  b,
  aNum,
  bNum,
  colorA,
  colorB,
}: {
  label: string;
  a: string;
  b: string;
  aNum: number;
  bNum: number;
  colorA: string;
  colorB: string;
}) {
  return (
    <div className="cmp">
      <b style={aNum > bNum ? { color: colorA } : undefined}>{a}</b>
      <span>{label}</span>
      <b style={bNum > aNum ? { color: colorB } : undefined}>{b}</b>
    </div>
  );
}

// Contenido del cara a cara, reutilizado en el modal que se abre desde un partido y en el
// buscador libre de Estadísticas. El equipo A va siempre en dorado y el B en azul, para no
// mezclarlo con los colores de ganar/perder del resto de la app.
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
  const { home: colorA, away: colorB } = pairTeamColors(teamA, teamB);
  const fillA = teamFill(teamA, colorA);
  const fillB = teamFill(teamB, colorB);

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
  const done = (rows ?? []).filter((r) => r.status === 'FINISHED' && r.scoreA != null && r.scoreB != null);

  // Datos derivados del listado
  const homeWinsA = done.filter((r) => r.aIsHome && r.scoreA! > r.scoreB!).length;
  const homeWinsB = done.filter((r) => !r.aIsHome && r.scoreB! > r.scoreA!).length;
  const bestA = done.filter((r) => r.scoreA! > r.scoreB!).sort((x, y) => y.scoreA! - y.scoreB! - (x.scoreA! - x.scoreB!))[0];
  const bestB = done.filter((r) => r.scoreB! > r.scoreA!).sort((x, y) => y.scoreB! - y.scoreA! - (x.scoreB! - x.scoreA!))[0];
  const last5 = done.slice(0, 5);

  return (
    <>
      {error && <p className="notice">No se pudo cargar el cara a cara.</p>}
      {!rows && !error && <p className="muted">Cargando…</p>}

      {summary && (
        <>
          <div className="h2hhero">
            <div className="h2hteam">
              <Crest src={crestA} size={46} />
              <span style={{ color: colorA }}>{teamA}</span>
            </div>
            <div className="h2hcenter">
              <div className="h2hbig">
                <b style={{ color: colorA }}>{summary.winsA}</b>
                <i>·</i>
                <b className="cd">{summary.draws}</b>
                <i>·</i>
                <b style={{ color: colorB }}>{summary.winsB}</b>
              </div>
              <small>victorias · empates · victorias</small>
            </div>
            <div className="h2hteam">
              <Crest src={crestB} size={46} />
              <span style={{ color: colorB }}>{teamB}</span>
            </div>
          </div>

          {total === 0 ? (
            <p className="muted empty">
              Todavía no hay enfrentamientos guardados entre estos dos equipos. Un admin puede traer temporadas
              anteriores desde su panel.
            </p>
          ) : (
            <>
              <div className="h2hbar" role="img" aria-label={`${summary.winsA} victorias de ${teamA}, ${summary.draws} empates, ${summary.winsB} victorias de ${teamB}`}>
                {summary.winsA > 0 && <span className="h2hseg" style={{ flex: summary.winsA, background: fillA }} />}
                {summary.draws > 0 && <span className="h2hseg h2hseg-d" style={{ flex: summary.draws }} />}
                {summary.winsB > 0 && <span className="h2hseg" style={{ flex: summary.winsB, background: fillB }} />}
              </div>

              <div className="cmps">
                <Cmp label="Goles" a={String(summary.goalsA)} b={String(summary.goalsB)} aNum={summary.goalsA} bNum={summary.goalsB} colorA={colorA} colorB={colorB} />
                <Cmp
                  label="Goles por partido"
                  a={fmt(summary.goalsA / total, 1)}
                  b={fmt(summary.goalsB / total, 1)}
                  aNum={summary.goalsA}
                  bNum={summary.goalsB}
                  colorA={colorA}
                  colorB={colorB}
                />
                <Cmp label="Victorias en su campo" a={String(homeWinsA)} b={String(homeWinsB)} aNum={homeWinsA} bNum={homeWinsB} colorA={colorA} colorB={colorB} />
                <Cmp
                  label="Mayor victoria"
                  a={bestA ? `${bestA.scoreA}-${bestA.scoreB}` : '–'}
                  b={bestB ? `${bestB.scoreB}-${bestB.scoreA}` : '–'}
                  aNum={bestA ? bestA.scoreA! - bestA.scoreB! : 0}
                  bNum={bestB ? bestB.scoreB! - bestB.scoreA! : 0}
                  colorA={colorA}
                  colorB={colorB}
                />
              </div>

              {last5.length > 0 && (
                <div className="h2hlast">
                  <span className="h2hlast-title">Últimos {last5.length} cruces</span>
                  <div className="h2hlast-chips">
                    {last5.map((r) => {
                      const chipFill = r.scoreA! > r.scoreB! ? fillA : r.scoreB! > r.scoreA! ? fillB : undefined;
                      return (
                        <span
                          key={r.matchId}
                          className={`h2hchip${chipFill ? '' : ' chip-d'}`}
                          style={chipFill ? { background: chipFill, color: '#141414' } : undefined}
                          title={`${r.homeTeam} ${r.homeScore}-${r.awayScore} ${r.awayTeam}`}
                        >
                          {r.scoreA}-{r.scoreB}
                        </span>
                      );
                    })}
                  </div>
                  <small className="muted">Marcador visto desde {teamA}</small>
                </div>
              )}
            </>
          )}
        </>
      )}

      {rows && rows.length > 0 && (
        <ul className="h2hcards">
          {rows.map((r, i) => {
            const played = r.homeScore != null && r.awayScore != null && r.status === 'FINISHED';
            const homeWon = played && r.homeScore! > r.awayScore!;
            const awayWon = played && r.awayScore! > r.homeScore!;
            const homeColor = r.aIsHome ? colorA : colorB;
            const awayColor = r.aIsHome ? colorB : colorA;
            const s = seasonOf(r);
            const newSeason = i === 0 || seasonOf(rows[i - 1]) !== s;
            return (
              <Fragment key={r.matchId}>
                {newSeason && (
                  <li className="h2hseason">
                    Temporada {String(s).slice(2)}/{String(s + 1).slice(2)}
                  </li>
                )}
                <li className={`h2hcard${played ? '' : ' h2hcard-pending'}`}>
                  <div className="h2hmeta">
                    {new Date(r.utcDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })}
                    {' · '}
                    {COMP_LABEL[r.competition] ?? r.competition}
                    {r.stageLabel && ` · ${r.stageLabel}`}
                    {!played && ' · por jugar'}
                  </div>
                  <div className="h2hgame">
                    <span className={`h2hside h2hside-l${homeWon ? ' won' : awayWon ? ' lost' : ''}`}>
                      <span className="h2hname" style={homeWon ? { color: homeColor } : undefined}>{r.homeTeam}</span>
                      <Crest src={r.homeCrest} size={22} />
                    </span>
                    <span className="h2hres">
                      {r.homeScore ?? '–'}
                      <i>-</i>
                      {r.awayScore ?? '–'}
                    </span>
                    <span className={`h2hside h2hside-r${awayWon ? ' won' : homeWon ? ' lost' : ''}`}>
                      <Crest src={r.awayCrest} size={22} />
                      <span className="h2hname" style={awayWon ? { color: awayColor } : undefined}>{r.awayTeam}</span>
                    </span>
                  </div>
                </li>
              </Fragment>
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
          <h2 className="h2hheading">Cara a cara</h2>
          <button type="button" className="link" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <H2HBody teamA={teamA} teamB={teamB} crestA={crestA} crestB={crestB} />
      </div>
    </div>
  );
}
