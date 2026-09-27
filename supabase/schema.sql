create table if not exists public.physical_favourites_spotify_sessions (
  session_id uuid primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.physical_favourites_player_states (
  session_id uuid primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.physical_favourites_rotations (
  session_id uuid primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.physical_favourites_spotify_sessions enable row level security;
alter table public.physical_favourites_player_states enable row level security;
alter table public.physical_favourites_rotations enable row level security;

revoke all on public.physical_favourites_spotify_sessions from anon, authenticated;
revoke all on public.physical_favourites_player_states from anon, authenticated;
revoke all on public.physical_favourites_rotations from anon, authenticated;

grant all on public.physical_favourites_spotify_sessions to service_role;
grant all on public.physical_favourites_player_states to service_role;
grant all on public.physical_favourites_rotations to service_role;
