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
    intro: "Podstawy — wystarczy na początek.",
    items: [
      "Wszystko zapisuje się samo. Nie ma przycisku „Zapisz”.",
      "Cofnij: strzałka w lewo u góry albo Ctrl+Z. Ponów: strzałka w prawo albo Ctrl+Y.",
      "Zakładki u góry (Pacjenci, Masaże…) możesz przeciągać — zmieniasz kolejność. Dwuklik w nazwę = własna nazwa.",
      "Księżyc/słońce = jasny lub ciemny motyw.",
      "Zielony „Przewodnik” = ta instrukcja.",
      "Hasło do aplikacji (jeśli włączone): sesja trwa do ok. 6:00 następnego dnia, potem logujesz się ponownie.",
      "Dzwonek = ogłoszenia. Zamknij dzwonkiem, ✕ albo kliknięciem poza panelem (na telefonie też).",
      "Przy ogłoszeniu: „Odczytano” dotyczy tylko tego wpisu. „Nieprzeczytane” cofa oznaczenie.",
    ],
  },
  {
    title: "Co robi się samo",
    intro: "Nie musisz tego klikać — aplikacja pilnuje terminów.",
    items: [
      "Pacjent znika z listy obecnych po dacie wypisu. W dniu wypisu — po 18:00.",
      "Urlop: przypomnienie nad tabelą fizjoterapeuty na 2 dni robocze wcześniej (Krzysztof/masaże — 14 dni).",
      "W przypomnieniu widać pełny zakres urlopu (np. 10.08–24.08). Weekendy i dni zamknięcia placówki nie przerywają wpisu.",
      "Dyżur we wtorek/czwartek: od 7:00 nad tabelą widać godziny, np. 13:25–21:00.",
      "Zmiana w Przyjęciach → powiadomienie u fizjoterapeuty (po prawej; na telefonie nad tabelami).",
      "Masaże: skończone osoby znikają; wolne miejsce może wypełnić ktoś z kolejki.",
      "Zaplanowana zmiana godziny masażu wchodzi w życie od wskazanego dnia — godzina i kolejność wierszy aktualizują się same (gdy otwarta jest strona Masaże).",
      "Stare przyjęcia (po terminie) spadają na dół listy.",
      "Archiwum przyjęć: następny dzień po ostatnim planowanym wypisie w danym miesiącu.",
      "Archiwum dyżurów i urlopów: pierwszy dzień następnego miesiąca (np. lipiec → 1 sierpnia).",
    ],
  },
  {
    title: "Obecni pacjenci",
    href: "/pacjenci",
    intro: "Kto jest na oddziale i u którego fizjoterapeuty.",
    items: [
      "Każdy widoczny fizjoterapeuta ma własną tabelę. Kliknij kratkę — edytujesz od razu.",
      "Usuń wiersz: komputer — najedź na pacjenta, kliknij „×” przy Lp. Telefon — szybko dwa razy dotknij Lp.",
      "Przenieś pacjenta (zastępstwo): komputer — strzałka „→” przy wierszu. Telefon — dotknij Lp., wybierz osobę.",
      "Przy zastępstwie pojawi się napis „zastępstwo”. Cofnij: przycisk przy pacjencie albo „Cofnij zastępstwa” w nagłówku tabeli.",
      "Po lewej: kalendarz i nadchodzące przyjęcia w tym tygodniu.",
      "Po prawej (na telefonie nad tabelami): powiadomienia o zmianach w przyjęciach.",
      "W dniu kontroli przy nazwisku: zielony „K”. Klik — kontrola odbyła się, przycisk znika.",
      "Dzień roboczy przed kontrolą (także sobota i niedziela): żółty „K” (informacja, bez klikania).",
    ],
  },
  {
    title: "Fizjoterapeuci",
    href: "/fizjoterapeuci",
    intro: "Kto pracuje na oddziale — imiona, kolory, kolejność.",
    items: [
      "Dodaj osobę, zmień imię, kolor albo notatkę w nagłówku (np. urlop).",
      "Kolejność kafelków: przeciągnij za ⠿ w nagłówku. Ta sama kolejność jest na stronie Pacjenci.",
      "„Ukryj z tabel” — znika z Pacjentów i list wyboru, ale zostaje w Urlopach. Dane (pacjenci, urlopy) zostają. „Pokaż w tabelach” przywraca.",
      "„×” (Usuń) — przenosi do archiwum: znika z list, kasuje pacjentów tej osoby, czyści przypisania w masażach i przyjęciach. Można przywrócić na dole strony.",
      "„Usuń trwale” (przy usuniętych) — kasuje profil na stałe. Stare wpisy w archiwum zostają bez kafelka tej osoby.",
    ],
  },
  {
    title: "Masaże",
    href: "/masaze",
    intro: "Grafik masaży i kolejka oczekujących.",
    items: [
      "Górna tabela — osoby z terminem (godzina, imię, daty, fizjoterapeuta).",
      "Dolna tabela — kolejka na wolne miejsce.",
      "Notatka pod „Masaż Krzysztof” — np. urlop. Możesz dopisywać, nawet gdy aplikacja sama wstawi informację o urlopie.",
      "„↑ Do grafiku” — ręcznie bierzesz kogoś z kolejki. Aplikacja też robi to sama po zwolnieniu miejsca.",
      "„Zaplanuj zmianę godziny” (po prawej): włącz tryb → kliknij godzinę → wybierz dzień i nową godzinę.",
      "Zaplanowana zmiana: żółta poświata, np. 10:00 ➡️ 12:15. Najedź — zobaczysz od kiedy obowiązuje.",
      "Kliknij taką godzinę — edytujesz obecną godzinę przed dniem zmiany. Kliknięcie obok wraca do widoku ze strzałką.",
      "„Usuń plan” w oknie — kasuje zaplanowaną zmianę. „Anuluj planowanie” — wyłącza tryb.",
      "„Najbliższe wolne miejsca” — wolny termin po skończeniu serii masaży pojawia się dopiero od następnego dnia.",
    ],
  },
  {
    title: "Dyżury wt/czw",
    href: "/dyzury",
    intro: "Kto zostaje dłużej we wtorek i czwartek.",
    items: [
      "Wybierz miesiąc u góry. Przy każdym dniu wybierz osobę z listy.",
      "Widać bieżący miesiąc i następny. Zarchiwizowane miesiące znikają z listy (chyba że je przywrócisz z Archiwum).",
      "Po przywróceniu z Archiwum pojawi się „Archiwizuj” — wraca do schowka.",
    ],
  },
  {
    title: "Przyjęcia",
    href: "/przyjecia",
    intro: "Planowanie: lekarz, pacjenci, daty, fizjoterapeuci.",
    items: [
      "„+ Dodaj przyjęcie” — wybierz lekarza, uzupełnij pacjentów, daty, godziny i fizjoterapeutę.",
      "Panel „Lekarze” po prawie — lista lekarzy i domyślne kolory tabel.",
      "Przy pacjencie: „+” / „✓” = przyszedł (trafia na listę obecnych). Drugi klik = cofnięcie.",
      "„×” = nie przyszedł / dyskwalifikacja. Drugi klik = cofnięcie.",
      "„Usuń” — kasuje wiersz pacjenta.",
      "Zmiana w przyjęciu → powiadomienie u fizjoterapeuty na stronie Pacjenci.",
      "Przyciski ‹ › na dole (po prawie) — przenosisz całe przyjęcie do innego miesiąca.",
      "Zarchiwizowany miesiąc znika z wyboru. Po „Cofnij z archiwum” możesz poprawić i kliknąć „Archiwizuj”.",
    ],
  },
  {
    title: "Kontrole",
    href: "/kontrole",
    intro: "Jedna kontrola u lekarza prowadzącego podczas pobytu.",
    items: [
      "Lista obecnych pacjentów, pogrupowana według lekarza z przyjęcia, z fizjoterapeutą.",
      "Ustaw datę kontroli w kolumnie „Data kontroli”.",
      "W dniu kontroli przy nazwisku na stronie Obecni pacjenci pojawia się zielony przycisk „K”.",
      "Od poprzedniego dnia roboczego (także w weekend) przy nazwisku: żółty „K” (przypomnienie).",
      "Klik „K” przy dacie = kontrola się odbyła (także gdy ktoś zapomniał na liście obecnych). Ponowny klik cofa.",
    ],
  },
  {
    title: "Urlopy",
    href: "/urlopy",
    intro: "Kto kiedy ma wolne — kalendarz na cały rok.",
    items: [
      "P = urlop pewny. N = jeszcze niepewny. Klik na P/N przełącza status.",
      "W święta i dni wolne nie wpiszesz urlopu.",
      "Wiele dni: u góry Od–Do, wybierz osobę, „Dodaj do kalendarza”.",
      "Jeden dzień: w kafelku dnia kliknij „+” i wybierz osobę.",
      "Ukryty fizjoterapeuta nadal widać tutaj — tylko w Urlopach.",
      "Przypomnienie przed urlopem pojawia się nad tabelą na stronie Pacjenci.",
      "Stary rok można zarchiwizować albo przywrócić z Archiwum.",
    ],
  },
  {
    title: "Notatnik",
    href: "/notatnik",
    intro: "Wspólne notatki — każdy może czytać i edytować.",
    items: [
      "„Nowa notatka” — wpis pojawia się na liście po lewej (na telefonie u góry).",
      "Kliknij notatkę, żeby otworzyć. Tytuł opcjonalny. Treść zapisuje się sama.",
      "Kliknij pole treści — panel formatowania: B (pogrubienie), U (podkreślenie), rozmiar, kolor.",
      "Wyrównanie: trzy ikony z kreskami — lewo, środek, prawo. Aktywna ma niebieskie tło.",
      "• = lista punktowana. 1. = lista numerowana (HTML). 1→ = kontynuuj numerowanie.",
      "Ręczne numerowanie (wpisujesz „1.”, „2.”…): Enter na linii z numerem → następna linia z kolejnym numerem. Po przerwie: wpisz „1.” — kropka podpowie następny numer.",
      "Tab przy numeracji = podpunkt z kropką (w wcięciu), nie kolejny numer. Shift+Tab = cofnij wcięcie.",
      "„Usuń” — kasuje całą notatkę.",
    ],
  },
  {
    title: "Archiwum",
    href: "/archiwum",
    intro: "Stare miesiące i lata — poza bieżącą pracą, ale dostępne do wglądu.",
    items: [
      "U góry wybierz kategorię: Przyjęcia, Dyżury lub Urlopy.",
      "Przyjęcia: „Szukaj pacjenta” — imię/nazwisko w całym archiwum; „Pokaż miesiąc” otwiera tabelę.",
      "Dyżury i urlopy: „Miesiące” albo „Cały rok” (wszystkie miesiące naraz).",
      "Przywracanie z archiwum — w widoku „Miesiące”; rok urlopów zarchiwizowany ręcznie — też z „Cały rok”.",
      "„Cofnij z archiwum” — wraca do Przyjęć / Dyżurów / Urlopów; możesz poprawić.",
      "Po poprawkach: „Archiwizuj” — znowu ląduje w Archiwum.",
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
