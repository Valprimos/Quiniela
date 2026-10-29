'use client';

import { toggleFocos } from '@/lib/theme';

// La marca de la cabecera. Escondido en ella hay un interruptor: tocarla enciende y apaga
// los focos de estadio del modo oscuro. Sin pistas visuales, es un easter egg.
export default function Brand({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" className="brand brand-egg" onClick={() => toggleFocos()}>
      {children}
    </button>
  );
}
