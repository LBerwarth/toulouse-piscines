import { getStatusReport } from "@/lib/status";
import { cookies } from "next/headers";
import { FILTER_COOKIE, parseFilterCookie, readFilterPreset } from "@/lib/filters";
import { PoolsView } from "@/components/pools-view";
import { StaleBanner } from "@/components/stale-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { FeedbackForm } from "@/components/feedback-form";
import { FEEDBACK_ANCHOR } from "@/lib/feedback";

// Rendu dynamique : on relit à chaque visite le cache partagé (Supabase),
// alimenté par le cron (15 min en journée, pause la nuit — cf. lib/status.ts).
// La page ne scrape pas elle-même, sauf filet de sécurité (cron muet > 13 h).
// (revalidate = 0 garde malgré tout en cache les fetch à revalidation positive,
//  comme le calendrier scolaire mis en cache 24 h.)
export const revalidate = 0;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [report, params, jar] = await Promise.all([getStatusReport(), searchParams, cookies()]);
  // Les paramètres d'URL (raccourcis du lanceur Android) priment sur les
  // filtres mémorisés : le raccourci « 50 m » doit montrer les 50 m même si la
  // dernière visite s'était terminée sur « 25 m ».
  const preset = readFilterPreset({
    ...parseFilterCookie(jar.get(FILTER_COOKIE)?.value),
    ...params,
  });

  const updated = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(report.updatedAt));

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 sm:py-8">
      <header className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-fuchsia-600 to-violet-800 py-6 pl-5 pr-16 text-white shadow-lg shadow-pink-200/60 dark:from-pink-700 dark:via-fuchsia-800 dark:to-violet-900 dark:shadow-black/40 sm:py-8 sm:pl-7 sm:pr-18">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Piscines de Toulouse
        </h1>
        <p className="mt-1.5 text-sm font-light text-pink-50">
          Quelles piscines municipales sont ouvertes aujourd&apos;hui ?
        </p>
        <p className="mt-3 text-xs text-pink-100/80">
          Mis à jour {updated} · d&apos;après{" "}
          <a
            href="https://metropole.toulouse.fr/sortir/sport/les-piscines-toulousaines"
            className="underline decoration-pink-200/60 underline-offset-2 hover:text-white"
            target="_blank"
            rel="noreferrer"
          >
            metropole.toulouse.fr
          </a>
        </p>
        {/* Vagues décoratives */}
        <svg
          className="pointer-events-none absolute -bottom-1 left-0 w-full text-white/15"
          viewBox="0 0 400 40"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M0 25 Q 25 15 50 25 T 100 25 T 150 25 T 200 25 T 250 25 T 300 25 T 350 25 T 400 25 V 40 H 0 Z"
            fill="currentColor"
          />
          <path
            d="M0 32 Q 25 24 50 32 T 100 32 T 150 32 T 200 32 T 250 32 T 300 32 T 350 32 T 400 32 V 40 H 0 Z"
            fill="currentColor"
          />
        </svg>
        <ThemeToggle />
      </header>

      <StaleBanner updatedAt={report.updatedAt} updatedLabel={updated} />

      <PoolsView pools={report.pools} days={report.days} preset={preset} />

      <FeedbackForm />

      <footer className="mt-10 text-center text-xs text-slate-400 dark:text-slate-300">
        <p>
          Application personnelle et indépendante, non affiliée à la mairie de
          Toulouse ni à Toulouse Métropole et ne les représentant pas. Données
          issues des pages officielles des piscines sur{" "}
          <a
            href="https://metropole.toulouse.fr/sortir/sport/les-piscines-toulousaines"
            className="underline underline-offset-2 hover:text-fuchsia-700 dark:hover:text-fuchsia-300"
            target="_blank"
            rel="noreferrer"
          >
            metropole.toulouse.fr
          </a>
          . Vérifiez toujours les informations critiques sur la page officielle
          de chaque piscine.
        </p>
        <p className="mt-2">
          <a href="/confidentialite" className="underline underline-offset-2 hover:text-fuchsia-700 dark:hover:text-fuchsia-300">
            Confidentialité
          </a>
          {" · "}
          <a href={`#${FEEDBACK_ANCHOR}`} className="underline underline-offset-2 hover:text-fuchsia-700 dark:hover:text-fuchsia-300">
            Signaler une erreur
          </a>
        </p>
      </footer>
    </main>
  );
}
