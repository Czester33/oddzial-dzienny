-- AppData <-> relational mapping, exposed as two RPCs.
--
-- Why plpgsql and not TypeScript: supabase-js cannot open a transaction, and a
-- whole-document PUT has to replace ~30 tables atomically. Doing it inside one
-- function call makes the write a single statement, hence a single transaction,
-- and keeps the optimistic-locking check in the same critical section.

-- ---------------------------------------------------------------------------
-- Row -> JSON helpers
-- ---------------------------------------------------------------------------

create or replace function public.staff_json(s public.staff)
returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'color', s.color,
    'rowColor', s.row_color,
    'headerNote', s.header_note,
    'columnWidths', s.column_widths,
    'hidden', s.hidden
  ));
$$;

create or replace function public.patient_json(p public.patients)
returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p.id,
    'text', p.text,
    -- Required in the TypeScript model, so an absent date must come back as ''.
    'dischargeDate', coalesce(p.discharge_date::text, ''),
    'dischargeDateManual', p.discharge_date_manual,
    'dischargeDateBeforeManual', p.discharge_date_before_manual,
    'ownerPhysiotherapistId', p.owner_physiotherapist_id,
    'doctorId', p.doctor_id,
    'checkupDate', p.checkup_date,
    'checkupDone', p.checkup_done
  ));
$$;

create or replace function public.massage_hour_change_json(p_date date, p_hour text)
returns jsonb language sql immutable as $$
  select case when p_date is null then null
    else jsonb_build_object('effectiveDate', p_date, 'hour', p_hour) end;
$$;

create or replace function public.massage_active_json(m public.massage_active_entries)
returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', m.id,
    'name', m.name,
    'hour', m.hour,
    'lastTreatmentDate', coalesce(m.last_treatment_date::text, ''),
    'physiotherapistId', coalesce(m.physiotherapist_id, ''),
    'plannedHourChange',
      public.massage_hour_change_json(m.planned_hour_change_date, m.planned_hour_change_hour)
  ));
$$;

create or replace function public.massage_waiting_json(m public.massage_waiting_entries)
returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', m.id,
    'name', m.name,
    'hour', m.hour,
    'startDate', coalesce(m.start_date::text, ''),
    'lastTreatmentDate', coalesce(m.last_treatment_date::text, ''),
    'physiotherapistId', coalesce(m.physiotherapist_id, ''),
    'plannedHourChange',
      public.massage_hour_change_json(m.planned_hour_change_date, m.planned_hour_change_hour)
  ));
$$;

-- Shared by live and archived slots, which have identical shape.
create or replace function public.admission_slot_json(
  p_id text, p_patient_name text, p_hour text, p_physio text,
  p_substitute text, p_status text, p_linked text
) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id,
    'patientName', p_patient_name,
    'admissionHour', coalesce(p_hour, ''),
    -- An unassigned slot is an empty string in the document, null in the table.
    'physiotherapistId', coalesce(p_physio, ''),
    'substitutePhysiotherapistId', p_substitute,
    'admissionStatus', p_status,
    'linkedPatientId', p_linked
  ));
$$;

create or replace function public.admission_session_json(
  p_id text, p_doctor text, p_admission_date date,
  p_planned date, p_planned_manual boolean, p_patients jsonb
) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id,
    'doctorId', coalesce(p_doctor, ''),
    'admissionDate', coalesce(p_admission_date::text, ''),
    'plannedDischargeDate', p_planned,
    'plannedDischargeDateManual', p_planned_manual
  )) || jsonb_build_object('patients', coalesce(p_patients, '[]'::jsonb));
$$;

create or replace function public.vacation_entry_json(
  p_date date, p_physio text, p_certainty text
) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'date', p_date,
    'physiotherapistId', p_physio,
    'certainty', p_certainty
  ));
$$;

-- ---------------------------------------------------------------------------
-- Assemble the whole AppData document
-- ---------------------------------------------------------------------------

