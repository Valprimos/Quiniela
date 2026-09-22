'use client';

import { useEffect, useState } from 'react';

type Standing = { player_name: string; points: number; pos: number };
type SeasonRow = { season: number; standings: Standing[] };

export default function Archive({ competition }: { competition: string }) {
  const [seasons, setSeasons] = useState<SeasonRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    setSeasons(null);
    fetch(`/api/archive?competition=${competition}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => alive && setSeasons(j.seasons))
      .catch(() => alive && setSeasons([]));
    return () => {
      alive = false;
    };
  }, [competition]);

  if (!seasons) return <p className="muted">Cargando…</p>;
  if (seasons.length === 0) {
    return <p className="muted empty">Todavía no se ha archivado ninguna temporada.</p>;
  }
  return (
    <div className="archive">
      {seasons.map((s) => (
        <div key={s.season} className="archive-season">
          <h3>
            {s.season}/{String(s.season + 1).slice(2)}
          </h3>
          <ol className="rank">
            {s.standings.map((row) => (
              <li key={row.player_name}>
                <span className="pos">{row.pos}</span>
                <span className="who">{row.player_name}</span>
                <span />
                <span className="pts">{row.points}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
