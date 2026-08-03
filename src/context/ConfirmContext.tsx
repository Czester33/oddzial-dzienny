"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Btn } from "@/components/ui";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
};

type PendingConfirm = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

function normalizeOptions(options: ConfirmOptions | string): ConfirmOptions {
  if (typeof options === "string") {
    return { message: options };
  }
  return options;
}

function ConfirmDialog({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const title = options.title ?? "Potwierdzenie";
  const confirmLabel = options.confirmLabel ?? (options.variant === "danger" ? "Usuń" : "OK");
  const cancelLabel = options.cancelLabel ?? "Anuluj";
  const isDanger = options.variant === "danger";

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2
          id="confirm-dialog-title"
          className="text-[20px] font-semibold text-slate-800 dark:text-slate-100"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-message"
          className="mt-3 whitespace-pre-wrap text-[16px] leading-relaxed text-slate-600 dark:text-slate-300"
        >
          {options.message}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[16px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {cancelLabel}
          </button>
          <Btn
            variant={isDanger ? "danger" : "primary"}
            onClick={onConfirm}
            className="text-[16px]"
          >
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options: normalizeOptions(options), resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && typeof document !== "undefined"
        ? createPortal(
            <ConfirmDialog
              options={pending.options}
              onConfirm={() => close(true)}
              onCancel={() => close(false)}
            />,
            document.body
          )
        : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue["confirm"] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx.confirm;
}
