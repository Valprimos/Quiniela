export type Pick = '1' | 'X' | '2';

export const OPEN_STATUSES = ['SCHEDULED', 'TIMED'];

export function resultOf(
  status: string,
  home: number | null,
  away: number | null
): Pick | null {
  if (status !== 'FINISHED' || home == null || away == null) return null;
  return home > away ? '1' : home < away ? '2' : 'X';
}

export function isLocked(status: string, utcDate: string): boolean {
  return new Date(utcDate).getTime() <= Date.now() || !OPEN_STATUSES.includes(status);
}
