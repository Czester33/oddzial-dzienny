import type { AppData } from "./types";

export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Three-way pick for a leaf / whole value. */
function mergeValue<T>(base: T, local: T, remote: T): T {
  if (deepEqual(local, base)) return remote;
  if (deepEqual(remote, base)) return local;
  // Both changed the same leaf — prefer local (this client's intent).
  return local;
}

function mergeStringSet(
  base: string[] | undefined,
  local: string[] | undefined,
  remote: string[] | undefined
): string[] {
  const b = new Set(base ?? []);
  const l = new Set(local ?? []);
  const r = new Set(remote ?? []);

  const result = new Set(b);
  for (const x of b) {
    if (!l.has(x) || !r.has(x)) result.delete(x);
  }
  for (const x of l) {
    if (!b.has(x)) result.add(x);
  }
  for (const x of r) {
    if (!b.has(x)) result.add(x);
  }
  return [...result].sort();
}

function mergeByKey<T>(
  base: T[] | undefined,
  local: T[] | undefined,
  remote: T[] | undefined,
  keyOf: (item: T) => string,
  options?: { sortByKey?: boolean }
): T[] {
  const baseList = base ?? [];
  const localList = local ?? [];
  const remoteList = remote ?? [];

  const baseMap = new Map(baseList.map((item) => [keyOf(item), item]));
  const localMap = new Map(localList.map((item) => [keyOf(item), item]));
  const remoteMap = new Map(remoteList.map((item) => [keyOf(item), item]));

  const keys = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const merged = new Map<string, T>();

  for (const key of keys) {
    const b = baseMap.get(key);
    const l = localMap.get(key);
    const r = remoteMap.get(key);

    if (l && r) {
      if (!b) {
        merged.set(key, l);
        continue;
      }
      if (deepEqual(l, b)) {
        merged.set(key, r);
        continue;
      }
      if (deepEqual(r, b)) {
        merged.set(key, l);
        continue;
      }
      merged.set(key, { ...b, ...r, ...l });
      continue;
    }

    if (l && !r) {
      if (!b || !deepEqual(l, b)) merged.set(key, l);
      continue;
    }

    if (r && !l) {
      if (!b || !deepEqual(r, b)) merged.set(key, r);
    }
  }

  if (options?.sortByKey) {
    return [...merged.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, item]) => item);
  }

  // Prefer this client's order so UI panels don't jump after a sync merge.
  const orderSource = localList.length
    ? localList
    : remoteList.length
      ? remoteList
      : baseList;

  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const item of orderSource) {
    const key = keyOf(item);
    const m = merged.get(key);
    if (m && !seen.has(key)) {
      ordered.push(m);
      seen.add(key);
    }
  }
  for (const [key, item] of merged) {
    if (!seen.has(key)) ordered.push(item);
  }
  return ordered;
}

function mergeById<T extends { id: string }>(
  base: T[] | undefined,
  local: T[] | undefined,
  remote: T[] | undefined
): T[] {
  return mergeByKey(base, local, remote, (item) => item.id);
}

function mergeDutyEntries(
  base: { date: string; physiotherapistId: string }[] | undefined,
  local: { date: string; physiotherapistId: string }[] | undefined,
  remote: { date: string; physiotherapistId: string }[] | undefined
) {
  const keyOf = (e: { date: string; physiotherapistId: string }) => e.date;
  const toMap = (list: typeof base) =>
    new Map((list ?? []).map((e) => [keyOf(e), e]));

  const baseMap = toMap(base);
  const localMap = toMap(local);
  const remoteMap = toMap(remote);
  const dates = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const out: { date: string; physiotherapistId: string }[] = [];

  for (const date of [...dates].sort()) {
    const b = baseMap.get(date);
    const l = localMap.get(date);
    const r = remoteMap.get(date);
    const picked = mergeValue(b, l, r);
    if (picked) out.push(picked);
  }
  return out;
}

