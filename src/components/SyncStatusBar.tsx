"use client";

import { useData } from "@/context/DataContext";
import { Btn } from "@/components/ui";

export function SyncStatusBar() {
  const {
    remoteUpdateAvailable,
    applyRemoteUpdate,
    saveIssue,
    hasPendingSave,
    isOnline,
    saving,
    retrySave,
  } = useData();

  if (!remoteUpdateAvailable && !saveIssue && !(hasPendingSave && !saving && isOnline)) {
    return null;
  }

  return (
    <div className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-3 py-2 sm:px-4">
        {remoteUpdateAvailable ? (
          <>
            <p className="text-[16px] text-amber-800 dark:text-amber-300">
              Dane zmieniły się u kogoś innego. Możesz scalić zmiany z serwerem.
            </p>
            <Btn
              variant="secondary"
              disabled={saving}
              onClick={() => void applyRemoteUpdate()}
              className="text-[15px]"
            >
              Scal i odśwież
            </Btn>
          </>
        ) : null}

        {!remoteUpdateAvailable && saveIssue === "network" ? (
          <>
            <p className="text-[16px] text-red-700 dark:text-red-300">
              Brak połączenia — zmiany nie zostały zapisane.
              {!isOnline ? " Czekamy na sieć…" : " Spróbuj ponownie."}
            </p>
            {isOnline && hasPendingSave ? (
              <Btn
                variant="secondary"
                disabled={saving}
                onClick={() => void retrySave()}
                className="text-[15px]"
              >
                Spróbuj ponownie
              </Btn>
            ) : null}
          </>
        ) : null}

        {!remoteUpdateAvailable && saveIssue === "conflict" ? (
          <p className="text-[16px] text-red-700 dark:text-red-300">
            Konflikt zapisu — odśwież stronę i spróbuj ponownie.
          </p>
        ) : null}

        {!remoteUpdateAvailable &&
        !saveIssue &&
        hasPendingSave &&
        !saving &&
        isOnline ? (
          <>
            <p className="text-[16px] text-amber-800 dark:text-amber-300">
              Oczekujące zmiany nie zostały jeszcze zapisane.
            </p>
            <Btn
              variant="secondary"
              onClick={() => void retrySave()}
              className="text-[15px]"
            >
              Zapisz teraz
            </Btn>
          </>
        ) : null}
      </div>
    </div>
  );
}
