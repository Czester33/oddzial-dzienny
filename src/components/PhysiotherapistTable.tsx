"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ColumnWidths, Physiotherapist, Patient } from "@/lib/types";
import { getDefaultColumnWidths, resolvePhysioColumnHeaderColor, resolvePhysioRowColor } from "@/lib/physio-utils";
import { toDateInputValue } from "@/lib/date-utils";
import { useTheme } from "@/context/ThemeContext";
import { DatePickerCell } from "@/components/DatePickerCell";
import { FormattedEditor } from "@/components/FormattedEditor";
import { stripHtml } from "@/lib/text-format";

const WIDTH_LIMITS: Record<keyof ColumnWidths, { min: number; max: number }> = {
  lp: { min: 36, max: 80 },
  patient: { min: 120, max: 2000 },
  discharge: { min: 88, max: 130 },
};

function SpreadsheetCell({
  value,
  onChange,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <FormattedEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      multiline={multiline}
      compact
      className="w-full border-0 bg-transparent px-1 py-0.5 text-[19px] leading-snug focus:bg-white/80 dark:focus:bg-black/25"
    />
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ResizableHeader({
  label,
  align = "left",
  widthKey,
  width,
  onResize,
  onResizeEnd,
  resizable = true,
}: {
  label: string;
  align?: "left" | "center";
  widthKey: keyof ColumnWidths;
  width: number;
  onResize: (key: keyof ColumnWidths, width: number) => void;
  onResizeEnd: (key: keyof ColumnWidths, width: number) => void;
  resizable?: boolean;
}) {
  const startX = useRef(0);
  const startWidth = useRef(0);
  const latestWidth = useRef(width);

  useEffect(() => {
    latestWidth.current = width;
  }, [width]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX.current;
      const { min, max } = WIDTH_LIMITS[widthKey];
      const next = Math.min(max, Math.max(min, startWidth.current + delta));
      latestWidth.current = next;
      onResize(widthKey, next);
    };

    const onMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      onResizeEnd(widthKey, latestWidth.current);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <th
      className={`physio-col-header relative border border-black/25 px-1 py-1.5 text-[15px] font-extrabold uppercase tracking-wide select-none dark:border-white/20 ${
        align === "center" ? "text-center" : "text-left"
      }`}
    >
      {label}
      {resizable && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Zmień szerokość kolumny ${label}`}
          onMouseDown={handleMouseDown}
          className="absolute -right-0.5 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-black/25 active:bg-black/40"
        />
      )}
    </th>
  );
}

function MovePatientButton({
  targets,
  onMove,
}: {
  targets: Physiotherapist[];
  onMove: (toPhysioId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPortalRoot(
      (document.querySelector(".app-root") as HTMLElement | null) ?? document.body
    );
  }, []);

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const root =
      (document.querySelector(".app-root") as HTMLElement | null) ?? document.body;
    const zoomRaw = Number.parseFloat(getComputedStyle(root).zoom || "1");
    const zoom = Number.isFinite(zoomRaw) && zoomRaw > 0 ? zoomRaw : 1;

    const rect = button.getBoundingClientRect();
    const margin = 8;
    const menuEl = menuRef.current;
    const menuWidth = menuEl?.offsetWidth
      ? menuEl.offsetWidth * zoom
      : Math.min(160, window.innerWidth - margin * 2);
    const menuHeight = menuEl?.offsetHeight
      ? menuEl.offsetHeight * zoom
      : Math.min(targets.length * 28 + 8, 200);

    let left = rect.left;
    if (left + menuWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - menuWidth - margin);
    }
    left = Math.max(margin, left);

    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;

    let top: number;
    if (openUp) {
      top = rect.top - menuHeight - 4;
      if (top < margin) top = margin;
    } else {
      top = rect.bottom + 4;
      if (top + menuHeight > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - menuHeight - margin);
      }
    }

    const maxHeightPx = Math.max(
      80,
      (openUp ? spaceAbove : spaceBelow) / zoom
    );

    setMenuStyle({
      position: "fixed",
      top: top / zoom,
      left: left / zoom,
      zIndex: 10000,
      maxHeight: maxHeightPx,
    });
  }, [targets.length]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const frame = requestAnimationFrame(updateMenuPosition);
    return () => cancelAnimationFrame(frame);
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", updateMenuPosition, true);
    window.addEventListener("resize", updateMenuPosition);
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("scroll", updateMenuPosition, true);
      window.removeEventListener("resize", updateMenuPosition);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, updateMenuPosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded border border-black/15 bg-white/90 px-0.5 py-0 text-[9px] leading-tight text-slate-500 transition-opacity hover:bg-white focus:opacity-100 group-hover/row:opacity-100 dark:border-white/20 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:bg-slate-800 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        title="Przenieś do innego fizjoterapeuty (zastępstwo)"
        aria-label="Przenieś pacjenta"
        aria-expanded={open}
      >
        →
      </button>
      {open &&
        portalRoot &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className="min-w-[7.5rem] overflow-y-auto rounded border border-slate-200 bg-white py-0.5 shadow-lg dark:border-slate-600 dark:bg-slate-900"
          >
            {targets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onMove(p.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[13px] leading-tight text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                  aria-hidden="true"
                />
                {p.name}
              </button>
            ))}
          </div>,
          portalRoot
        )}
    </>
  );
}

export function PhysiotherapistTable({
  physio,
  patients,
  allPhysios,
  substitutesAway = 0,
  onUpdatePatient,
  onAddRow,
  onDeleteRow,
  onMovePatient,
  onReturnSubstitutes,
  onReturnSubstitute,
  onColumnWidthsChange,
}: {
  physio: Physiotherapist;
  patients: Patient[];
  allPhysios: Physiotherapist[];
  substitutesAway?: number;
  onUpdatePatient: (index: number, patient: Patient) => void;
  onAddRow: () => void;
  onDeleteRow: (index: number) => void;
  onMovePatient: (index: number, toPhysioId: string) => void;
  onReturnSubstitutes?: () => void;
  onReturnSubstitute?: (patientId: string) => void;
  onColumnWidthsChange: (widths: ColumnWidths) => void;
}) {
  const { theme } = useTheme();
  const [widths, setWidths] = useState(() => getDefaultColumnWidths(physio.columnWidths));
  const widthsRef = useRef(widths);

  useEffect(() => {
    const next = getDefaultColumnWidths(physio.columnWidths);
    setWidths(next);
    widthsRef.current = next;
  }, [physio.columnWidths]);

  useEffect(() => {
    widthsRef.current = widths;
  }, [widths]);

  const rows = patients;
  const otherPhysios = allPhysios.filter((p) => p.id !== physio.id);
  const tableRowColor = resolvePhysioRowColor(physio.color, physio.rowColor, theme);
  const columnHeaderColor = resolvePhysioColumnHeaderColor(physio.color, physio.rowColor, theme);
  const isDark = theme === "dark";

  const handleResize = useCallback((key: keyof ColumnWidths, value: number) => {
    setWidths((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleResizeEnd = useCallback(
    (_key: keyof ColumnWidths, _value: number) => {
      onColumnWidthsChange(widthsRef.current);
    },
    [onColumnWidthsChange]
  );

  const getOwner = (patient: Patient) =>
    patient.ownerPhysiotherapistId
      ? allPhysios.find((p) => p.id === patient.ownerPhysiotherapistId)
      : undefined;

  const headerNoteLabel = stripHtml(physio.headerNote ?? "");

  return (
    <div className="overflow-hidden border border-slate-200 shadow-sm dark:border-slate-700">
      <div
        className="physio-name-header flex items-center gap-2 px-3 py-2.5 text-[19px] font-bold tracking-wide text-white shadow-sm"
        style={{ backgroundColor: physio.color }}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2 text-center">
          <span>{physio.name}</span>
          {headerNoteLabel ? (
            <span className="rounded bg-yellow-300 px-1.5 py-0.5 text-[19px] font-semibold text-black">
              {headerNoteLabel}
            </span>
          ) : null}
        </div>
        {substitutesAway > 0 && onReturnSubstitutes ? (
          <button
            type="button"
            onClick={onReturnSubstitutes}
            className="shrink-0 rounded-md border border-white/40 bg-black/25 px-2 py-1 text-[13px] font-semibold text-white hover:bg-black/40"
            title={`Cofnij ${substitutesAway} ${
              substitutesAway === 1 ? "zastępstwo" : "zastępstwa"
            } do ${physio.name}`}
          >
            Cofnij zastępstwa ({substitutesAway})
          </button>
        ) : null}
      </div>

      <div>
        <table
          className={`border-collapse text-[19px] ${isDark ? "text-slate-100" : "text-slate-900"}`}
          style={{ tableLayout: "fixed", width: "100%" }}
        >
          <colgroup>
            <col style={{ width: widths.lp }} />
            <col />
            <col style={{ width: widths.discharge }} />
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: columnHeaderColor }}>
              <ResizableHeader
                label="Lp."
                align="center"
                widthKey="lp"
                width={widths.lp}
                onResize={handleResize}
                onResizeEnd={handleResizeEnd}
              />
              <ResizableHeader
                label="Pacjent"
                align="center"
                widthKey="patient"
                width={widths.patient}
                onResize={handleResize}
                onResizeEnd={handleResizeEnd}
                resizable={false}
              />
              <ResizableHeader
                label="Wypis"
                align="center"
                widthKey="discharge"
                width={widths.discharge}
                onResize={handleResize}
                onResizeEnd={handleResizeEnd}
                resizable={false}
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((patient, index) => {
              const owner = getOwner(patient);
              const canMove = otherPhysios.length > 0;
              const rowBg = owner
                ? resolvePhysioRowColor(owner.color, owner.rowColor, theme)
                : tableRowColor;

              return (
                <tr
                  key={patient.id}
                  className="group/row"
                  style={{
                    backgroundColor: rowBg,
                    boxShadow: owner ? `inset 4px 0 0 ${owner.color}` : undefined,
                  }}
                >
                  <td
                    className={`border px-0.5 py-0 align-middle text-center font-medium ${
                      isDark
                        ? "border-white/15 text-slate-200"
                        : "border-black/20 text-slate-700"
                    }`}
                  >
                    <div className="flex min-h-[2.5rem] flex-col items-center justify-center gap-0.5">
                      <div className="flex items-center justify-center gap-0.5">
                        <span className="w-4">{index + 1}</span>
                        <button
                          type="button"
                          onClick={() => onDeleteRow(index)}
                          className={`rounded px-0.5 text-[19px] leading-none opacity-0 transition-opacity focus:opacity-100 group-hover/row:opacity-100 ${
                            isDark
                              ? "text-red-400 hover:bg-red-950/50 hover:text-red-300"
                              : "text-red-600 hover:bg-red-100 hover:text-red-800"
                          }`}
                          title="Usuń wiersz"
                        >
                          ×
                        </button>
                      </div>
                      {canMove && (
                        <MovePatientButton
                          targets={otherPhysios}
                          onMove={(toId) => onMovePatient(index, toId)}
                        />
                      )}
                    </div>
                  </td>
                  <td
                    className={`border px-0.5 py-0 align-middle ${
                      isDark ? "border-white/15" : "border-black/20"
                    }`}
                  >
                    <div className="flex min-h-[2.5rem] flex-col justify-center">
                        {owner && (
                          <div className="mb-0.5 flex items-center gap-1 px-0.5">
                            <span
                              className="inline-block max-w-full truncate rounded px-1 py-0.5 text-[11px] font-semibold text-white"
                              style={{ backgroundColor: owner.color }}
                              title={`Pacjent fizjoterapeuty: ${owner.name}`}
                            >
                              zastępstwo · {owner.name}
                            </span>
                            {onReturnSubstitute && (
                              <button
                                type="button"
                                onClick={() => onReturnSubstitute(patient.id)}
                                className="shrink-0 rounded px-1 py-0.5 text-[15px] font-bold leading-none hover:brightness-110"
                                style={{
                                  color: "#fff",
                                  backgroundColor: owner.color,
                                }}
                                title={`Cofnij do ${owner.name}`}
                                aria-label={`Cofnij do ${owner.name}`}
                              >
                                ←
                              </button>
                            )}
                          </div>
                        )}
                      <SpreadsheetCell
                        value={patient.text}
                        onChange={(text) => onUpdatePatient(index, { ...patient, text })}
                        placeholder=""
                        multiline
                      />
                    </div>
                  </td>
                  <td
                    className={`border px-0 py-0 align-middle ${
                      isDark ? "border-white/15" : "border-black/20"
                    }`}
                  >
                    <div className="flex min-h-[2.5rem] items-center justify-center">
                      <DatePickerCell
                        value={patient.dischargeDate}
                        onChange={(dischargeDate) => {
                          const next = toDateInputValue(dischargeDate);
                          const prev = toDateInputValue(patient.dischargeDate);
                          if (!next) {
                            onUpdatePatient(index, {
                              ...patient,
                              dischargeDate: "",
                              dischargeDateManual: undefined,
                              dischargeDateBeforeManual: undefined,
                            });
                            return;
                          }
                          if (next === prev) return;

                          // First date on an empty field (manual patient) — not a correction.
                          if (!prev && !patient.dischargeDateBeforeManual) {
                            onUpdatePatient(index, {
                              ...patient,
                              dischargeDate: next,
                              dischargeDateManual: undefined,
                              dischargeDateBeforeManual: undefined,
                            });
                            return;
                          }

                          // Red only when date differs from the original (from Przyjęcia).
                          const original =
                            toDateInputValue(patient.dischargeDateBeforeManual ?? "") || prev;
                          onUpdatePatient(index, {
                            ...patient,
                            dischargeDate: next,
                            dischargeDateManual: next !== original,
                            dischargeDateBeforeManual: original,
                          });
                        }}
                        onRevert={
                          patient.dischargeDateManual && patient.dischargeDateBeforeManual
                            ? () =>
                                onUpdatePatient(index, {
                                  ...patient,
                                  dischargeDate: patient.dischargeDateBeforeManual!,
                                  dischargeDateManual: undefined,
                                  dischargeDateBeforeManual: undefined,
                                })
                            : undefined
                        }
                        title="Wypis"
                        textClassName={
                          patient.dischargeDateManual
                            ? "text-[19px] font-semibold text-red-600 dark:text-red-400"
                            : "text-[19px]"
                        }
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ backgroundColor: tableRowColor }}>
          <div className="py-1 text-center" style={{ width: widths.lp }}>
            <button
              type="button"
              onClick={onAddRow}
              className={`inline-flex items-center justify-center rounded p-0.5 ${
                isDark
                  ? "text-slate-300 hover:bg-black/25 hover:text-slate-100"
                  : "text-slate-700 hover:bg-white/80 hover:text-slate-900"
              }`}
              title="Dodaj wiersz"
            >
              <PlusIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
