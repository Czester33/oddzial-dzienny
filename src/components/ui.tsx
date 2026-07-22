import { type ReactNode } from "react";
import { FormattedEditor } from "@/components/FormattedEditor";

export function PageHeader({
  title,
  children,
  titleClassName = "text-[19px] font-semibold text-slate-800 dark:text-slate-100",
}: {
  title: string;
  children?: ReactNode;
  titleClassName?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h2 className={titleClassName}>{title}</h2>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-slate-500 dark:text-slate-400">Wczytywanie danych...</p>
    </div>
  );
}

export function ErrorBanner({ message, className = "" }: { message: string; className?: string }) {
  return (
    <div
      className={`mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-950/80 dark:text-red-300 ${className || "text-[19px]"}`}
    >
      {message}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-500",
    secondary:
      "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
    danger: "bg-red-600 text-white hover:bg-red-500",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 font-medium disabled:opacity-50 ${className || "text-[19px]"} ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

const fieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[19px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
  fontSize,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  fontSize?: number;
}) {
  if (type === "text" || type === "") {
    return (
      <FormattedEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        fontSize={fontSize}
        className={`${fieldClass} ${className}`}
      />
    );
  }

  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${fieldClass} ${className}`}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[] | { value: string; label: string }[];
  placeholder?: string;
}) {
  const normalized = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={fieldClass}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {normalized.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function MonthSelector({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[19px] text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
    >
      {options.map((key) => {
        const [y, m] = key.split("-");
        const months = [
          "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
          "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
        ];
        return (
          <option key={key} value={key}>
            {months[Number(m) - 1]} {y}
          </option>
        );
      })}
    </select>
  );
}

export function YearSelector({
  value,
  onChange,
  extraYears = [],
}: {
  value: string;
  onChange: (v: string) => void;
  /** Extra years (e.g. restored from archive) merged into the list. */
  extraYears?: string[];
}) {
  const currentYear = new Date().getFullYear();
  const years = [
    ...new Set([
      ...extraYears.filter(Boolean),
      ...Array.from({ length: 5 }, (_, i) => String(currentYear - 1 + i)),
    ]),
  ].sort();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[19px] text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
