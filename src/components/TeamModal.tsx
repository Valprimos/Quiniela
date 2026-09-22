'use client';

import { useEffect, useState } from 'react';

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

const MARK_TXT: Record<'G' | 'E' | 'P', string> = { G: 'Ganó', E: 'Empató', P: 'Perdió' };

export default function TeamModal({
  team,
  competition,
  onClose,
}: {
  team: string;
  competition: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(false);
    fetch(`/api/team?name=${encodeURIComponent(team)}&competition=${competition}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((j) => alive && setRows(j.matches))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [team, competition]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={`Resultados de ${team}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{team}</h2>
          <button type="button" className="link" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {error && <p className="notice">No se pudo cargar el historial de {team}.</p>}
        {!rows && !error && <p className="muted">Cargando…</p>}
        {rows && rows.length === 0 && <p className="muted empty">Todavía no tiene partidos esta temporada.</p>}
        {rows && rows.length > 0 && (
          <ul className="teamhist">
            {rows.map((r) => (
              <li key={r.matchId}>
                <span className="thmd">J{r.matchday}</span>
                <span className="thrival">
                  {r.home ? 'vs' : '@'} {r.rival}
                </span>
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
