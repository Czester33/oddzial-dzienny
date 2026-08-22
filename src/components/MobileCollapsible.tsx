import type { ReactNode } from "react";

export function MobileCollapsible({
  summary,
  children,
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details
      className={`group rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:hidden ${className}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-[17px] font-semibold text-slate-800 marker:content-none dark:text-slate-100 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">{summary}</span>
        <span
          className="shrink-0 text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500"
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>
      <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-700">{children}</div>
    </details>
  );
}
