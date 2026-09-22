-- Instalación desde cero. Ejecuta esto una vez en Supabase > SQL Editor.
-- (Si ya tenías la versión anterior de la quiniela en marcha, usa
--  supabase/migration-2-multigrupo.sql en su lugar, no este archivo.)

create extension if not exists pgcrypto;

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  name_key text generated always as (lower(name)) stored,
  pin_hash text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (group_id, name_key)
);

-- Los partidos son los mismos para todas las pandillas: no llevan group_id.
create table matches (
  id integer primary key,               -- id de football-data.org
  competition text not null,            -- 'PD' Primera, 'SD' Segunda, 'CL' Champions
  season integer not null,
  matchday integer not null,
  stage text,                           -- fase real (para la Champions: liguilla, octavos...)
  utc_date timestamptz not null,
  status text not null,
  home_name text not null,
  away_name text not null,
  home_crest text,
  away_crest text,
  home_score integer,
  away_score integer,
  manual_override boolean not null default false, -- true = un admin lo corrigió a mano
  admin_locked boolean not null default false,     -- true = un admin lo bloqueó a mano
  updated_at timestamptz not null default now()
);
create index matches_comp_season_matchday_idx on matches (competition, season, matchday);

create table predictions (
  player_id uuid not null references players(id) on delete cascade,
  match_id integer not null references matches(id) on delete cascade,
  pick char(1) not null check (pick in ('1', 'X', '2')),
  updated_at timestamptz not null default now(),
  primary key (player_id, match_id)
);

create table sync_state (
  competition text primary key,
  last_synced timestamptz
);
insert into sync_state (competition) values ('PD'), ('SD'), ('CL');

create table season_archive (
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

-- Puntos por jugador, competición y jornada: 1 punto por acierto en partidos terminados
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

-- Solo el servidor (service role) accede a los datos
alter table groups enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table predictions enable row level security;
alter table sync_state enable row level security;
alter table season_archive enable row level security;
