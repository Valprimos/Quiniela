export type Pick = '1' | 'X' | '2';

export const OPEN_STATUSES = ['SCHEDULED', 'TIMED'];
export const LIVE_STATUSES = ['IN_PLAY', 'PAUSED', 'LIVE'];

// Resultado ya cerrado (partido terminado): el único que cuenta para los puntos de verdad.
export function resultOf(
  status: string,
  home: number | null,
  away: number | null
): Pick | null {
  if (status !== 'FINISHED' || home == null || away == null) return null;
  return home > away ? '1' : home < away ? '2' : 'X';
}

// Fuente única para los puntos de un pronóstico ya terminado: partidos normales,
// 1 punto por acertar el signo; Pleno al 15, 3 puntos solo por acertar el marcador.
export function pointsForPrediction(input: {
  result: Pick | null;
  pick: string | null;
  isPleno: boolean;
  homeScore: number | null;
  awayScore: number | null;
  plenoHome: number | null;
  plenoAway: number | null;
}): number {
  const { result, pick, isPleno, homeScore, awayScore, plenoHome, plenoAway } = input;
  if (result == null) return 0;
  if (isPleno) return plenoHome === homeScore && plenoAway === awayScore ? 3 : 0;
  return pick === result ? 1 : 0;
}

// Resultado "en vivo": lo mismo, pero también vale con el marcador de un partido en juego.
// Se usa solo para pintar la pantalla mientras se juega; nunca para guardar puntos reales.
export function liveResultOf(
  status: string,
  home: number | null,
  away: number | null
): Pick | null {
  const closed = resultOf(status, home, away);
  if (closed) return closed;
  if (!LIVE_STATUSES.includes(status) || home == null || away == null) return null;
  return home > away ? '1' : home < away ? '2' : 'X';
}

export function isLocked(
  status: string,
  utcDate: string,
  adminLocked = false
): boolean {
  return adminLocked || new Date(utcDate).getTime() <= Date.now() || !OPEN_STATUSES.includes(status);
}
