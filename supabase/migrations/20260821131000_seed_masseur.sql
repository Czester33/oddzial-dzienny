-- Krzysztof is a masseur, not a physiotherapist, so he appears in no AppData
-- array — yet vacations and duty archives reference him. app_data_replace only
-- ever writes staff rows it finds in the document, so his row is seeded here
-- and afterwards left alone (the demotion pass skips non-physiotherapist roles).

insert into public.staff (id, role, status, name, color, row_color, sort_order)
values ('vacation-krzysztof', 'masseur', 'active', 'Krzysztof', '', '', 0)
on conflict (id) do nothing;
