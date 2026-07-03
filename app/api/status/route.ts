import { NextResponse } from "next/server";
import { getStatusReport } from "@/lib/status";

// Statut « live » minimal par piscine, consommé par l'application sœur
// piscines-france (https://github.com/…/piscines-france) pour superposer le
// vrai statut du jour (fermetures estivales comprises) aux horaires OSM.
export const revalidate = 0;

export async function GET() {
  const report = await getStatusReport();
  const pools = report.pools.map((pool) => {
    const today = pool.week?.[0] ?? null;
    return {
      slug: pool.slug,
      name: pool.name,
      url: pool.url,
      ok: pool.ok,
      openToday: today ? today.openToday : null,
      /** Créneaux du jour, « HH:MM » */
      slots: today?.slotsToday ?? [],
      closureReason: today?.closureReason ?? null,
      confidence: today?.confidence ?? null,
    };
  });

  return NextResponse.json(
    { updatedAt: report.updatedAt, pools },
    {
      headers: {
        // Consommé depuis un autre domaine (piscines-france).
        "Access-Control-Allow-Origin": "*",
        // Le rapport sous-jacent est déjà mis en cache ~30 min côté serveur.
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    },
  );
}