function mergeVacationEntries(
  base: { date: string; physiotherapistId: string; certainty?: "certain" | "uncertain" }[] | undefined,
  local: { date: string; physiotherapistId: string; certainty?: "certain" | "uncertain" }[] | undefined,
  remote: { date: string; physiotherapistId: string; certainty?: "certain" | "uncertain" }[] | undefined
) {
  const keyOf = (e: { date: string; physiotherapistId: string }) =>
    `${e.date}::${e.physiotherapistId}`;
  const toMap = (list: typeof base) =>
    new Map((list ?? []).map((e) => [keyOf(e), e]));

  const baseMap = toMap(base);
  const localMap = toMap(local);
  const remoteMap = toMap(remote);
  const keys = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const out: NonNullable<typeof base> = [];

  for (const key of [...keys].sort()) {
    const b = baseMap.get(key);
    const l = localMap.get(key);
    const r = remoteMap.get(key);

    if (l && r) {
      out.push(mergeValue(b ?? l, l, r));
      continue;
    }
    if (l && !r) {
      if (!b || !deepEqual(l, b)) out.push(l);
      continue;
    }
    if (r && !l) {
      if (!b || !deepEqual(r, b)) out.push(r);
    }
  }
  return out;
}

function mergeKeyedRecord<T>(
  base: Record<string, T> | undefined,
  local: Record<string, T> | undefined,
  remote: Record<string, T> | undefined,
  mergeEntry: (b: T | undefined, l: T | undefined, r: T | undefined) => T | undefined
): Record<string, T> {
  const b = base ?? {};
  const l = local ?? {};
  const r = remote ?? {};
  const keys = new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)]);
  const out: Record<string, T> = {};
  for (const key of keys) {
    const merged = mergeEntry(b[key], l[key], r[key]);
    if (merged !== undefined) out[key] = merged;
  }
  return out;
}

function mergeStringRecord(
  base: Record<string, string> | undefined,
  local: Record<string, string> | undefined,
  remote: Record<string, string> | undefined
): Record<string, string> {
  return mergeKeyedRecord(base, local, remote, (b, l, r) => {
    const picked = mergeValue(b, l, r);
    return picked === undefined ? undefined : picked;
  });
}

function mergeStringArrayRecord(
  base: Record<string, string[]> | undefined,
  local: Record<string, string[]> | undefined,
  remote: Record<string, string[]> | undefined
): Record<string, string[]> {
  return mergeKeyedRecord(base, local, remote, (b, l, r) => {
    if (l === undefined && r === undefined) return undefined;
    return mergeStringSet(b, l, r);
  });
}

function mergeMaxIso(
  base: string | undefined,
  local: string | undefined,
  remote: string | undefined
): string {
  if (deepEqual(local, base)) return remote ?? local ?? base ?? "";
  if (deepEqual(remote, base)) return local ?? remote ?? base ?? "";
  const candidates = [local, remote, base].filter(Boolean) as string[];
  return candidates.sort().at(-1) ?? "";
}

/**
 * Three-way merge of AppData for concurrent multi-client edits.
 * base = last shared snapshot; local = this client's draft; remote = server.
 */
