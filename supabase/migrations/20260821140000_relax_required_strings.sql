-- A half-filled row is a legitimate intermediate state in this UI: a massage
-- entry can exist with only a patient name, and a session can exist before a
-- doctor is picked. The document spells those gaps as empty strings, which
-- cannot satisfy a foreign key or an hour pattern.
--
-- These columns therefore accept null, and app_data_load maps null back to the
-- empty string for every field the TypeScript model declares as a required
-- string. Optional fields keep being stripped when null.

alter table public.massage_active_entries
  alter column physiotherapist_id drop not null;
alter table public.massage_active_entries
  drop constraint if exists massage_active_entries_hour_check;
alter table public.massage_active_entries
  add constraint massage_active_entries_hour_check
  check (hour = '' or hour ~ '^[0-9]{2}:[0-9]{2}$');

alter table public.massage_waiting_entries
  alter column physiotherapist_id drop not null;
alter table public.massage_waiting_entries
  drop constraint if exists massage_waiting_entries_hour_check;
alter table public.massage_waiting_entries
  add constraint massage_waiting_entries_hour_check
  check (hour = '' or hour ~ '^[0-9]{2}:[0-9]{2}$');

alter table public.admission_sessions
  alter column doctor_id drop not null;
alter table public.admission_archive_sessions
  alter column doctor_id drop not null;

alter table public.legacy_admission_archive_rows
  alter column physiotherapist_id drop not null;
