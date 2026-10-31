'use client';

import { useEffect, useState } from 'react';
import { applyTheme, currentTheme, type Theme } from '@/lib/theme';

// Estado del tema (oscuro de siempre o claro "campo de fútbol"), leído del <html> al montar.
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => setTheme(currentTheme()), []);
  const toggle = () => {
    const next: Theme = currentTheme() === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setTheme(next);
  };
  return [theme, toggle];
}

// Selector de aspecto para pantallas sin menú de usuario (el acceso): muestra las DOS opciones con su
// nombre y deja marcada la que está activa. La posición del deslizador y el resaltado los pinta el CSS a
// partir de <html data-theme>, que el script de layout.tsx pone antes de pintar: así no hay salto al cargar.
export default function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const light = theme === 'light';
  return (
    <div className="theme-pick">
      <span className="theme-pick-cap">Aspecto de la app</span>
      <button
        type="button"
        role="switch"
        aria-checked={light}
        aria-label={light ? 'Modo claro, día de partido. Pulsa para pasar a modo oscuro' : 'Modo oscuro, noche de estadio. Pulsa para pasar a modo claro'}
        className="theme-seg"
        onClick={toggle}
      >
        <em aria-hidden="true" />
        <span className="opt night">
          <i aria-hidden="true">🌙</i>
          <span className="opt-txt">
            <b>Oscuro</b>
            <small>Noche de estadio</small>
          </span>
        </span>
        <span className="opt day">
          <i aria-hidden="true">☀️</i>
          <span className="opt-txt">
            <b>Claro</b>
            <small>Día de partido</small>
          </span>
        </span>
      </button>
    </div>
  );
}
