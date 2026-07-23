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
    intro: "Zacznij od tego. Reszta będzie prostsza.",
    items: [
      "Nic nie musisz zapisywać. Wpisujesz — i już jest zapisane.",
      "Jak coś popsujesz: kliknij „Cofnij” u góry (strzałka w lewo) albo naciśnij Ctrl+Z.",
      "Jak za bardzo cofnąłeś: kliknij „Ponów” (strzałka w prawo) albo naciśnij Ctrl+Y.",
      "Górne zakładki (Pacjenci, Masaże itd.) możesz przeciągać myszką — zmieniasz kolejność.",
      "Kliknij dwa razy w nazwę zakładki — możesz ją nazwać inaczej.",
      "Przycisk z księżycem/słońcem = jasny albo ciemny wygląd.",
      "Zielony przycisk „Przewodnik” = ta instrukcja.",
      "Dzwonek = ogłoszenia dla wszystkich.",
    ],
  },
  {
    title: "Co robi się samo",
    intro: "Tego nie musisz klikać. Aplikacja robi to za Ciebie.",
    items: [
      "Jak minie data wypisu pacjenta, znika z listy obecnych. W dniu wypisu — po 18:00.",
      "Jak ktoś ma urlop, nad jego tabelą pojawia się przypomnienie (2 dni robocze wcześniej). Przy masażach (Krzysztof) — już 14 dni wcześniej.",
      "We wtorek albo czwartek, gdy ktoś ma dyżur, od rana (od 7:00) nad jego tabelą widać godziny dyżuru, np. 13:25-21:00.",
      "Jak coś zmienisz w Przyjęciach, na stronie pacjentów pojawia się powiadomienie (po prawej; na telefonie — na dole).",
      "W masażach skończone osoby znikają same. Ktoś z kolejki może wejść na wolne miejsce.",
      "Stare przyjęcia (już po terminie) spadają na dół listy.",
      "Stare miesiące przyjęć i dyżurów same idą do Archiwum (w ostatni dzień roboczy miesiąca). Urlopy — cały rok, w ostatni dzień roboczy grudnia.",
    ],
  },
  {
    title: "Obecni pacjenci",
    href: "/pacjenci",
    intro: "Tu widać, kto teraz jest na oddziale i do którego fizjoterapeuty należy.",
    items: [
      "Każdy fizjoterapeuta ma swoją tabelę.",
      "Kliknij w kratkę — możesz pisać albo zmieniać.",
      "Przeniesienie do kogoś innego (zastępstwo): najedź na pacjenta → kliknij strzałkę „→” → wybierz osobę. Przy pacjencie pojawi się napis „zastępstwo”.",
      "Cofnięcie zastępstwa: przy pacjencie jest przycisk powrotu, albo w nagłówku tabeli „Cofnij zastępstwa”.",
      "Po lewej: kalendarz i kto przychodzi w tym tygodniu. Po prawej: co się zmieniło w przyjęciach.",
    ],
  },
  {
    title: "Fizjoterapeuci",
    href: "/fizjoterapeuci",
    intro: "Lista osób z oddziału.",
    items: [
      "Tu dodajesz nową osobę, zmieniasz imię albo kolor, albo usuwasz.",
      "Kolor tej osoby potem widać w tabelach.",
      "Żeby zmienić kolejność kafelków: złap tylko przycisk ⠿ w nagłówku i przeciągnij. Reszta kafelka nie przesuwa.",
      "Ta kolejność obowiązuje też w tabelach na stronie pacjentów.",
    ],
  },
  {
    title: "Masaże",
    href: "/masaze",
    intro: "Kto ma masaż i kto czeka w kolejce.",
    items: [
      "Górna tabela = osoby, które już mają termin (godzina, imię, daty).",
      "Dolna tabela = kolejka (czekają na wolne miejsce).",
      "Możesz ręcznie wziąć kogoś z kolejki do grafiku. Aplikacja też może to zrobić sama, gdy zwolni się miejsce.",
      "Obok widać najbliższe wolne terminy.",
    ],
  },
  {
    title: "Dyżury wt/czw",
    href: "/dyzury",
    intro: "Kto zostaje dłużej we wtorek i w czwartek.",
    items: [
      "Wybierz miesiąc u góry.",
      "Przy dniu wybierz, kto ma dyżur.",
      "Widać ten miesiąc i następne. Stare miesiące są schowane (chyba że ktoś je wyjął z Archiwum).",
      "Jak miesiąc był wyjęty z Archiwum, pojawi się przycisk „Archiwizuj” — wraca z powrotem do Archiwum.",
    ],
  },
  {
    title: "Przyjęcia",
    href: "/przyjecia",
    intro: "Tu planujesz, kto kiedy przychodzi (lekarz + pacjenci).",
    items: [
      "Dodaj przyjęcie: lekarz, data, godziny, pacjenci i do którego fizjoterapeuty idą.",
      "Przy nazwisku pacjenta są małe przyciski:",
      "„+” albo „✓” = pacjent przyszedł (wpada na listę obecnych). Kliknij drugi raz = cofasz.",
      "„×” = nie przyszedł / dyskwalifikacja. Kliknij drugi raz = cofasz.",
      "„Usuń” = kasujesz ten wiersz z listy.",
      "Jak coś zmienisz, fizjoterapeuta dostanie powiadomienie na stronie pacjentów.",
      "Jak miesiąc był wyjęty z Archiwum, pojawi się „Archiwizuj” — wraca do Archiwum.",
    ],
  },
  {
    title: "Urlopy",
    href: "/urlopy",
    intro: "Kto kiedy ma wolne.",
    items: [
      "P = urlop pewny (na pewno). N = jeszcze niepewny.",
      "W święta i dni wolne od pracy nie da się wpisać urlopu.",
      "Wiele dni naraz: u góry ustaw Od i Do, zaznacz osoby, kliknij „Dodaj do kalendarza”.",
      "Jeden dzień: w kalendarzu kliknij „+” i wybierz osobę.",
      "Przed urlopem nad tabelą fizjoterapeuty (na stronie pacjentów) pojawi się przypomnienie.",
      "Jak rok był wyjęty z Archiwum, pojawi się „Archiwizuj” — wraca do Archiwum.",
    ],
  },
  {
    title: "Archiwum",
    href: "/archiwum",
    intro: "Stare rzeczy — żeby nic nie zaginęło, ale nie mieszało w bieżącej pracy.",
    items: [
      "Tu lądują stare miesiące przyjęć i dyżurów oraz stare lata urlopów.",
      "Kliknij miesiąc albo rok — zobaczysz te same tabele co kiedyś, tylko do oglądania.",
      "Znalazłeś błąd w starym miesiącu? Kliknij „Cofnij z archiwum”. Wraca do Przyjęć / Dyżurów / Urlopów i możesz poprawić.",
      "Jak skończysz poprawiać, kliknij „Archiwizuj” — znowu idzie do Archiwum. Samo od razu nie wróci.",
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
        className="rounded-md border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-[15px] font-medium text-white shadow-[0_0_12px_rgba(16,185,129,0.65)] hover:bg-emerald-400 hover:shadow-[0_0_16px_rgba(16,185,129,0.85)] dark:border-emerald-400 dark:bg-emerald-500 dark:text-white dark:hover:bg-emerald-400"
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
                  Prosto: co gdzie kliknąć i co robi się samo
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
