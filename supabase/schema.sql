-- The Long Trail: where the journal and game progress are backed up.
-- Paste this into Supabase: SQL Editor -> New query -> Run.
--
-- One table holds every record (meals, saved meals, weigh-ins, rests, water,
-- settings, game progress). Row Level Security means each signed-in player can
-- only ever see and change their own rows.

create table if not exists public.journal_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('meal', 'saved_meal', 'weigh_in', 'rest', 'water', 'settings', 'game')),
  id text not null,
  data jsonb not null,
  updated bigint not null,
  deleted boolean not null default false,
  primary key (user_id, kind, id)
);

create index if not exists journal_records_updated on public.journal_records (user_id, updated);

alter table public.journal_records enable row level security;

create policy "Players read their own records" on public.journal_records
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Players add their own records" on public.journal_records
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Players change their own records" on public.journal_records
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on public.journal_records to authenticated;
