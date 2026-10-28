export type Theme = 'dark' | 'light';

export const THEME_KEY = 'quiniela-theme';
// Color de la barra del navegador en móvil: el oscuro de siempre y el verde del césped.
const BAR: Record<Theme, string> = { dark: '#0C171C', light: '#2f7d3a' };

// Script que se ejecuta antes de pintar (layout.tsx) para que no haya parpadeo oscuro → claro.
export const themeInitScript = `(function(){try{if(localStorage.getItem('${THEME_KEY}')==='light'){document.documentElement.setAttribute('data-theme','light');var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','${BAR.light}')}}catch(e){}})();`;

export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* modo privado: el cambio vale solo para esta visita */
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[t]);
}
