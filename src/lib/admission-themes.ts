import type { AdmissionSession, AppData } from "@/lib/types";
import {
  resolvePhysioColumnHeaderColor,
  resolvePhysioRowColor,
} from "@/lib/physio-utils";

export interface AdmissionTableTheme {
  id: string;
  label: string;
  header: string;
  zebra: string;
  panel: string;
}

export interface ResolvedAdmissionColors {
  header: string;
  zebra: string;
  panel: string;
  rowEven: string;
}

export function resolveAdmissionThemeColors(
  theme: AdmissionTableTheme,
  mode: "light" | "dark"
): ResolvedAdmissionColors {
  if (mode === "light") {
    return {
      header: theme.header,
      zebra: theme.zebra,
      panel: theme.panel,
      rowEven: "#ffffff",
    };
  }

  return {
    header: resolvePhysioColumnHeaderColor(theme.header, theme.zebra, "dark"),
    zebra: resolvePhysioRowColor(theme.header, theme.zebra, "dark"),
    panel: resolvePhysioRowColor(theme.header, theme.panel, "dark"),
    rowEven: "#0f172a",
  };
}

export const ADMISSION_TABLE_THEMES: AdmissionTableTheme[] = [
  { id: "jan", label: "Styczeń", header: "#60a5fa", zebra: "#dbeafe", panel: "#eff6ff" },
  { id: "feb", label: "Luty", header: "#db2777", zebra: "#fbcfe8", panel: "#fce7f3" },
  { id: "mar", label: "Marzec", header: "#16a34a", zebra: "#bbf7d0", panel: "#dcfce7" },
  { id: "apr", label: "Kwiecień", header: "#65a30d", zebra: "#d9f99d", panel: "#ecfccb" },
  { id: "may", label: "Maj", header: "#15803d", zebra: "#86efac", panel: "#bbf7d0" },
  { id: "jun", label: "Czerwiec", header: "#ca8a04", zebra: "#fde047", panel: "#fef9c3" },
  { id: "jul", label: "Lipiec", header: "#ea580c", zebra: "#fdba74", panel: "#ffedd5" },
  { id: "aug", label: "Sierpień", header: "#0891b2", zebra: "#a5f3fc", panel: "#ecfeff" },
  { id: "sep", label: "Wrzesień", header: "#b45309", zebra: "#fcd34d", panel: "#fef3c7" },
  { id: "oct", label: "Październik", header: "#c2410c", zebra: "#fdba74", panel: "#ffedd5" },
  { id: "nov", label: "Listopad", header: "#57534e", zebra: "#d6d3d1", panel: "#f5f5f4" },
  { id: "dec", label: "Grudzień", header: "#166534", zebra: "#86efac", panel: "#dcfce7" },
  { id: "lavender", label: "Lawenda", header: "#7c3aed", zebra: "#ddd6fe", panel: "#ede9fe" },
  { id: "coral", label: "Koral", header: "#e11d48", zebra: "#fda4af", panel: "#ffe4e6" },
];

const THEME_BY_ID = Object.fromEntries(ADMISSION_TABLE_THEMES.map((t) => [t.id, t]));

const MONTH_DEFAULT_IDS = [
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

export function defaultAdmissionThemeId(monthIndex: number): string {
  return MONTH_DEFAULT_IDS[monthIndex] ?? "jul";
}

export function resolveAdmissionTheme(
  themeId: string | undefined,
  monthIndex: number
): AdmissionTableTheme {
  if (themeId && THEME_BY_ID[themeId]) return THEME_BY_ID[themeId];
  return THEME_BY_ID[defaultAdmissionThemeId(monthIndex)] ?? ADMISSION_TABLE_THEMES[6];
}

export function resolveSessionAdmissionTheme(
  data: AppData,
  session: AdmissionSession,
  monthKeyValue: string,
  monthIndex: number
): AdmissionTableTheme {
  const doctor = data.doctors.find((d) => d.id === session.doctorId);
  if (doctor?.themeId) return resolveAdmissionTheme(doctor.themeId, monthIndex);
  const monthThemeId = data.admissionTableThemes?.[monthKeyValue];
  return resolveAdmissionTheme(monthThemeId, monthIndex);
}
