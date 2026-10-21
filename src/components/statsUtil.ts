import type { Rec } from '@/lib/stats';
import { competitionDef } from '@/lib/competitions';

export const pctOf = (r: Rec | undefined): number | null => (r && r.n > 0 ? (r.h / r.n) * 100 : null);

export const fmt = (n: number | null, d = 0) =>
  n == null ? '–' : n.toLocaleString('es-ES', { maximumFractionDigits: d });

// Un color por competición, distinto de los de acierto (verde), fallo (rojo) y "yo" (amarillo)
export const COMP_COLOR: Record<string, string> = {
  PD: 'var(--c-pd)',
  CL: 'var(--c-cl)',
};
export const compColor = (code: string) => COMP_COLOR[code] ?? 'var(--muted)';
export const compName = (code: string) => competitionDef(code).short;
