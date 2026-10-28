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

// Enlace suelto para pantallas sin menú de usuario (el acceso).
export default function ThemeToggle({ className = 'link' }: { className?: string }) {
  const [theme, toggle] = useTheme();
  return (
    <button type="button" className={className} onClick={toggle}>
      {theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
    </button>
  );
}
