-- Migración 4: avisos push (PWA). Ejecútala una vez en Supabase > SQL Editor.
-- (Si instalas desde cero con schema.sql, ya viene incluida.)

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  lead_hours smallint not null default 3 check (lead_hours between 1 and 48),
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_player_idx on push_subscriptions (player_id);

-- Qué avisos ya se han enviado a cada dispositivo (para no repetirlos en cada pasada del cron)
create table if not exists push_sent (
  subscription_id uuid not null references push_subscriptions(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (subscription_id, key)
);

alter table push_subscriptions enable row level security;
alter table push_sent enable row level security;