create or replace function public.app_data_load()
returns jsonb
language sql
stable
as $$
select jsonb_build_object(
  'physiotherapists', (
    select coalesce(jsonb_agg(public.staff_json(s) order by s.sort_order), '[]'::jsonb)
    from public.staff s where s.role = 'physiotherapist' and s.status = 'active'
  ),
  'retiredPhysiotherapists', (
    select coalesce(jsonb_agg(public.staff_json(s) order by s.sort_order), '[]'::jsonb)
    from public.staff s where s.role = 'physiotherapist' and s.status = 'retired'
  ),
  'archivePhysiotherapistProfiles', (
    select coalesce(jsonb_agg(public.staff_json(s) order by s.sort_order), '[]'::jsonb)
    from public.staff s where s.role = 'physiotherapist' and s.status = 'archive_profile'
  ),
  'doctors', (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', d.id, 'name', d.name, 'themeId', d.theme_id
    )) order by d.sort_order), '[]'::jsonb)
    from public.doctors d where d.status = 'active'
  ),
  'currentPatients', (
    select coalesce(jsonb_object_agg(s.id, coalesce(g.items, '[]'::jsonb)), '{}'::jsonb)
    from public.staff s
    left join lateral (
      select jsonb_agg(public.patient_json(p) order by p.sort_order) as items
      from public.patients p where p.physiotherapist_id = s.id
    ) g on true
    where s.role = 'physiotherapist' and s.status = 'active'
  ),
  'removedPatientIds', (
    select coalesce(jsonb_agg(r.patient_id order by r.sort_order), '[]'::jsonb)
    from public.removed_patient_ids r
  ),
  'massages', (
    select jsonb_strip_nulls(jsonb_build_object(
      'scheduleHours', ms.schedule_hours,
      'headerNote', ms.header_note,
      'maxPerDay', ms.max_per_day,
      'todaySlotPeak', case when ms.today_slot_peak_date is not null then
        jsonb_build_object('date', ms.today_slot_peak_date, 'count', ms.today_slot_peak_count) end
    )) || jsonb_build_object(
      'active', (
        select coalesce(jsonb_agg(public.massage_active_json(a) order by a.sort_order), '[]'::jsonb)
        from public.massage_active_entries a
      ),
      'waiting', (
        select coalesce(jsonb_agg(public.massage_waiting_json(w) order by w.sort_order), '[]'::jsonb)
        from public.massage_waiting_entries w
      )
    )
    from public.massage_settings ms where ms.id = 'default'
  ),
  'duties', (
    select coalesce(jsonb_object_agg(m.month_key, coalesce(e.items, '[]'::jsonb)), '{}'::jsonb)
    from public.duty_months m
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'date', d.date, 'physiotherapistId', coalesce(d.physiotherapist_id, '')
      ) order by d.sort_order) as items
      from public.duty_entries d where d.month_key = m.month_key
    ) e on true
  ),
  'vacations', (
    select coalesce(jsonb_object_agg(y.year_key, coalesce(e.items, '[]'::jsonb)), '{}'::jsonb)
    from public.vacation_years y
    left join lateral (
      select jsonb_agg(public.vacation_entry_json(v.date, v.physiotherapist_id, v.certainty)
        order by v.sort_order) as items
      from public.vacation_entries v where v.year_key = y.year_key
    ) e on true
  ),
  'clinicClosedDays', (
    select coalesce(jsonb_agg(c.date order by c.sort_order), '[]'::jsonb)
    from public.clinic_closed_days c
  ),
  'admissions', (
    select coalesce(jsonb_object_agg(m.month_key, coalesce(s.items, '[]'::jsonb)), '{}'::jsonb)
    from public.admission_months m
    left join lateral (
      select jsonb_agg(public.admission_session_json(
        ses.id, ses.doctor_id, ses.admission_date,
        ses.planned_discharge_date, ses.planned_discharge_date_manual,
        (select jsonb_agg(public.admission_slot_json(
            sl.id, sl.patient_name, sl.admission_hour, sl.physiotherapist_id,
            sl.substitute_physiotherapist_id, sl.status, sl.linked_patient_id
          ) order by sl.sort_order)
         from public.admission_slots sl where sl.session_id = ses.id)
      ) order by ses.sort_order) as items
      from public.admission_sessions ses where ses.month_key = m.month_key
    ) s on true
  ),
  'admissionTableThemes', (
    select coalesce(jsonb_object_agg(t.month_key, t.theme_id), '{}'::jsonb)
    from public.admission_month_themes t
  ),
  'archive', (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', a.id,
      'patientName', a.patient_name,
      'doctor', a.doctor,
      'doctorId', a.doctor_id,
      'admissionDate', coalesce(a.admission_date::text, ''),
      'dischargeDate', coalesce(a.discharge_date::text, ''),
      'admissionHour', coalesce(a.admission_hour, ''),
      'physiotherapistId', coalesce(a.physiotherapist_id, ''),
      'archivedAt', public.iso_ms(a.archived_at)
    )) order by a.sort_order), '[]'::jsonb)
    from public.legacy_admission_archive_rows a
  ),
  'admissionArchive', (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'monthKey', m.month_key,
      'archivedAt', public.iso_ms(m.archived_at),
      'themeId', m.theme_id
    )) || jsonb_build_object('sessions', coalesce(s.items, '[]'::jsonb))
    order by m.sort_order), '[]'::jsonb)
    from public.admission_archive_months m
    left join lateral (
      select jsonb_agg(public.admission_session_json(
        ses.id, ses.doctor_id, ses.admission_date,
        ses.planned_discharge_date, ses.planned_discharge_date_manual,
        (select jsonb_agg(public.admission_slot_json(
            sl.id, sl.patient_name, sl.admission_hour, sl.physiotherapist_id,
            sl.substitute_physiotherapist_id, sl.status, sl.linked_patient_id
          ) order by sl.sort_order)
         from public.admission_archive_slots sl where sl.session_id = ses.id)
      ) order by ses.sort_order) as items
      from public.admission_archive_sessions ses where ses.month_key = m.month_key
    ) s on true
  ),
  'dutyArchive', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'monthKey', m.month_key,
      'archivedAt', public.iso_ms(m.archived_at),
      'entries', coalesce(e.items, '[]'::jsonb)
    ) order by m.sort_order), '[]'::jsonb)
    from public.duty_archive_months m
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'date', d.date, 'physiotherapistId', coalesce(d.physiotherapist_id, '')
      ) order by d.sort_order) as items
      from public.duty_archive_entries d where d.month_key = m.month_key
    ) e on true
  ),
  'vacationArchive', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'yearKey', y.year_key,
      'archivedAt', public.iso_ms(y.archived_at),
      'entries', coalesce(e.items, '[]'::jsonb)
    ) order by y.sort_order), '[]'::jsonb)
    from public.vacation_archive_years y
    left join lateral (
      select jsonb_agg(public.vacation_entry_json(v.date, v.physiotherapist_id, v.certainty)
        order by v.sort_order) as items
      from public.vacation_archive_year_entries v where v.year_key = y.year_key
    ) e on true
  ),
  'vacationMonthArchive', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'monthKey', m.month_key,
      'archivedAt', public.iso_ms(m.archived_at),
      'entries', coalesce(e.items, '[]'::jsonb)
    ) order by m.sort_order), '[]'::jsonb)
    from public.vacation_archive_months m
    left join lateral (
      select jsonb_agg(public.vacation_entry_json(v.date, v.physiotherapist_id, v.certainty)
        order by v.sort_order) as items
      from public.vacation_archive_month_entries v where v.month_key = m.month_key
    ) e on true
  ),
  'autoArchiveSkip', jsonb_build_object(
    'admissions', (select coalesce(jsonb_agg(period_key order by sort_order), '[]'::jsonb)
      from public.auto_archive_skip where domain = 'admissions'),
    'duties', (select coalesce(jsonb_agg(period_key order by sort_order), '[]'::jsonb)
      from public.auto_archive_skip where domain = 'duties'),
    'vacations', (select coalesce(jsonb_agg(period_key order by sort_order), '[]'::jsonb)
      from public.auto_archive_skip where domain = 'vacations')
  ),
  'announcements', (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', a.id,
      'text', a.text,
      'createdAt', public.iso_ms(a.created_at),
      'source', a.source,
      'physiotherapistId', a.physiotherapist_id,
      'admissionLink', case when a.admission_link_month_key is not null then
        jsonb_strip_nulls(jsonb_build_object(
          'monthKey', a.admission_link_month_key,
          'sessionId', a.admission_link_session_id,
          'slotId', a.admission_link_slot_id
        )) end
    )) order by a.sort_order), '[]'::jsonb)
    from public.announcements a
  ),
  'announcementsSeenAt', (
    select public.iso_ms(s.announcements_seen_at) from public.app_settings s where s.id = 'default'
  ),
  'announcementsReadIds', (
    select coalesce(jsonb_agg(r.announcement_id order by r.sort_order), '[]'::jsonb)
    from public.announcement_read_state r where r.state = 'read'
  ),
  'announcementsUnreadIds', (
    select coalesce(jsonb_agg(r.announcement_id order by r.sort_order), '[]'::jsonb)
    from public.announcement_read_state r where r.state = 'unread'
  ),
  'notepadNotes', (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', n.id,
      'title', n.title,
      'text', n.text,
      'createdAt', public.iso_ms(n.created_at),
      'updatedAt', public.iso_ms(n.updated_at),
      'physiotherapistId', n.physiotherapist_id
    )) order by n.sort_order), '[]'::jsonb)
    from public.notepad_notes n
  ),
  'admissionNotificationsSeenAt', (
    select coalesce(jsonb_object_agg(s.physiotherapist_id, public.iso_ms(s.seen_at)), '{}'::jsonb)
    from public.physio_notification_state s
  ),
  'admissionNotificationsReadIds', (
    select coalesce(jsonb_object_agg(x.pid, x.ids), '{}'::jsonb)
    from (
      select r.physiotherapist_id as pid,
             jsonb_agg(r.announcement_id order by r.sort_order) as ids
      from public.physio_announcement_reads r
      group by r.physiotherapist_id
    ) x
  ),
  'navOrder', (
    select coalesce(jsonb_agg(n.path order by n.sort_order), '[]'::jsonb)
    from public.nav_items n where n.sort_order is not null
  ),
  'navLabels', (
    select coalesce(jsonb_object_agg(n.path, n.label), '{}'::jsonb)
    from public.nav_items n where n.label is not null
  )
);
$$;

