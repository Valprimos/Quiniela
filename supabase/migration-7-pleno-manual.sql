-- Pleno al 15 elegido a mano por un admin.
-- Una jornada con un partido en esta tabla conserva el pleno que se eligió: la app ya no lo
-- mueve sola al penúltimo partido. Para volver a lo automático, el admin pulsa
-- "Volver a automático" en Panel de admin > Pleno al 15.
create table if not exists pleno_overrides (
  match_id integer primary key references matches(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table pleno_overrides enable row level security;
