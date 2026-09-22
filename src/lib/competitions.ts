export type CompetitionCode = 'PD' | 'SD' | 'CL';

export type CompetitionDef = {
  code: CompetitionCode;
  apiCode: string; // código en football-data.org (solo se usa si source = 'football-data')
  name: string;
  short: string;
  freeTier: boolean;
  source: 'football-data' | 'api-football';
  afLeagueId?: number; // solo si source = 'api-football'
};

export const COMPETITIONS: CompetitionDef[] = [
  { code: 'PD', apiCode: 'PD', name: 'Primera División', short: 'Primera', freeTier: true, source: 'football-data' },
  // La Segunda no está en el plan gratuito de football-data.org, así que usa api-football.com
  // (también gratis, pero con su propia clave: variable de entorno API_FOOTBALL_KEY).
  { code: 'SD', apiCode: 'SD', name: 'Segunda División', short: 'Segunda', freeTier: true, source: 'api-football', afLeagueId: 141 },
  { code: 'CL', apiCode: 'CL', name: 'Champions League', short: 'Champions', freeTier: true, source: 'football-data' },
];

export function competitionDef(code: string): CompetitionDef {
  return COMPETITIONS.find((c) => c.code === code) ?? COMPETITIONS[0];
}

export function isCompetitionCode(v: unknown): v is CompetitionCode {
  return typeof v === 'string' && COMPETITIONS.some((c) => c.code === v);
}

// Fases de la Champions sin número de jornada (fase de liguilla = 1-8, esto es para
// las eliminatorias de después). El orden es aproximado; solo se usa para ordenar
// y para pintar una etiqueta, nunca para las jornadas de Primera o Segunda.
export const KNOCKOUT_STAGE_ORDER = [
  'PLAYOFFS',
  'LAST_16',
  'ROUND_OF_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'FINAL',
];

export const STAGE_LABEL: Record<string, string> = {
  LEAGUE_STAGE: 'Fase de liga',
  GROUP_STAGE: 'Fase de grupos',
  PLAYOFFS: 'Playoff',
  LAST_16: 'Octavos de final',
  ROUND_OF_16: 'Octavos de final',
  QUARTER_FINALS: 'Cuartos de final',
  SEMI_FINALS: 'Semifinales',
  FINAL: 'Final',
};
