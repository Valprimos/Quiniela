export type Theme = 'dark' | 'light';

export const THEME_KEY = 'quiniela-theme';
export const FOCOS_KEY = 'quiniela-focos';
// Color de la barra del navegador en móvil: el oscuro de siempre y el verde del césped.
const BAR: Record<Theme, string> = { dark: '#0b2616', light: '#2f7d3a' };

// Script que se ejecuta antes de pintar (layout.tsx) para que no haya parpadeo oscuro → claro.
export const themeInitScript = `(function(){try{var d=document.documentElement;if(localStorage.getItem('${THEME_KEY}')==='light'){d.setAttribute('data-theme','light');var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','${BAR.light}')}if(localStorage.getItem('${FOCOS_KEY}')==='off')d.setAttribute('data-focos','off')}catch(e){}})();`;

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

// Easter egg: focos de estadio del modo oscuro. Encendidos por defecto; solo se guarda el "apagado".
// En modo claro (de día) no hacen nada.
let warmTimer: ReturnType<typeof setTimeout> | undefined;

export function toggleFocos(): boolean | null {
  const root = document.documentElement;
  if (root.getAttribute('data-theme') === 'light') return null;
  const turnOn = root.getAttribute('data-focos') === 'off';
  if (turnOn) root.removeAttribute('data-focos');
  else root.setAttribute('data-focos', 'off');
  try {
    if (turnOn) localStorage.removeItem(FOCOS_KEY);
    else localStorage.setItem(FOCOS_KEY, 'off');
  } catch {
    /* modo privado: vale solo para esta visita */
  }
  clearTimeout(warmTimer);
  root.classList.remove('focos-warm');
  if (turnOn) {
    void root.offsetWidth; // reinicia la animación si se pulsa rápido
    root.classList.add('focos-warm');
    warmTimer = setTimeout(() => root.classList.remove('focos-warm'), 2000);
  }
  return turnOn;
}
