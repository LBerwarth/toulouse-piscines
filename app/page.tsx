import { getStatusReport } from "@/lib/status";
import { PoolList } from "@/components/pool-list";
import { DayTimeline } from "@/components/day-timeline";

// Régénéré au plus toutes les 30 minutes pour attraper les fermetures
// publiées en cours de journée par la mairie.
export const revalidate = 1800;

export default async function Home() {
  const report = await getStatusReport();

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
      <header className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-fuchsia-600 to-violet-800 px-5 py-6 text-white shadow-lg shadow-pink-200/60 sm:px-7 sm:py-8">
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
      </header>

      <DayTimeline pools={report.pools} />

      <PoolList pools={report.pools} />

      <footer className="mt-10 text-center text-xs text-slate-400">
        <p>
          Projet personnel, non affilié à la mairie de Toulouse. Vérifiez les
          informations critiques sur la page officielle de chaque piscine.
        </p>
      </footer>
    </main>
  );
}
