'use client';

import type { LuckDTO, LuckPlayer } from '@/lib/luck';
import Avatar from './Avatar';

const num = (n: number, d = 1) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (n: number) => (Math.abs(n) < 0.05 ? '0,0' : `${n > 0 ? '+' : '−'}${num(Math.abs(n))}`);

// Índice de suerte: puntos reales menos los que "tocaban" según el xG de cada partido.
// Positivo = los resultados te han sonreído; negativo = han ido en tu contra.
export default function LuckCard({ luck, meId }: { luck?: LuckDTO; meId: string }) {
  if (!luck || luck.covered === 0) {
    return (
      <p className="muted">
        Todavía no hay xG cargado de los partidos, así que no se puede calcular. Un admin puede importarlo o ponerlo a mano
        desde el panel de admin (xG).
      </p>
    );
  }

  const ps = luck.players;
  const max = Math.max(1, ...ps.map((p) => Math.abs(p.luck)));
  // Clasificación con los puntos reales frente a la "justa" (puntos esperados), solo en partidos con xG
  const cmp = (a: LuckPlayer, b: LuckPlayer) => a.name.localeCompare(b.name, 'es');
  const byReal = [...ps].sort((a, b) => b.real - a.real || b.expected - a.expected || cmp(a, b));
  const byFair = [...ps].sort((a, b) => b.expected - a.expected || b.real - a.real || cmp(a, b));
  const small = luck.covered < luck.confident;

  return (
    <>
      <p className="luck-note">
        Puntos reales menos los que «tocaban» según el xG de cada partido. Con xG: {luck.covered} de {luck.finished} partidos
        terminados.
      </p>
      {small && (
        <p className="notice">
          Muestra pequeña ({luck.covered} de unos {luck.confident} partidos): de momento es más ruido que señal.
        </p>
      )}

      <ul className="luck-list">
        {ps.map((p) => {
          const pos = p.luck >= 0;
          const w = Math.min(100, (Math.abs(p.luck) / max) * 100);
          return (
            <li key={p.playerId} className="luck-row">
              <Avatar id={p.playerId} name={p.name} v={p.avatar} size={28} />
              <div className="luck-main">
                <div className="luck-top">
                  <span className="luck-name">
                    {p.name}
                    {p.playerId === meId && <span className="metag">tú</span>}
                  </span>
                  <span className={`luck-val ${Math.abs(p.luck) < 0.05 ? 'zero' : pos ? 'pos' : 'neg'}`}>{signed(p.luck)}</span>
                </div>
                <div className="luck-bar" aria-hidden="true">
                  <i className={pos ? 'pos' : 'neg'} style={{ width: `${w / 2}%` }} />
                </div>
                <span className="luck-sub">
                  {num(p.real, 0)} puntos · {num(p.expected)} esperados · {p.n} partidos con xG
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <h3 className="luck-sub-h">Clasificación justa</h3>
      <p className="luck-note">Orden por puntos esperados según xG, comparado con los puntos reales en estos mismos partidos con xG. ▲/▼ indica el cambio de puestos.</p>
      <ol className="luck-fair">
        {byFair.map((p, i) => {
          const d = byReal.indexOf(p) - i;
          return (
            <li key={p.playerId}>
              <span className="muted">{i + 1}</span>
              <span className="luck-name">
                {p.name}
                {p.playerId === meId && <span className="metag">tú</span>}
              </span>
              <b>{num(p.expected)}</b>
              <span className={`luck-d ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}>{d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : '='}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