-- ---------------------------------------------------------------------------
-- Replace all data from an AppData document
-- ---------------------------------------------------------------------------

create or replace function public.app_data_replace(p_payload jsonb)
returns void
language plpgsql
as $$
begin
  -- Children before parents; staff and doctors are never deleted (see below).
  -- The redundant "where true" satisfies Supabase's safeupdate guard, which
  -- rejects any DELETE without a WHERE clause.
  delete from public.patients where true;
  delete from public.removed_patient_ids where true;
  delete from public.massage_active_entries where true;
  delete from public.massage_waiting_entries where true;
  delete from public.duty_entries where true;
  delete from public.duty_months where true;
  delete from public.vacation_entries where true;
  delete from public.vacation_years where true;
  delete from public.clinic_closed_days where true;
  delete from public.admission_slots where true;
  delete from public.admission_sessions where true;
  delete from public.admission_months where true;
  delete from public.admission_month_themes where true;
  delete from public.admission_archive_slots where true;
  delete from public.admission_archive_sessions where true;
  delete from public.admission_archive_months where true;
  delete from public.duty_archive_entries where true;
  delete from public.duty_archive_months where true;
  delete from public.vacation_archive_year_entries where true;
  delete from public.vacation_archive_years where true;
  delete from public.vacation_archive_month_entries where true;
  delete from public.vacation_archive_months where true;
  delete from public.legacy_admission_archive_rows where true;
  delete from public.auto_archive_skip where true;
  delete from public.announcements where true;
  delete from public.announcement_read_state where true;
  delete from public.physio_notification_state where true;
  delete from public.physio_announcement_reads where true;
  delete from public.notepad_notes where true;
  delete from public.nav_items where true;

  -- staff -------------------------------------------------------------------
  insert into public.staff (
    id, role, status, name, color, row_color, header_note, column_widths, hidden, sort_order
  )
  select
    e.v->>'id',
    'physiotherapist',
    src.status,
    coalesce(e.v->>'name', ''),
    coalesce(e.v->>'color', ''),
    coalesce(e.v->>'rowColor', ''),
    e.v->>'headerNote',
    e.v->'columnWidths',
    case when e.v ? 'hidden' then (e.v->>'hidden')::boolean end,
    e.ord::int
  from (values
    ('physiotherapists', 'active'),
    ('retiredPhysiotherapists', 'retired'),
    ('archivePhysiotherapistProfiles', 'archive_profile')
  ) as src(key, status)
  cross join lateral jsonb_array_elements(coalesce(p_payload->src.key, '[]'::jsonb))
    with ordinality as e(v, ord)
  on conflict (id) do update set
    role = 'physiotherapist',
    status = excluded.status,
    name = excluded.name,
    color = excluded.color,
    row_color = excluded.row_color,
    header_note = excluded.header_note,
    column_widths = excluded.column_widths,
    hidden = excluded.hidden,
    sort_order = excluded.sort_order;

  -- People dropped from the document are demoted, never deleted: archives and
  -- vacations still point at them, and losing the row would break those keys.
  update public.staff s set status = 'reference_only'
  where s.role = 'physiotherapist'
    and s.status <> 'reference_only'
    and not exists (
      select 1
      from (values
        ('physiotherapists'), ('retiredPhysiotherapists'), ('archivePhysiotherapistProfiles')
      ) as src(key)
      cross join lateral jsonb_array_elements(coalesce(p_payload->src.key, '[]'::jsonb)) as e(v)
      where e.v->>'id' = s.id
    );

  -- doctors -----------------------------------------------------------------
  insert into public.doctors (id, name, theme_id, status, sort_order)
  select e.v->>'id', coalesce(e.v->>'name', ''), e.v->>'themeId', 'active', e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'doctors', '[]'::jsonb)) with ordinality as e(v, ord)
  on conflict (id) do update set
    name = excluded.name,
    theme_id = excluded.theme_id,
    status = 'active',
    sort_order = excluded.sort_order;

  update public.doctors d set status = 'reference_only'
  where d.status <> 'reference_only'
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_payload->'doctors', '[]'::jsonb)) as e(v)
      where e.v->>'id' = d.id
    );

  -- patients ----------------------------------------------------------------
  insert into public.patients (
    id, physiotherapist_id, owner_physiotherapist_id, doctor_id, text,
    discharge_date, discharge_date_manual, discharge_date_before_manual,
    checkup_date, checkup_done, sort_order
  )
  select
    e.v->>'id', k.key,
    nullif(e.v->>'ownerPhysiotherapistId', ''), nullif(e.v->>'doctorId', ''),
    coalesce(e.v->>'text', ''),
    nullif(e.v->>'dischargeDate', '')::date,
    (e.v->>'dischargeDateManual')::boolean,
    nullif(e.v->>'dischargeDateBeforeManual', '')::date,
    nullif(e.v->>'checkupDate', '')::date,
    (e.v->>'checkupDone')::boolean,
    e.ord::int
  from jsonb_each(coalesce(p_payload->'currentPatients', '{}'::jsonb)) k
  cross join lateral jsonb_array_elements(k.value) with ordinality as e(v, ord);

  insert into public.removed_patient_ids (patient_id, sort_order)
  select e.v #>> '{}', e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'removedPatientIds', '[]'::jsonb))
    with ordinality as e(v, ord)
  on conflict (patient_id) do nothing;

  -- massages ----------------------------------------------------------------
  update public.massage_settings set
    schedule_hours = p_payload#>>'{massages,scheduleHours}',
    header_note = p_payload#>>'{massages,headerNote}',
    max_per_day = (p_payload#>>'{massages,maxPerDay}')::int,
    today_slot_peak_date = nullif(p_payload#>>'{massages,todaySlotPeak,date}', '')::date,
    today_slot_peak_count = (p_payload#>>'{massages,todaySlotPeak,count}')::int
  where id = 'default';

  insert into public.massage_active_entries (
    id, name, hour, last_treatment_date, physiotherapist_id,
    planned_hour_change_date, planned_hour_change_hour, sort_order
  )
  select
    e.v->>'id', coalesce(e.v->>'name', ''), coalesce(e.v->>'hour', ''),
    nullif(e.v->>'lastTreatmentDate', '')::date,
    nullif(e.v->>'physiotherapistId', ''),
    nullif(e.v#>>'{plannedHourChange,effectiveDate}', '')::date,
    e.v#>>'{plannedHourChange,hour}',
    e.ord::int
  from jsonb_array_elements(coalesce(p_payload#>'{massages,active}', '[]'::jsonb))
    with ordinality as e(v, ord);

  insert into public.massage_waiting_entries (
    id, name, hour, start_date, last_treatment_date, physiotherapist_id,
    planned_hour_change_date, planned_hour_change_hour, sort_order
  )
  select
    e.v->>'id', coalesce(e.v->>'name', ''), coalesce(e.v->>'hour', ''),
    nullif(e.v->>'startDate', '')::date,
    nullif(e.v->>'lastTreatmentDate', '')::date,
    nullif(e.v->>'physiotherapistId', ''),
    nullif(e.v#>>'{plannedHourChange,effectiveDate}', '')::date,
    e.v#>>'{plannedHourChange,hour}',
    e.ord::int
  from jsonb_array_elements(coalesce(p_payload#>'{massages,waiting}', '[]'::jsonb))
    with ordinality as e(v, ord);

  -- duties ------------------------------------------------------------------
  insert into public.duty_months (month_key)
  select k.key from jsonb_each(coalesce(p_payload->'duties', '{}'::jsonb)) k;

  insert into public.duty_entries (month_key, date, physiotherapist_id, sort_order)
  select k.key, (e.v->>'date')::date, nullif(e.v->>'physiotherapistId', ''), e.ord::int
  from jsonb_each(coalesce(p_payload->'duties', '{}'::jsonb)) k
  cross join lateral jsonb_array_elements(k.value) with ordinality as e(v, ord)
  on conflict (month_key, date) do nothing;

  -- vacations ---------------------------------------------------------------
  insert into public.vacation_years (year_key)
  select k.key from jsonb_each(coalesce(p_payload->'vacations', '{}'::jsonb)) k;

  insert into public.vacation_entries (year_key, date, physiotherapist_id, certainty, sort_order)
  select k.key, (e.v->>'date')::date, e.v->>'physiotherapistId', e.v->>'certainty', e.ord::int
  from jsonb_each(coalesce(p_payload->'vacations', '{}'::jsonb)) k
  cross join lateral jsonb_array_elements(k.value) with ordinality as e(v, ord)
  on conflict (year_key, date, physiotherapist_id) do nothing;

  insert into public.clinic_closed_days (date, sort_order)
  select (e.v #>> '{}')::date, e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'clinicClosedDays', '[]'::jsonb))
    with ordinality as e(v, ord)
  on conflict (date) do nothing;

  -- admissions --------------------------------------------------------------
  insert into public.admission_months (month_key)
  select k.key from jsonb_each(coalesce(p_payload->'admissions', '{}'::jsonb)) k;

  insert into public.admission_sessions (
    id, month_key, doctor_id, admission_date,
    planned_discharge_date, planned_discharge_date_manual, sort_order
  )
  select
    e.v->>'id', k.key, nullif(e.v->>'doctorId', ''),
    nullif(e.v->>'admissionDate', '')::date,
    nullif(e.v->>'plannedDischargeDate', '')::date,
    (e.v->>'plannedDischargeDateManual')::boolean,
    e.ord::int
  from jsonb_each(coalesce(p_payload->'admissions', '{}'::jsonb)) k
  cross join lateral jsonb_array_elements(k.value) with ordinality as e(v, ord);

  insert into public.admission_slots (
    id, session_id, patient_name, admission_hour, physiotherapist_id,
    substitute_physiotherapist_id, status, linked_patient_id, sort_order
  )
  select
    sl.v->>'id', ses.v->>'id', coalesce(sl.v->>'patientName', ''),
    nullif(sl.v->>'admissionHour', ''),
    nullif(sl.v->>'physiotherapistId', ''), nullif(sl.v->>'substitutePhysiotherapistId', ''),
    sl.v->>'admissionStatus', sl.v->>'linkedPatientId', sl.ord::int
  from jsonb_each(coalesce(p_payload->'admissions', '{}'::jsonb)) k
  cross join lateral jsonb_array_elements(k.value) as ses(v)
  cross join lateral jsonb_array_elements(coalesce(ses.v->'patients', '[]'::jsonb))
    with ordinality as sl(v, ord);

  insert into public.admission_month_themes (month_key, theme_id)
  select k.key, k.value #>> '{}'
  from jsonb_each(coalesce(p_payload->'admissionTableThemes', '{}'::jsonb)) k;

  -- archives ----------------------------------------------------------------
  insert into public.admission_archive_months (month_key, archived_at, theme_id, sort_order)
  select e.v->>'monthKey', (e.v->>'archivedAt')::timestamptz, e.v->>'themeId', e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'admissionArchive', '[]'::jsonb))
    with ordinality as e(v, ord);

  insert into public.admission_archive_sessions (
    id, month_key, doctor_id, admission_date,
    planned_discharge_date, planned_discharge_date_manual, sort_order
  )
  select
    ses.v->>'id', m.v->>'monthKey', nullif(ses.v->>'doctorId', ''),
    nullif(ses.v->>'admissionDate', '')::date,
    nullif(ses.v->>'plannedDischargeDate', '')::date,
    (ses.v->>'plannedDischargeDateManual')::boolean,
    ses.ord::int
  from jsonb_array_elements(coalesce(p_payload->'admissionArchive', '[]'::jsonb)) as m(v)
  cross join lateral jsonb_array_elements(coalesce(m.v->'sessions', '[]'::jsonb))
    with ordinality as ses(v, ord);

  insert into public.admission_archive_slots (
    id, session_id, patient_name, admission_hour, physiotherapist_id,
    substitute_physiotherapist_id, status, linked_patient_id, sort_order
  )
  select
    sl.v->>'id', ses.v->>'id', coalesce(sl.v->>'patientName', ''),
    nullif(sl.v->>'admissionHour', ''),
    nullif(sl.v->>'physiotherapistId', ''), nullif(sl.v->>'substitutePhysiotherapistId', ''),
    sl.v->>'admissionStatus', sl.v->>'linkedPatientId', sl.ord::int
  from jsonb_array_elements(coalesce(p_payload->'admissionArchive', '[]'::jsonb)) as m(v)
  cross join lateral jsonb_array_elements(coalesce(m.v->'sessions', '[]'::jsonb)) as ses(v)
  cross join lateral jsonb_array_elements(coalesce(ses.v->'patients', '[]'::jsonb))
    with ordinality as sl(v, ord);

  insert into public.duty_archive_months (month_key, archived_at, sort_order)
  select e.v->>'monthKey', (e.v->>'archivedAt')::timestamptz, e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'dutyArchive', '[]'::jsonb))
    with ordinality as e(v, ord);

  insert into public.duty_archive_entries (month_key, date, physiotherapist_id, sort_order)
  select m.v->>'monthKey', (e.v->>'date')::date,
         nullif(e.v->>'physiotherapistId', ''), e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'dutyArchive', '[]'::jsonb)) as m(v)
  cross join lateral jsonb_array_elements(coalesce(m.v->'entries', '[]'::jsonb))
    with ordinality as e(v, ord)
  on conflict (month_key, date) do nothing;

  insert into public.vacation_archive_years (year_key, archived_at, sort_order)
  select e.v->>'yearKey', (e.v->>'archivedAt')::timestamptz, e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'vacationArchive', '[]'::jsonb))
    with ordinality as e(v, ord);

  insert into public.vacation_archive_year_entries (
    year_key, date, physiotherapist_id, certainty, sort_order
  )
  select y.v->>'yearKey', (e.v->>'date')::date, e.v->>'physiotherapistId',
         e.v->>'certainty', e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'vacationArchive', '[]'::jsonb)) as y(v)
  cross join lateral jsonb_array_elements(coalesce(y.v->'entries', '[]'::jsonb))
    with ordinality as e(v, ord)
  on conflict (year_key, date, physiotherapist_id) do nothing;

  insert into public.vacation_archive_months (month_key, archived_at, sort_order)
  select e.v->>'monthKey', (e.v->>'archivedAt')::timestamptz, e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'vacationMonthArchive', '[]'::jsonb))
    with ordinality as e(v, ord);

  insert into public.vacation_archive_month_entries (
    month_key, date, physiotherapist_id, certainty, sort_order
  )
  select m.v->>'monthKey', (e.v->>'date')::date, e.v->>'physiotherapistId',
         e.v->>'certainty', e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'vacationMonthArchive', '[]'::jsonb)) as m(v)
  cross join lateral jsonb_array_elements(coalesce(m.v->'entries', '[]'::jsonb))
    with ordinality as e(v, ord)
  on conflict (month_key, date, physiotherapist_id) do nothing;

  insert into public.legacy_admission_archive_rows (
    id, patient_name, doctor, doctor_id, admission_date, discharge_date,
    admission_hour, physiotherapist_id, archived_at, sort_order
  )
  select
    e.v->>'id', coalesce(e.v->>'patientName', ''), coalesce(e.v->>'doctor', ''),
    nullif(e.v->>'doctorId', ''),
    nullif(e.v->>'admissionDate', '')::date,
    nullif(e.v->>'dischargeDate', '')::date,
    nullif(e.v->>'admissionHour', ''), nullif(e.v->>'physiotherapistId', ''),
    (e.v->>'archivedAt')::timestamptz,
    e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'archive', '[]'::jsonb))
    with ordinality as e(v, ord);

  insert into public.auto_archive_skip (domain, period_key, sort_order)
  select src.domain, e.v #>> '{}', e.ord::int
  from (values ('admissions'), ('duties'), ('vacations')) as src(domain)
  cross join lateral jsonb_array_elements(
    coalesce(p_payload#>array['autoArchiveSkip', src.domain], '[]'::jsonb)
  ) with ordinality as e(v, ord)
  on conflict (domain, period_key) do nothing;

  -- announcements and notepad ------------------------------------------------
  insert into public.announcements (
    id, text, created_at, source, physiotherapist_id,
    admission_link_month_key, admission_link_session_id, admission_link_slot_id, sort_order
  )
  select
    e.v->>'id', coalesce(e.v->>'text', ''), (e.v->>'createdAt')::timestamptz,
    e.v->>'source', e.v->>'physiotherapistId',
    e.v#>>'{admissionLink,monthKey}',
    e.v#>>'{admissionLink,sessionId}',
    e.v#>>'{admissionLink,slotId}',
    e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'announcements', '[]'::jsonb))
    with ordinality as e(v, ord);

  insert into public.announcement_read_state (announcement_id, state, sort_order)
  select e.v #>> '{}', src.state, e.ord::int
  from (values ('announcementsReadIds', 'read'), ('announcementsUnreadIds', 'unread'))
    as src(key, state)
  cross join lateral jsonb_array_elements(coalesce(p_payload->src.key, '[]'::jsonb))
    with ordinality as e(v, ord)
  on conflict (announcement_id) do nothing;

  insert into public.physio_notification_state (physiotherapist_id, seen_at)
  select k.key, (k.value #>> '{}')::timestamptz
  from jsonb_each(coalesce(p_payload->'admissionNotificationsSeenAt', '{}'::jsonb)) k;

  insert into public.physio_announcement_reads (physiotherapist_id, announcement_id, sort_order)
  select k.key, e.v #>> '{}', e.ord::int
  from jsonb_each(coalesce(p_payload->'admissionNotificationsReadIds', '{}'::jsonb)) k
  cross join lateral jsonb_array_elements(k.value) with ordinality as e(v, ord)
  on conflict (physiotherapist_id, announcement_id) do nothing;

  insert into public.notepad_notes (
    id, title, text, created_at, updated_at, physiotherapist_id, sort_order
  )
  select
    e.v->>'id', coalesce(e.v->>'title', ''), coalesce(e.v->>'text', ''),
    (e.v->>'createdAt')::timestamptz, (e.v->>'updatedAt')::timestamptz,
    e.v->>'physiotherapistId', e.ord::int
  from jsonb_array_elements(coalesce(p_payload->'notepadNotes', '[]'::jsonb))
    with ordinality as e(v, ord);

  -- settings -----------------------------------------------------------------
  insert into public.nav_items (path, label, sort_order)
  select coalesce(o.path, l.path), l.label, o.ord
  from (
    select e.v #>> '{}' as path, e.ord::int as ord
    from jsonb_array_elements(coalesce(p_payload->'navOrder', '[]'::jsonb))
      with ordinality as e(v, ord)
  ) o
  full outer join (
    select k.key as path, k.value #>> '{}' as label
    from jsonb_each(coalesce(p_payload->'navLabels', '{}'::jsonb)) k
  ) l on l.path = o.path
  on conflict (path) do update set
    label = excluded.label,
    sort_order = excluded.sort_order;

  update public.app_settings set
    announcements_seen_at = nullif(p_payload->>'announcementsSeenAt', '')::timestamptz
  where id = 'default';
end;
$$;

-- ---------------------------------------------------------------------------
-- Versioned write: optimistic lock + full replace, atomically
-- ---------------------------------------------------------------------------

-- baseUpdatedAt travels as text so that the comparison uses exactly the string
-- the caller received from app_data_load, with no timestamp parsing in between.
create or replace function public.app_data_save(p_payload jsonb, p_base_updated_at text)
returns jsonb
language plpgsql
as $$
declare
  v_current timestamptz;
  v_next timestamptz;
begin
  insert into public.app_revision (id, updated_at)
  values ('default', date_trunc('milliseconds', now()))
  on conflict (id) do nothing;

  select updated_at into v_current
  from public.app_revision where id = 'default'
  for update;

  if p_base_updated_at is not null
     and public.iso_ms(v_current) is distinct from p_base_updated_at then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'updatedAt', public.iso_ms(v_current)
    );
  end if;

  perform public.app_data_replace(p_payload);

  -- Truncated to milliseconds so the value survives the iso_ms round-trip and
  -- still matches on the next optimistic-lock check.
  v_next := date_trunc('milliseconds', now());
  if v_next <= v_current then
    v_next := v_current + interval '1 millisecond';
  end if;

  update public.app_revision set updated_at = v_next where id = 'default';

  return jsonb_build_object('ok', true, 'updatedAt', public.iso_ms(v_next));
end;
$$;

create or replace function public.app_data_revision()
returns text
language sql
stable
as $$
  select public.iso_ms(updated_at) from public.app_revision where id = 'default';
$$;

-- PostgREST caches the schema; without this the new RPCs 404 until it restarts.
notify pgrst, 'reload schema';
