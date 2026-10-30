-- Reconstruye la vista de puntos para instalaciones que conservaron la regla antigua.
-- Partidos normales: 1 punto por signo correcto. Pleno al 15: 3 por marcador exacto.
alter table matches add column if not exists is_pleno boolean not null default false;
alter table predictions add column if not exists pleno_home smallint;
alter table predictions add column if not exists pleno_away smallint;

create or replace view player_points with (security_invoker = true) as
select
  pr.player_id,
  m.competition,
  m.season,
  m.matchday,
  sum(
    case
      when m.is_pleno then
        case when pr.pleno_home = m.home_score and pr.pleno_away = m.away_score then 3 else 0 end
      else
        case
          when pr.pick = case
            when m.home_score > m.away_score then '1'
            when m.home_score < m.away_score then '2'
            else 'X'
          end then 1
          else 0
        end
    end
  ) as points
from predictions pr
join matches m on m.id = pr.match_id
where m.status = 'FINISHED' and m.home_score is not null and m.away_score is not null
group by pr.player_id, m.competition, m.season, m.matchday;
