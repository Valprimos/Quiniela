'use client';

import type { FormEntry, FormMark } from '@/lib/stats';

const MARK_WORD: Record<FormMark, string> = { H: 'acierto', M: 'fallo', '-': 'sin pronóstico' };

// Texto que sale al pasar el ratón (o tocar) un punto: el partido, el resultado y lo que puso el jugador
export function tipText(mark: FormMark, e: FormEntry | undefined): string {
  if (!e) return MARK_WORD[mark];
  const guess = e.plenoGuess ? `${e.plenoGuess.home}-${e.plenoGuess.away}${e.pick ? ` (${e.pick})` : ''}` : e.pick;
  const sign = mark === 'H' ? ' ✓' : mark === 'M' ? ' ✗' : '';
  return [
    e.round,
    `${e.home} ${e.homeScore}-${e.awayScore} ${e.away}`,
    guess ? `Pronóstico: ${guess}${sign}` : 'Sin pronóstico',
  ].join('\n');
}

// Últimos partidos de un jugador como puntos de colores, cada uno con su detalle al pasar el ratón
export default function FormDotsTip({ marks, info }: { marks: FormMark[]; info: FormEntry[] }) {
  if (!marks.length) return null;
  return (
    <div className="pform" aria-label="Últimos partidos">
      <span className="pcap">Últimos {marks.length}</span>
      <span className="pform-dots">
        {marks.map((m, i) => {
          const text = tipText(m, info[i]);
          // Los de los extremos alinean la etiqueta hacia dentro para que no se salga de la ventana
          const side = marks.length >= 6 && i < 3 ? ' tip-l' : marks.length >= 6 && i >= marks.length - 3 ? ' tip-r' : '';
          return (
            <i
              key={i}
              tabIndex={0}
              className={`fd fd-${m === '-' ? 'n' : m}${side}`}
              data-tip={text}
              aria-label={text.replace(/\n/g, '. ')}
            />
          );
        })}
      </span>
    </div>
  );
}
