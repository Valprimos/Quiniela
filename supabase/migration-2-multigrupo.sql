-- Migración 2: pandillas, competiciones, modo en vivo, admin y archivo de temporada.
-- Ejecuta esto en Supabase > SQL Editor DESPUÉS del schema.sql original.
-- Es seguro volver a ejecutarlo si algo falla a mitad (usa IF NOT EXISTS donde se puede).

-- 1) Pandillas ---------------------------------------------------------
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Pandilla "de siempre" para no dejar tirados a los jugadores que ya existían.
-- Sustituye 'CAMBIA_ESTO' por el INVITE_CODE que ya tenías en las variables de entorno.
insert into groups (id, name, invite_code)
values ('00000000-0000-0000-0000-000000000001', 'La pandilla', 'CAMBIA_ESTO')
on conflict (id) do nothing;

-- 2) Jugadores: pertenecen a una pandilla y pueden ser admin ----------
alter table players add column if not exists group_id uuid references groups(id);
update players set group_id = '00000000-0000-0000-0000-000000000001' where group_id is null;
alter table players alter column group_id set not null;
alter table players add column if not exists is_admin boolean not null default false;

-- El nombre ahora solo tiene que ser único DENTRO de cada pandilla, no en toda la app.
alter table players drop constraint if exists players_name_key_key;
drop index if exists players_name_key_key;
create unique index if not exists players_group_name_idx on players (group_id, name_key);

-- Hazte admin de tu propia pandilla (cambia 'tu_nombre_de_jugador'):
-- update players set is_admin = true where name_key = 'tu_nombre_de_jugador';

-- 3) Partidos: competición, corrección manual y bloqueo manual --------
alter table matches add column if not exists competition text not null default 'PD';
alter table matches add column if not exists stage text;
alter table matches add column if not exists manual_override boolean not null default false;
alter table matches add column if not exists admin_locked boolean not null default false;
drop index if exists matches_season_matchday_idx;
create index if not exists matches_comp_season_matchday_idx on matches (competition, season, matchday);

-- 4) Sincronización: una fila por competición en vez de una fila fija -
alter table sync_state drop constraint if exists sync_state_pkey;
alter table sync_state drop constraint if exists sync_state_id_check;
alter table sync_state alter column id type text using
  case id when 1 then 'PD' else id::text end;
alter table sync_state rename column id to competition;
alter table sync_state add constraint sync_state_pkey primary key (competition);
insert into sync_state (competition) values ('PD'), ('SD'), ('CL')
on conflict (competition) do nothing;

-- 5) Clasificación real de la Liga: recalculada en el servidor a partir
--    de los partidos, no hace falta una vista para esto.

-- 6) Vista de puntos: ahora por competición también --------------------
drop view if exists player_points;
create view player_points with (security_invoker = true) as
select
  pr.player_id,
  m.competition,
  m.season,
  m.matchday,
  count(*) filter (
    where pr.pick = case
      when m.home_score > m.away_score then '1'
      when m.home_score < m.away_score then '2'
      else 'X'
    end
  ) as points
from predictions pr
join matches m on m.id = pr.match_id
where m.status = 'FINISHED' and m.home_score is not null and m.away_score is not null
group by pr.player_id, m.competition, m.season, m.matchday;

-- 7) Archivo de temporada: foto fija de la clasificación final ---------
create table if not exists season_archive (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  competition text not null,
  season integer not null,
  player_id uuid not null references players(id) on delete cascade,
  player_name text not null,
  points integer not null,
  pos integer not null,
  archived_at timestamptz not null default now(),
  unique (group_id, competition, season, player_id)
);

alter table groups enable row level security;
alter table season_archive enable row level security;
