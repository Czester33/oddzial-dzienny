export const MONTH_NAMES = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

const DAY_NAMES = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function yearKey(year: number): string {
  return String(year);
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m - 1 };
}

export function formatMonthLabel(key: string): string {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES[month]} ${year}`;
}

export function formatDatePL(dateStr: string): string {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  if (y && m && d) {
    return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
  }
  return dateStr;
}

/** Converts stored date (ISO or DD.MM) to value for <input type="date"> */
export function toDateInputValue(value: string): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const dotted = value.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    let year = dotted[3] ? Number(dotted[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return "";
}

/** Short display for discharge column, e.g. 15.07 */
export function formatDischargeShort(value: string): string {
  const iso = toDateInputValue(value);
  if (!iso) return value.trim();
  const [year, month, day] = iso.split("-");
  const currentYear = String(new Date().getFullYear());
  if (year === currentYear) return `${day}.${month}`;
  return `${day}.${month}.${year.slice(-2)}`;
}

export const WEEKDAY_SHORT_PL = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

/** Monday–Sunday full Polish weekday names. */
export const WEEKDAY_NAMES_PL = [
  "Poniedziałek",
  "Wtorek",
  "Środa",
  "Czwartek",
  "Piątek",
  "Sobota",
  "Niedziela",
];

export function isoFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayIsoDate(): string {
  const now = new Date();
  return isoFromParts(now.getFullYear(), now.getMonth(), now.getDate());
}

export const FACILITY_CLOSE_TIME_DEFAULT = "19:00";
export const FACILITY_CLOSE_TIME_TUE_THU = "21:00";

/** Facility closes at 21:00 on Tue/Thu, otherwise at 19:00. */
export function getFacilityClosingTimeForDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  const dow = date.getDay();
  if (dow === 2 || dow === 4) return FACILITY_CLOSE_TIME_TUE_THU;
  return FACILITY_CLOSE_TIME_DEFAULT;
}

export function getFacilityClosingMinutesForDate(iso: string): number {
  const [hours, minutes] = getFacilityClosingTimeForDate(iso).split(":").map(Number);
  return hours * 60 + minutes;
}

export function getMonthGrid(year: number, month: number): (number | null)[] {
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function formatDateLongPL(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T12:00:00");
  const dayName = DAY_NAMES[date.getDay()];
  return `${dayName}, ${formatDatePL(dateStr)}`;
}

/** Tuesdays and Thursdays in a month, excluding Polish public holidays. */
export function getTuesdaysAndThursdays(year: number, month: number): string[] {
  const dates: string[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const holidays = getPolishPublicHolidays(year);

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dow = date.getDay();
    if (dow !== 2 && dow !== 4) continue;
    const iso = isoFromParts(year, month, day);
    if (holidays.has(iso)) continue;
    dates.push(iso);
  }

  return dates;
}

/** Duty table day label, e.g. 2.07 */
export function formatDutyDay(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [, m, d] = dateStr.split("-");
  return `${Number(d)}.${m}`;
}

export function getWorkingDaysInMonth(year: number, month: number): string[] {
  const dates: string[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dow = date.getDay();
    if (dow >= 1 && dow <= 5) {
      dates.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }

  return dates;
}

/** Mon–Fri weeks for a month calendar (null = padding outside the month). */
export function getWeekdayOnlyMonthGrid(year: number, month: number): (string | null)[][] {
  const days = getWorkingDaysInMonth(year, month);
  if (days.length === 0) return [];

  const firstDow = new Date(days[0] + "T12:00:00").getDay(); // 1=Mon … 5=Fri
  const cells: (string | null)[] = Array(firstDow - 1).fill(null);
  cells.push(...days);
  while (cells.length % 5 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 5) {
    weeks.push(cells.slice(i, i + 5));
  }
  return weeks;
}

/** Inclusive Mon–Fri dates between two ISO dates (order-independent). */
export function getWorkingDaysInRange(
  fromIso: string,
  toIso: string,
  extraClosedDates: readonly string[] = []
): string[] {
  const from = toDateInputValue(fromIso);
  const to = toDateInputValue(toIso);
  if (!from || !to) return [];

  let start = from;
  let end = to;
  if (start > end) {
    start = to;
    end = from;
  }

  const dates: string[] = [];
  const cursor = new Date(start + "T12:00:00");
  const last = new Date(end + "T12:00:00");
  while (cursor <= last) {
    const iso = isoFromParts(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    if (isWorkingDay(iso, extraClosedDates)) {
      dates.push(iso);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** Month keys from `pastMonths` before current through `count` months ahead (current first when pastMonths=0). */
export function getMonthOptions(count = 12, pastMonths = 2): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = -pastMonths; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    keys.push(monthKey(d.getFullYear(), d.getMonth()));
  }
  return keys;
}

export function currentMonthKey(): string {
  const now = new Date();
  return monthKey(now.getFullYear(), now.getMonth());
}

export function currentYearKey(): string {
  return yearKey(new Date().getFullYear());
}

export function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr + "T12:00:00");
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

/** Easter Sunday (Anonymous Gregorian algorithm). */
export function getEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month: month - 1, day };
}

function addDaysToParts(
  year: number,
  month: number,
  day: number,
  offset: number
): { year: number; month: number; day: number } {
  const date = new Date(year, month, day + offset);
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  };
}

/** Polish public holidays for a given year: ISO date → name. */
export function getPolishPublicHolidaysNamed(year: number): Map<string, string> {
  const holidays = new Map<string, string>();

  const fixed: [number, number, string][] = [
    [0, 1, "Nowy Rok"],
    [0, 6, "Trzech Króli"],
    [4, 1, "Święto Pracy"],
    [4, 3, "Święto Konstytucji 3 Maja"],
    [7, 15, "Wniebowzięcie NMP"],
    [10, 1, "Wszystkich Świętych"],
    [10, 11, "Narodowe Święto Niepodległości"],
    [11, 24, "Wigilia Bożego Narodzenia"],
    [11, 25, "Boże Narodzenie"],
    [11, 26, "Drugi dzień Bożego Narodzenia"],
  ];

  for (const [month, day, name] of fixed) {
    holidays.set(isoFromParts(year, month, day), name);
  }

  const easter = getEasterSunday(year);
  holidays.set(isoFromParts(year, easter.month, easter.day), "Wielkanoc");

  const easterMonday = addDaysToParts(year, easter.month, easter.day, 1);
  holidays.set(
    isoFromParts(easterMonday.year, easterMonday.month, easterMonday.day),
    "Poniedziałek Wielkanocny"
  );

  const corpusChristi = addDaysToParts(year, easter.month, easter.day, 60);
  holidays.set(
    isoFromParts(corpusChristi.year, corpusChristi.month, corpusChristi.day),
    "Boże Ciało"
  );

  return holidays;
}

/** Polish public holidays for a given year (ISO dates). */
export function getPolishPublicHolidays(year: number): Set<string> {
  return new Set(getPolishPublicHolidaysNamed(year).keys());
}

export function getPolishPublicHolidayName(dateStr: string): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : toDateInputValue(dateStr);
  if (!iso) return null;
  const year = Number(iso.slice(0, 4));
  return getPolishPublicHolidaysNamed(year).get(iso) ?? null;
}

export function isPolishPublicHoliday(dateStr: string): boolean {
  return getPolishPublicHolidayName(dateStr) !== null;
}

/** Weekend or Polish public holiday — red in calendar UIs. */
export function isCalendarRedDay(dateStr: string): boolean {
  return isWeekend(dateStr) || isPolishPublicHoliday(dateStr);
}

/** Built-in recurring clinic closures (not national holidays). */
export function getBuiltinClinicClosedDays(year: number): Set<string> {
  return new Set([
    isoFromParts(year, 7, 14), // 14 August – clinic closed
  ]);
}

/** @deprecated Prefer getBuiltinClinicClosedDays + AppData.clinicClosedDays */
export function getClinicClosedDays(year: number): Set<string> {
  return getBuiltinClinicClosedDays(year);
}

export function isClinicClosedDay(
  dateStr: string,
  extraClosedDates: readonly string[] = []
): boolean {
  const iso = toDateInputValue(dateStr);
  if (!iso) return false;
  const year = Number(iso.slice(0, 4));
  if (getBuiltinClinicClosedDays(year).has(iso)) return true;
  return extraClosedDates.some((d) => toDateInputValue(d) === iso);
}

export function isWorkingDay(
  dateStr: string,
  extraClosedDates: readonly string[] = []
): boolean {
  const iso = toDateInputValue(dateStr);
  if (!iso) return false;
  const date = new Date(iso + "T12:00:00");
  const dow = date.getDay();
  return (
    dow >= 1 &&
    dow <= 5 &&
    !isPolishPublicHoliday(iso) &&
    !isClinicClosedDay(iso, extraClosedDates)
  );
}

/** Last Mon–Fri in the month that is not a public holiday (monthIndex 0-based). */
export function getLastWorkingDayOfMonth(year: number, monthIndex: number): string {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = lastDay; day >= 1; day--) {
    const iso = isoFromParts(year, monthIndex, day);
    if (isWorkingDay(iso)) return iso;
  }
  return isoFromParts(year, monthIndex, lastDay);
}

/** Planned discharge: 15 working days from admission (admission day = day 1). */
export function getPlannedDischargeDate(admissionDate: string): string {
  const iso = toDateInputValue(admissionDate);
  if (!iso) return "";

  const current = new Date(iso + "T12:00:00");
  let counted = 0;

  while (counted < 15) {
    const isoCurrent = isoFromParts(current.getFullYear(), current.getMonth(), current.getDate());
    if (isWorkingDay(isoCurrent)) {
      counted++;
      if (counted === 15) return isoCurrent;
    }
    current.setDate(current.getDate() + 1);
  }

  return "";
}
