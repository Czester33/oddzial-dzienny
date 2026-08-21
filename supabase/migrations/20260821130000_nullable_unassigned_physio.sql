-- Backfill revealed that an unassigned duty day and an unassigned admission slot
-- are spelled as an empty physiotherapistId in the document. That cannot satisfy
-- a foreign key, so those columns become nullable and app_data_load maps null
-- back to the empty string.
--
-- Dropping physiotherapist_id from the duty primary keys is safe: a duty day
-- holds at most one person, so (month_key, date) already identifies the row.

alter table public.duty_entries
  drop constraint if exists duty_entries_pkey;
alter table public.duty_entries
  alter column physiotherapist_id drop not null;
alter table public.duty_entries
  add constraint duty_entries_pkey primary key (month_key, date);

alter table public.duty_archive_entries
  drop constraint if exists duty_archive_entries_pkey;
alter table public.duty_archive_entries
  alter column physiotherapist_id drop not null;
alter table public.duty_archive_entries
  add constraint duty_archive_entries_pkey primary key (month_key, date);

alter table public.admission_slots
  alter column physiotherapist_id drop not null;

alter table public.admission_archive_slots
  alter column physiotherapist_id drop not null;
