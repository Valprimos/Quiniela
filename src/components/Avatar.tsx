'use client';

import { useEffect, useRef, useState } from 'react';

const hueOf = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();

// Foto de perfil redonda. `v` es la versión de la foto (null = sin foto): si no hay foto, o no carga,
// se muestran las iniciales sobre un color que depende del nombre.
export default function Avatar({ id, name, v, size = 28 }: { id: string; name: string; v: number | null; size?: number }) {
  const [bad, setBad] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => setBad(false), [id, v]);
  // Si la imagen falló antes de que React estuviera listo, onError no se ejecuta: se comprueba al montar
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setBad(true);
  }, [id, v]);

  if (v && !bad) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={img}
        className="avatar"
        src={`/api/avatar/${id}?v=${v}`}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        onError={() => setBad(true)}
      />
    );
  }
  const h = hueOf(name);
  return (
    <span
      className="avatar avatar-init"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: `hsl(${h} 38% 26%)`, color: `hsl(${h} 75% 82%)` }}
    >
      {initialsOf(name)}
    </span>
  );
}
