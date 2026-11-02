-- Predicciones de temporada: clasificación final de La Liga, premios de jugadores y Primo de Oro.
-- Ejecútalo una vez en Supabase > SQL Editor. Hasta entonces la app funciona igual, sin esta sección.

-- Lo que predice cada jugador (una fila por jugador y temporada).
--   ranking : lista ordenada de equipos (del 1.º al último)
--   awards  : { liga_pichichi: '…', liga_asistente: '…', … }
--   primo   : su voto privado para el Primo de Oro (quién hará mejor temporada)
create table if not exists season_picks (
  player_id uuid not null references players(id) on delete cascade,
  season integer not null,
  ranking jsonb,
  awards jsonb not null default '{}'::jsonb,
  primo text,
  updated_at timestamptz not null default now(),
  primary key (player_id, season)
);

-- Ajustes y resultados oficiales por pandilla y temporada (los gestiona el admin).
--   deadline    : cierre de las predicciones (null = el de por defecto)
--   zones       : tramos clave { champions: [1,4], europa: [5,6], conference: [7,7], relegation: [18,20] }
--   results     : { order: [equipos] | null, awards: { clave: [ganadores] } }
--   primo_stage : 'nominate' (votos privados) | 'vote' (votación final abierta) | 'closed' (resultado)
create table if not exists season_settings (
  group_id uuid not null references groups(id) on delete cascade,
  season integer not null,
  deadline timestamptz,
  zones jsonb,
  results jsonb,
  primo_stage text not null default 'nominate' check (primo_stage in ('nominate', 'vote', 'closed')),
  updated_at timestamptz not null default now(),
  primary key (group_id, season)
);

-- Votación final del Primo de Oro (secreta: nunca se muestra quién votó a quién).
create table if not exists primo_votes (
  player_id uuid not null references players(id) on delete cascade,
  season integer not null,
  nominee text not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, season)
);

alter table season_picks enable row level security;
alter table season_settings enable row level security;
alter table primo_votes enable row level security;
