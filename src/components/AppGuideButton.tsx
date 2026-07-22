"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { APP_BETA_NOTICE } from "@/lib/app-beta-notice";

type GuideSection = {
  title: string;
  href?: string;
  intro?: string;
  items: string[];
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    title: "Na start",
    intro: "Kilka rzeczy, które działają wszędzie w aplikacji.",
    items: [
      "Nie musisz nic zapisywać ręcznie — zmiany zapisują się same. Gdy trwa zapis, w menu widać „Zapisywanie…”.",
      "Pomyłka? Kliknij „Cofnij” albo naciśnij Ctrl+Z.",
      "Zakładki w menu można przeciągać (kolejność) albo kliknąć dwa razy (zmiana nazwy).",
      "Przycisk motywu przełącza jasny i ciemny wygląd.",
      "Dzwonek to ogłoszenia dla całego zespołu.",
    ],
  },
  {
    title: "Co dzieje się samo",
    intro: "Aplikacja sama pilnuje części spraw — nie trzeba ich robić ręcznie.",
    items: [
      "Pacjent znika z listy obecnych po dacie wypisu (w dniu wypisu — po godzinie 18:00).",
      "Notatka o urlopie pojawia się w nagłówku tabeli fizjoterapeuty 2 dni robocze przed urlopem. Przy masażach (Krzysztof) ostrzeżenie widać już 14 dni wcześniej.",
      "W dniu dyżuru (wtorek/czwartek) w nagłówku fizjoterapeuty widać godziny dyżuru.",
      "Zmiana w Przyjęciach tworzy powiadomienie na stronie pacjentów (kafelki po prawej; na telefonie — pasek na dole).",
      "W masażach: skończone wpisy znikają same, a osoby z kolejki mogą wejść na wolne miejsca.",
      "Zakończone przyjęcia lądują na dole listy.",
      "Przyjęcia i dyżury archiwizują się same w ostatni dzień roboczy miesiąca; urlopy — w ostatni dzień roboczy grudnia (cały rok).",
    ],
  },
  {
    title: "Obecni pacjenci",
    href: "/pacjenci",
    intro: "Główna lista — kto aktualnie jest u którego fizjoterapeuty.",
    items: [
      "Każdy fizjoterapeuta ma swoją tabelę. Kliknij w komórkę, żeby edytować.",
      "Zastępstwo: najedź na wiersz pacjenta, kliknij strzałkę „→” i wybierz fizjoterapeutę, do którego przenosisz pacjenta. Przy pacjencie pojawi się oznaczenie „zastępstwo”.",
      "Cofnięcie: u fizjoterapeuty prowadzącego w nagłówku tabeli jest „Cofnij zastępstwa”, albo przy samym pacjencie przycisk powrotu.",
      "Po lewej: kalendarz i przyjęcia w tym tygodniu. Po prawej: powiadomienia o zmianach w przyjęciach.",
    ],
  },
  {
    title: "Fizjoterapeuci",
    href: "/fizjoterapeuci",
    intro: "Lista osób pracujących w oddziale.",
    items: [
      "Tu dodajesz, edytujesz i usuwasz fizjoterapeutów.",
      "Kolor każdej osoby pojawia się potem w tabelach i oznaczeniach.",
    ],
  },
  {
    title: "Masaże",
    href: "/masaze",
    intro: "Grafik masaży i lista oczekujących.",
    items: [
      "Górna tabela to osoby w grafiku (godzina, pacjent, daty, od kogo).",
      "Dolna tabela to kolejka. Z kolejki można dodać kogoś do grafiku ręcznie albo automatycznie, gdy zwolni się miejsce.",
      "Obok widać najbliższe wolne terminy.",
    ],
  },
  {
    title: "Dyżury wt/czw",
    href: "/dyzury",
    intro: "Kto zostaje na dyżurze we wtorki i czwartki.",
    items: [
      "Wybierz miesiąc i przypisz fizjoterapeutę do dnia.",
      "Widać bieżący i przyszłe miesiące; przeszłe są ukryte (chyba że miesiąc został cofnięty z archiwum).",
      "Po cofnięciu z archiwum przy miesiącu pojawia się „Archiwizuj” — wraca do archiwum ręcznie.",
    ],
  },
  {
    title: "Przyjęcia",
    href: "/przyjecia",
    intro: "Planowanie przyjęć z lekarzami i pacjentami.",
    items: [
      "Tu układaj sesje: lekarz, godziny, pacjenci, przypisany fizjoterapeuta.",
      "Przy każdym pacjencie (z prawej strony nazwiska): „+” / „✓” — przyjęty (dodaje do obecnych pacjentów; ponowne kliknięcie cofa). „×” — dyskwalifikacja / nie stawił się (ponowne kliknięcie cofa). „Usuń” — usuwa wiersz z listy.",
      "Po zapisie fizjoterapeuta dostaje powiadomienie na stronie pacjentów.",
      "Po cofnięciu miesiąca z archiwum przy wyborze miesiąca widać „Archiwizuj” — wraca do archiwum ręcznie.",
    ],
  },
  {
    title: "Urlopy",
    href: "/urlopy",
    intro: "Kalendarz urlopów na cały rok.",
    items: [
      "P = urlop pewny, N = niepewny. W święta i dni wolne nie da się ustawić urlopu.",
      "Notatka o urlopie pojawia się w nagłówku fizjoterapeuty 2 dni robocze wcześniej (na stronie pacjentów).",
      "Okres: w panelu u góry ustaw daty Od–Do, status, zaznacz osoby i kliknij „Dodaj do kalendarza”.",
      "Jeden dzień: w kalendarzu kliknij „+” i wybierz osobę.",
      "Po cofnięciu roku z archiwum przy wyborze roku widać „Archiwizuj” — wraca do archiwum ręcznie.",
    ],
  },
  {
    title: "Archiwum",
    href: "/archiwum",
    intro: "Historia przyjęć, dyżurów i urlopów.",
    items: [
      "Przyjęcia i dyżury: zarchiwizowany miesiąc. Urlopy: zarchiwizowany cały rok.",
      "Kliknij miesiąc lub rok, żeby zobaczyć tabele.",
      "„Cofnij z archiwum” przywraca dane do aktywnej zakładki (Przyjęcia / Dyżury / Urlopy), żeby je poprawić.",
      "Przywrócony okres nie archiwizuje się od razu sam — wraca przyciskiem „Archiwizuj” w tej zakładce.",
    ],
  },
];

