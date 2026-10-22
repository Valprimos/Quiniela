'use client';

import { useEffect, useRef, useState } from 'react';
import { competitionDef } from '@/lib/competitions';
import { compColor } from './statsUtil';

// Emblema de la competición en una pastilla clara (así se ve igual de bien en fondo oscuro).
// Si la imagen no carga, se muestra el punto de color de siempre.
export default function CompLogo({ code, size = 18 }: { code: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const def = competitionDef(code);

  // Si la imagen falló antes de que React estuviera listo, onError no llega a ejecutarse:
  // se comprueba también al montar.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return <i className="cdot" style={{ background: compColor(code), width: size * 0.5, height: size * 0.5 }} />;
  }
  return (
    <span className="clogo" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} src={def.logo} alt={def.short} loading="eager" onError={() => setFailed(true)} />
    </span>
  );
}
