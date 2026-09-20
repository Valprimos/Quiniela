-- Ejecuta esto una vez en Supabase > SQL Editor

create extension if not exists pgcrypto;

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text generated always as (lower(name)) stored unique,
  pin_hash text not null,
  created_at timestamptz not null default now()
);

create table matches (
  id integer primary key,               -- id de football-data.org
  season integer not null,
  matchday integer not null,
  utc_date timestamptz not null,
  status text not null,
  home_name text not null,
  away_name text not null,
  home_crest text,
  away_crest text,
  home_score integer,
  away_score integer,
  updated_at timestamptz not null default now()
);
create index matches_season_matchday_idx on matches (season, matchday);

create table predictions (
  player_id uuid not null references players(id) on delete cascade,
  match_id integer not null references matches(id) on delete cascade,
  pick char(1) not null check (pick in ('1', 'X', '2')),
  updated_at timestamptz not null default now(),
  primary key (player_id, match_id)
);

create table sync_state (
  id integer primary key default 1 check (id = 1),
  last_synced timestamptz
);
insert into sync_state (id) values (1) on conflict do nothing;

-- Puntos por jugador y jornada: 1 punto por acierto en partidos terminados
create view player_points with (security_invoker = true) as
select
  pr.player_id,
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
group by pr.player_id, m.season, m.matchday;

-- Solo el servidor (service role) accede a los datos
alter table players enable row level security;
alter table matches enable row level security;
alter table predictions enable row level security;
alter table sync_state enable row level security;
