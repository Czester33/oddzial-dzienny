-- Relational schema replacing the single app_state.payload JSONB document.
-- Does not touch app_state — it stays as a read-only backup until the cutover is done.
--
-- Type conventions, chosen so that assembling AppData back from these tables is
-- byte-identical to the JSON document the application already produces:
--   * id columns are text, not uuid — staff ids are not all uuids (legacy 'vacation-krzysztof')
--     and text avoids any uuid canonicalisation surprises.
--   * calendar values are date; Postgres renders them as YYYY-MM-DD, matching the app.
--   * clock values are text 'HH:MM'; the time type would render seconds and break round-trip.
--   * instants are timestamptz, serialised through public.iso_ms() to keep the .SSSZ format.
--   * sort_order preserves array order, which carries meaning in every list the UI renders.

create schema if not exists public;

-- Renders a timestamptz exactly like JavaScript's Date#toISOString.
create or replace function public.iso_ms(ts timestamptz)
returns text
language sql
immutable
as $$
  select to_char(ts at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- ---------------------------------------------------------------------------
-- Global revision + settings
-- ---------------------------------------------------------------------------

create table if not exists public.app_revision (
  id text primary key default 'default',
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_settings (
  id text primary key default 'default',
  announcements_seen_at timestamptz
);

-- navOrder + navLabels share one keyspace: the nav path.
create table if not exists public.nav_items (
  path text primary key,
  label text,
  sort_order integer
);

create table if not exists public.massage_settings (
  id text primary key default 'default',
  schedule_hours text,
  header_note text,
  max_per_day integer,
  today_slot_peak_date date,
  today_slot_peak_count integer,
  constraint massage_settings_peak_complete check (
    (today_slot_peak_date is null) = (today_slot_peak_count is null)
  )
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

-- One table with a role discriminator rather than separate physiotherapist and
-- masseur tables: vacations and duties reference staff generically, and a single
-- foreign key is only possible if all staff live in one relation.
create table if not exists public.staff (
  id text primary key,
  role text not null default 'physiotherapist'
    check (role in ('physiotherapist', 'masseur')),
  -- active -> AppData.physiotherapists, retired -> retiredPhysiotherapists,
  -- archive_profile -> archivePhysiotherapistProfiles.
  -- reference_only rows appear in no AppData array; they exist so that archives
  -- keep a valid foreign key after a person is dropped from the document.
  status text not null default 'active'
    check (status in ('active', 'retired', 'archive_profile', 'reference_only')),
  name text not null,
  color text not null default '',
  row_color text not null default '',
  header_note text,
  column_widths jsonb,
  -- Nullable on purpose: the source document distinguishes an absent flag from
  -- an explicit false, and dropping that distinction would break round-trip.
  hidden boolean,
  sort_order integer not null default 0
);

create index if not exists staff_role_status_idx on public.staff (role, status, sort_order);

create table if not exists public.doctors (
  id text primary key,
  name text not null,
  theme_id text,
  -- Same rationale as staff.status: archived sessions must keep a valid doctor
  -- reference even after the doctor disappears from the document.
  status text not null default 'active'
    check (status in ('active', 'reference_only')),
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Current patients
-- ---------------------------------------------------------------------------

create table if not exists public.patients (
  id text primary key,
  physiotherapist_id text not null references public.staff (id),
  -- Original physiotherapist while the patient is temporarily reassigned.
  owner_physiotherapist_id text references public.staff (id),
  doctor_id text references public.doctors (id),
  text text not null default '',
  discharge_date date,
  discharge_date_manual boolean,
  discharge_date_before_manual date,
  checkup_date date,
  checkup_done boolean,
  sort_order integer not null default 0
);

create index if not exists patients_physio_idx on public.patients (physiotherapist_id, sort_order);
create index if not exists patients_checkup_idx on public.patients (checkup_date)
  where checkup_done is not true;

-- Tombstones for patients deleted by hand; must not be recreated by sync.
create table if not exists public.removed_patient_ids (
  patient_id text primary key,
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Massages
-- ---------------------------------------------------------------------------

-- Nullable physiotherapist and empty hour are allowed: a row created by typing
-- only a patient name is a valid intermediate state in the UI.
create table if not exists public.massage_active_entries (
  id text primary key,
  name text not null default '',
  hour text not null default ''
    constraint massage_active_entries_hour_check
    check (hour = '' or hour ~ '^[0-9]{2}:[0-9]{2}$'),
  last_treatment_date date,
  physiotherapist_id text references public.staff (id),
  planned_hour_change_date date,
  planned_hour_change_hour text check (planned_hour_change_hour ~ '^[0-9]{2}:[0-9]{2}$'),
  sort_order integer not null default 0,
  constraint massage_active_hour_change_complete check (
    (planned_hour_change_date is null) = (planned_hour_change_hour is null)
  )
);

create table if not exists public.massage_waiting_entries (
  id text primary key,
  name text not null default '',
  hour text not null default ''
    constraint massage_waiting_entries_hour_check
    check (hour = '' or hour ~ '^[0-9]{2}:[0-9]{2}$'),
  start_date date,
  last_treatment_date date,
  physiotherapist_id text references public.staff (id),
  planned_hour_change_date date,
  planned_hour_change_hour text check (planned_hour_change_hour ~ '^[0-9]{2}:[0-9]{2}$'),
  sort_order integer not null default 0,
  constraint massage_waiting_hour_change_complete check (
    (planned_hour_change_date is null) = (planned_hour_change_hour is null)
  )
);

-- ---------------------------------------------------------------------------
-- Duties
-- ---------------------------------------------------------------------------

-- Parent rows keep months that currently hold no entries; the app distinguishes
-- "month absent" from "month present but empty".
create table if not exists public.duty_months (
  month_key text primary key check (month_key ~ '^[0-9]{4}-[0-9]{2}$')
);

-- physiotherapist_id is nullable because an unassigned duty day is a real state;
-- the document spells it as an empty string, which app_data_load restores.
create table if not exists public.duty_entries (
  month_key text not null references public.duty_months (month_key) on delete cascade,
  date date not null,
  physiotherapist_id text references public.staff (id),
  sort_order integer not null default 0,
  primary key (month_key, date)
);

create index if not exists duty_entries_month_idx on public.duty_entries (month_key, sort_order);

-- ---------------------------------------------------------------------------
-- Vacations
-- ---------------------------------------------------------------------------

create table if not exists public.vacation_years (
  year_key text primary key check (year_key ~ '^[0-9]{4}$')
);

create table if not exists public.vacation_entries (
  year_key text not null references public.vacation_years (year_key) on delete cascade,
  date date not null,
  physiotherapist_id text not null references public.staff (id),
  certainty text check (certainty in ('certain', 'uncertain')),
  sort_order integer not null default 0,
  primary key (year_key, date, physiotherapist_id)
);

create index if not exists vacation_entries_year_idx on public.vacation_entries (year_key, sort_order);

create table if not exists public.clinic_closed_days (
  date date primary key,
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Admissions
-- ---------------------------------------------------------------------------

create table if not exists public.admission_months (
  month_key text primary key check (month_key ~ '^[0-9]{4}-[0-9]{2}$')
);

create table if not exists public.admission_month_themes (
  month_key text primary key,
  theme_id text not null
);

create table if not exists public.admission_sessions (
  id text primary key,
  month_key text not null references public.admission_months (month_key) on delete cascade,
  -- Nullable: a session can be planned before a doctor is picked.
  doctor_id text references public.doctors (id),
  admission_date date,
  planned_discharge_date date,
  planned_discharge_date_manual boolean,
  sort_order integer not null default 0
);

create index if not exists admission_sessions_month_idx
  on public.admission_sessions (month_key, sort_order);

create table if not exists public.admission_slots (
  id text primary key,
  session_id text not null references public.admission_sessions (id) on delete cascade,
  patient_name text not null default '',
  admission_hour text check (admission_hour ~ '^[0-9]{2}:[0-9]{2}$'),
  -- Nullable: a planned slot may not have a physiotherapist assigned yet.
  physiotherapist_id text references public.staff (id),
  substitute_physiotherapist_id text references public.staff (id),
  status text check (status in ('admitted', 'disqualified')),
  -- Deliberately no foreign key: the linked patient is often already discharged.
  linked_patient_id text,
  sort_order integer not null default 0
);

create index if not exists admission_slots_session_idx
  on public.admission_slots (session_id, sort_order);

-- ---------------------------------------------------------------------------
-- Archives
-- ---------------------------------------------------------------------------

create table if not exists public.admission_archive_months (
  month_key text primary key check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  archived_at timestamptz not null,
  theme_id text,
  sort_order integer not null default 0
);

create table if not exists public.admission_archive_sessions (
  id text primary key,
  month_key text not null
    references public.admission_archive_months (month_key) on delete cascade,
  doctor_id text references public.doctors (id),
  admission_date date,
  planned_discharge_date date,
  planned_discharge_date_manual boolean,
  sort_order integer not null default 0
);

create table if not exists public.admission_archive_slots (
  id text primary key,
  session_id text not null
    references public.admission_archive_sessions (id) on delete cascade,
  patient_name text not null default '',
  admission_hour text check (admission_hour ~ '^[0-9]{2}:[0-9]{2}$'),
  physiotherapist_id text references public.staff (id),
  substitute_physiotherapist_id text references public.staff (id),
  status text check (status in ('admitted', 'disqualified')),
  linked_patient_id text,
  sort_order integer not null default 0
);

create table if not exists public.duty_archive_months (
  month_key text primary key check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  archived_at timestamptz not null,
  sort_order integer not null default 0
);

create table if not exists public.duty_archive_entries (
  month_key text not null
    references public.duty_archive_months (month_key) on delete cascade,
  date date not null,
  physiotherapist_id text references public.staff (id),
  sort_order integer not null default 0,
  primary key (month_key, date)
);

create table if not exists public.vacation_archive_years (
  year_key text primary key check (year_key ~ '^[0-9]{4}$'),
  archived_at timestamptz not null,
  sort_order integer not null default 0
);

create table if not exists public.vacation_archive_year_entries (
  year_key text not null
    references public.vacation_archive_years (year_key) on delete cascade,
  date date not null,
  physiotherapist_id text not null references public.staff (id),
  certainty text check (certainty in ('certain', 'uncertain')),
  sort_order integer not null default 0,
  primary key (year_key, date, physiotherapist_id)
);

create table if not exists public.vacation_archive_months (
  month_key text primary key check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  archived_at timestamptz not null,
  sort_order integer not null default 0
);

create table if not exists public.vacation_archive_month_entries (
  month_key text not null
    references public.vacation_archive_months (month_key) on delete cascade,
  date date not null,
  physiotherapist_id text not null references public.staff (id),
  certainty text check (certainty in ('certain', 'uncertain')),
  sort_order integer not null default 0,
  primary key (month_key, date, physiotherapist_id)
);

-- Flat pre-session archive rows; doctor is denormalised text because these
-- predate the doctors table and may name doctors that no longer exist.
create table if not exists public.legacy_admission_archive_rows (
  id text primary key,
  patient_name text not null default '',
  doctor text not null default '',
  doctor_id text references public.doctors (id),
  admission_date date,
  discharge_date date,
  admission_hour text,
  physiotherapist_id text references public.staff (id),
  archived_at timestamptz,
  sort_order integer not null default 0
);

-- Months and years restored from an archive, skipped by the auto-archiver.
create table if not exists public.auto_archive_skip (
  domain text not null check (domain in ('admissions', 'duties', 'vacations')),
  period_key text not null,
  sort_order integer not null default 0,
  primary key (domain, period_key)
);

-- ---------------------------------------------------------------------------
-- Announcements and notepad
-- ---------------------------------------------------------------------------

create table if not exists public.announcements (
  id text primary key,
  text text not null default '',
  created_at timestamptz not null,
  source text check (source in ('manual', 'admission', 'substitution')),
  physiotherapist_id text references public.staff (id),
  admission_link_month_key text,
  admission_link_session_id text,
  admission_link_slot_id text,
  sort_order integer not null default 0,
  constraint announcements_admission_link_complete check (
    (admission_link_month_key is null) = (admission_link_session_id is null)
  ),
  constraint announcements_admission_link_slot check (
    admission_link_slot_id is null or admission_link_session_id is not null
  )
);

create index if not exists announcements_created_idx on public.announcements (created_at desc);

-- announcementsReadIds and announcementsUnreadIds are one tri-state fact, so a
-- single row per announcement makes the contradictory "both lists" case unrepresentable.
-- No foreign key: read marks outlive the announcements they refer to.
create table if not exists public.announcement_read_state (
  announcement_id text primary key,
  state text not null check (state in ('read', 'unread')),
  sort_order integer not null default 0
);

create table if not exists public.physio_notification_state (
  physiotherapist_id text primary key references public.staff (id) on delete cascade,
  seen_at timestamptz not null
);

create table if not exists public.physio_announcement_reads (
  physiotherapist_id text not null references public.staff (id) on delete cascade,
  announcement_id text not null,
  sort_order integer not null default 0,
  primary key (physiotherapist_id, announcement_id)
);

create index if not exists physio_announcement_reads_physio_idx
  on public.physio_announcement_reads (physiotherapist_id, sort_order);

create table if not exists public.notepad_notes (
  id text primary key,
  title text not null default '',
  text text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  physiotherapist_id text references public.staff (id),
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- RLS: same posture as app_state — service role only, no anon/authenticated policies.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'app_revision', 'app_settings', 'nav_items', 'massage_settings',
    'staff', 'doctors', 'patients', 'removed_patient_ids',
    'massage_active_entries', 'massage_waiting_entries',
    'duty_months', 'duty_entries',
    'vacation_years', 'vacation_entries', 'clinic_closed_days',
    'admission_months', 'admission_month_themes', 'admission_sessions', 'admission_slots',
    'admission_archive_months', 'admission_archive_sessions', 'admission_archive_slots',
    'duty_archive_months', 'duty_archive_entries',
    'vacation_archive_years', 'vacation_archive_year_entries',
    'vacation_archive_months', 'vacation_archive_month_entries',
    'legacy_admission_archive_rows', 'auto_archive_skip',
    'announcements', 'announcement_read_state',
    'physio_notification_state', 'physio_announcement_reads', 'notepad_notes'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

insert into public.app_revision (id, updated_at)
values ('default', timezone('utc', now()))
on conflict (id) do nothing;

insert into public.app_settings (id) values ('default') on conflict (id) do nothing;
insert into public.massage_settings (id) values ('default') on conflict (id) do nothing;