export function mergeAppData(base: AppData, local: AppData, remote: AppData): AppData {
  const massagesBase = base.massages;
  const massagesLocal = local.massages;
  const massagesRemote = remote.massages;

  return {
    physiotherapists: mergeById(base.physiotherapists, local.physiotherapists, remote.physiotherapists),
    doctors: mergeById(base.doctors, local.doctors, remote.doctors),
    currentPatients: mergeKeyedRecord(
      base.currentPatients,
      local.currentPatients,
      remote.currentPatients,
      (b, l, r) => mergeById(b, l, r)
    ),
    massages: {
      active: mergeById(massagesBase?.active, massagesLocal?.active, massagesRemote?.active),
      waiting: mergeById(massagesBase?.waiting, massagesLocal?.waiting, massagesRemote?.waiting),
      scheduleHours: mergeValue(
        massagesBase?.scheduleHours,
        massagesLocal?.scheduleHours,
        massagesRemote?.scheduleHours
      ),
      headerNote: mergeValue(
        massagesBase?.headerNote,
        massagesLocal?.headerNote,
        massagesRemote?.headerNote
      ),
    },
    duties: mergeKeyedRecord(base.duties, local.duties, remote.duties, (b, l, r) =>
      mergeDutyEntries(b, l, r)
    ),
    admissions: mergeKeyedRecord(base.admissions, local.admissions, remote.admissions, (b, l, r) => {
      const sessions = mergeById(b, l, r).map((session) => {
        const baseSession = (b ?? []).find((s) => s.id === session.id);
        const localSession = (l ?? []).find((s) => s.id === session.id);
        const remoteSession = (r ?? []).find((s) => s.id === session.id);
        return {
          ...session,
          patients: mergeById(
            baseSession?.patients,
            localSession?.patients,
            remoteSession?.patients
          ),
        };
      });
      return sessions;
    }),
    vacations: mergeKeyedRecord(base.vacations, local.vacations, remote.vacations, (b, l, r) =>
      mergeVacationEntries(b, l, r)
    ),
    clinicClosedDays: mergeStringSet(
      base.clinicClosedDays,
      local.clinicClosedDays,
      remote.clinicClosedDays
    ),
    archive: mergeById(base.archive, local.archive, remote.archive),
    admissionArchive: mergeByKey(
      base.admissionArchive,
      local.admissionArchive,
      remote.admissionArchive,
      (item) => item.monthKey,
      { sortByKey: true }
    ),
    vacationArchive: mergeByKey(
      base.vacationArchive,
      local.vacationArchive,
      remote.vacationArchive,
      (item) => item.yearKey,
      { sortByKey: true }
    ),
    dutyArchive: mergeByKey(
      base.dutyArchive,
      local.dutyArchive,
      remote.dutyArchive,
      (item) => item.monthKey,
      { sortByKey: true }
    ),
    announcements: mergeById(base.announcements, local.announcements, remote.announcements),
    announcementsSeenAt: mergeMaxIso(
      base.announcementsSeenAt,
      local.announcementsSeenAt,
      remote.announcementsSeenAt
    ),
    admissionNotificationsSeenAt: mergeStringRecord(
      base.admissionNotificationsSeenAt,
      local.admissionNotificationsSeenAt,
      remote.admissionNotificationsSeenAt
    ),
    admissionNotificationsReadIds: mergeStringArrayRecord(
      base.admissionNotificationsReadIds,
      local.admissionNotificationsReadIds,
      remote.admissionNotificationsReadIds
    ),
    admissionTableThemes: mergeStringRecord(
      base.admissionTableThemes,
      local.admissionTableThemes,
      remote.admissionTableThemes
    ),
    navOrder: mergeValue(base.navOrder, local.navOrder, remote.navOrder),
    navLabels: (() => {
      const merged = mergeStringRecord(base.navLabels, local.navLabels, remote.navLabels);
      return Object.keys(merged).length ? merged : undefined;
    })(),
  };
}

/** Detect envelope vs legacy raw AppData JSON. */
export function parseStoredDocument(raw: unknown): {
  data: AppData;
  updatedAt: string;
} {
  const obj = asRecord(raw);
  if (
    obj.payload &&
    typeof obj.payload === "object" &&
    !Array.isArray(obj.payload) &&
    typeof obj.updatedAt === "string"
  ) {
    return {
      data: obj.payload as unknown as AppData,
      updatedAt: obj.updatedAt,
    };
  }
  // Legacy: entire file/blob is AppData.
  return {
    data: raw as AppData,
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

export function toStoredDocument(data: AppData, updatedAt: string) {
  return { payload: data, updatedAt };
}