export function AppGuideButton() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[15px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        Przewodnik
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 p-4 pt-[max(1rem,8vh)]">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-guide-title"
            className="flex max-h-[min(85vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h2
                  id="app-guide-title"
                  className="text-[20px] font-bold text-slate-800 dark:text-slate-100"
                >
                  Przewodnik po aplikacji
                </h2>
                <p className="text-[15px] text-slate-500 dark:text-slate-400">
                  Krótko: co gdzie jest i jak z tego korzystać
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-[20px] text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Zamknij przewodnik"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
              {GUIDE_SECTIONS.map((section) => (
                <section key={section.title}>
                  <h3 className="text-[18px] font-semibold text-slate-800 dark:text-slate-100">
                    {section.href ? (
                      <Link
                        href={section.href}
                        className="text-blue-700 hover:underline dark:text-blue-400"
                        onClick={() => setOpen(false)}
                      >
                        {section.title}
                      </Link>
                    ) : (
                      section.title
                    )}
                  </h3>
                  {section.intro ? (
                    <p className="mt-1 mb-2 text-[15px] text-slate-500 dark:text-slate-400">
                      {section.intro}
                    </p>
                  ) : (
                    <div className="mb-2" />
                  )}
                  <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}

              <section className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {APP_BETA_NOTICE}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
