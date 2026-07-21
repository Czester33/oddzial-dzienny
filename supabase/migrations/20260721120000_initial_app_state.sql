-- Oddzial dzienny — initial storage for AppData (mirrors src/lib/types.ts AppData).
-- No auth: access only via server-side SUPABASE_SERVICE_ROLE_KEY in Next.js API routes.

create table if not exists public.app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.app_state is
  'Singleton document store for application data (AppData JSON). id = default for single-tenant deployment.';

comment on column public.app_state.payload is
  'Full AppData object: physiotherapists, patients, admissions, duties, vacations, archives, announcements, etc.';

insert into public.app_state (id, payload)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

create or replace function public.touch_app_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists app_state_touch_updated_at on public.app_state;

create trigger app_state_touch_updated_at
before update on public.app_state
for each row
execute function public.touch_app_state_updated_at();

alter table public.app_state enable row level security;

-- No RLS policies: browser clients must not access this table directly.
-- Next.js server uses the service role key (bypasses RLS).

create index if not exists app_state_updated_at_idx
  on public.app_state (updated_at desc);
