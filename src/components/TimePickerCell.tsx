"use client";

import { useEffect, useState } from "react";
import { formatTimeLabel, parseTimeLabel } from "@/lib/massage-schedule";

const INPUT_CLASS =
  "w-full border-0 bg-transparent px-0.5 py-0.5 text-center text-[19px] tabular-nums text-inherit focus:bg-black/10 focus:outline-none";

function clampHour(hours: number): number {
  if (!Number.isFinite(hours)) return 0;
  return Math.min(23, Math.max(0, hours));
}

function clampMinute(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.min(59, Math.max(0, minutes));
}

function parseDigitsToTime(digits: string): string {
  if (!digits) return "";
  if (digits.length <= 2) {
    return formatTimeLabel(clampHour(Number(digits)), 0);
  }
  if (digits.length === 3) {
    return formatTimeLabel(clampHour(Number(digits[0])), clampMinute(Number(digits.slice(1))));
  }
  return formatTimeLabel(
    clampHour(Number(digits.slice(0, 2))),
    clampMinute(Number(digits.slice(2)))
  );
}

/**
 * 24h typing:
 * - 3–9 → colon right away ("8" → "8:") so minutes follow
 * - 0–2 → wait for 2nd digit ("23" → "23:") or typed ":"
 * - Respect existing ":" so "8:30" is not read as 83
 */
export function formatTimeWhileTyping(raw: string, previous = ""): string {
  const cleaned = raw.replace(/[^\d:]/g, "");
  const prevCleaned = previous.replace(/[^\d:]/g, "");
  const isDeleting = cleaned.length < prevCleaned.length;

  if (!cleaned) return "";

  if (cleaned.includes(":")) {
    const hour = cleaned.split(":")[0]?.replace(/\D/g, "").slice(0, 2) ?? "";
    const minute = cleaned.split(":")[1]?.replace(/\D/g, "").slice(0, 2) ?? "";
    if (!hour) return "";
    if (cleaned.endsWith(":") || minute.length > 0) {
      return minute.length > 0 ? `${hour}:${minute}` : `${hour}:`;
    }
    return hour;
  }

  const digits = cleaned.replace(/\D/g, "").slice(0, 4);
  if (!digits) return "";

  if (isDeleting) return digits;

  if (digits.length === 1) {
    // 3–9 can only be a one-digit hour → jump to minutes
    if (Number(digits) >= 3) return `${digits}:`;
    return digits;
  }

  if (digits.length === 2) return `${digits}:`;

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function normalizeTimeOnBlur(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ":") return "";

  const parsed = parseTimeLabel(trimmed);
  if (parsed) {
    return formatTimeLabel(clampHour(parsed.hours), clampMinute(parsed.minutes));
  }

  if (trimmed.includes(":")) {
    const [hourPart = "", minutePart = ""] = trimmed.split(":");
    const hourDigits = hourPart.replace(/\D/g, "").slice(0, 2);
    const minuteDigits = minutePart.replace(/\D/g, "").slice(0, 2);
    if (!hourDigits) return "";
    return formatTimeLabel(
      clampHour(Number(hourDigits)),
      clampMinute(Number(minuteDigits || "0"))
    );
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  return parseDigitsToTime(digits);
}

export function TimePickerCell({
  value,
  onChange,
  className = INPUT_CLASS,
}: {
  value: string;
  onChange: (v: string) => void;
  scheduleHours?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  const displayValue = (() => {
    const parsed = parseTimeLabel(value);
    return parsed
      ? formatTimeLabel(clampHour(parsed.hours), clampMinute(parsed.minutes))
      : value;
  })();

  useEffect(() => {
    if (!focused) setDraft(displayValue);
  }, [displayValue, focused]);

  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={5}
      value={focused ? draft : displayValue}
      onFocus={() => {
        setDraft(displayValue);
        setFocused(true);
      }}
      onChange={(e) => {
        const next = formatTimeWhileTyping(e.target.value, draft);
        setDraft(next);
      }}
      onBlur={() => {
        const normalized = normalizeTimeOnBlur(draft);
        setFocused(false);
        setDraft(normalized);
        onChange(normalized);
      }}
      className={className}
      aria-label="Godzina"
    />
  );
}
