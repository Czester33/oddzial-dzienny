"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLOR_PRESETS,
  derivePhysioRowColorFromAccent,
  hexToHsl,
  hslToHex,
} from "@/lib/physio-utils";
import type { Physiotherapist } from "@/lib/types";

function isPresetColor(color: string): boolean {
  return COLOR_PRESETS.some((preset) => preset.color.toLowerCase() === color.toLowerCase());
}

function CustomColorPanel({
  initialColor,
  onApply,
}: {
  initialColor: string;
  onApply: (color: string, rowColor: string) => void;
}) {
  const initial = hexToHsl(initialColor) ?? { h: 210, s: 70, l: 45 };
  const [h, setH] = useState(initial.h);
  const [s, setS] = useState(initial.s);
  const [l, setL] = useState(initial.l);
  const slRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const color = hslToHex(h, s, l);
  const rowColor = derivePhysioRowColorFromAccent(color);

  const pickFromSl = useCallback((clientX: number, clientY: number) => {
    const rect = slRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextS = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
    const nextL = Math.round(
      Math.max(0, Math.min(100, (1 - (clientY - rect.top) / rect.height) * 100))
    );
    setS(nextS);
    setL(nextL);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      pickFromSl(e.clientX, e.clientY);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [pickFromSl]);

  return (
    <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 dark:border-slate-600">
      <div
        ref={slRef}
        role="slider"
        aria-label="Nasycenie i jasność"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={s}
        tabIndex={0}
        className="relative h-28 w-full cursor-crosshair overflow-hidden rounded-md"
        style={{ backgroundColor: `hsl(${h}, 100%, 50%)` }}
        onMouseDown={(e) => {
          draggingRef.current = true;
          pickFromSl(e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2;
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setS((v) => Math.max(0, v - step));
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setS((v) => Math.min(100, v + step));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setL((v) => Math.min(100, v + step));
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setL((v) => Math.max(0, v - step));
          }
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black to-transparent" />
        <div
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/30"
          style={{
            left: `${s}%`,
            top: `${100 - l}%`,
            backgroundColor: color,
          }}
        />
      </div>

      <input
        type="range"
        min={0}
        max={360}
        value={h}
        onChange={(e) => setH(Number(e.target.value))}
        aria-label="Odcień"
        className="h-3 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow"
        style={{
          background:
            "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
        }}
      />

      <div className="flex items-center gap-2">
        <span
          className="h-8 w-8 shrink-0 rounded-md border border-black/15 dark:border-white/20"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <input
          type="text"
          value={color.toUpperCase()}
          onChange={(e) => {
            const next = hexToHsl(e.target.value);
            if (!next) return;
            setH(next.h);
            setS(next.s);
            setL(next.l);
          }}
          className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-[13px] font-mono uppercase text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          aria-label="Kod koloru"
        />
        <button
          type="button"
          onClick={() => onApply(color, rowColor)}
          className="shrink-0 rounded-md bg-slate-800 px-2.5 py-1 text-[13px] font-medium text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
        >
          OK
        </button>
      </div>
    </div>
  );
}

export function PhysioColorPicker({
  physio,
  onPickPreset,
  onPickCustom,
}: {
  physio: Physiotherapist;
  onPickPreset: (presetIndex: number) => void;
  onPickCustom: (color: string, rowColor: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const customActive = !isPresetColor(physio.color);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setCustomOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setCustomOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-black/15 bg-white/90 px-2 py-1.5 text-[16px] font-medium text-slate-800 hover:bg-white dark:border-white/20 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:bg-slate-800"
        aria-expanded={open}
        title="Zmień kolor sekcji"
      >
        <span
          className="h-4 w-4 shrink-0 rounded-sm border border-black/20 dark:border-white/30"
          style={{ backgroundColor: physio.color }}
          aria-hidden
        />
        Kolor
      </button>

      {open && (
        <div
          className={`absolute bottom-full left-1/2 z-20 mb-2 max-h-[min(24rem,70vh)] -translate-x-1/2 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-600 dark:bg-slate-900 ${
            customOpen ? "w-[13.5rem]" : "w-[11rem]"
          }`}
        >
          <p className="mb-1.5 text-center text-[13px] font-medium text-slate-500 dark:text-slate-400">
            Kolor sekcji
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {COLOR_PRESETS.map((preset, i) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  onPickPreset(i);
                  setOpen(false);
                  setCustomOpen(false);
                }}
                className={`aspect-square w-full rounded-md border-2 transition-transform hover:scale-105 ${
                  physio.color.toLowerCase() === preset.color.toLowerCase()
                    ? "border-slate-900 dark:border-white"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: preset.color }}
                title={preset.name}
                aria-label={preset.name}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[13px] font-medium transition-colors ${
              customOpen || customActive
                ? "border-slate-900 bg-slate-100 dark:border-white dark:bg-slate-800"
                : "border-slate-200 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            }`}
          >
            <span
              className="h-4 w-4 rounded-sm border border-black/20 dark:border-white/30"
              style={{
                background: customActive
                  ? physio.color
                  : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
              }}
              aria-hidden
            />
            Własny kolor
          </button>

          {customOpen && (
            <CustomColorPanel
              key={physio.color}
              initialColor={physio.color}
              onApply={(color, rowColor) => {
                onPickCustom(color, rowColor);
                setOpen(false);
                setCustomOpen(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
