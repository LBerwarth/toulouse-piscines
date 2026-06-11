export interface Pool {
  slug: string;
  name: string;
}

export const POOL_BASE_URL = "https://metropole.toulouse.fr/annuaire/";

// Les 12 piscines municipales listées sur
// https://metropole.toulouse.fr/sortir/sport/les-piscines-toulousaines
export const POOLS: Pool[] = [
  { slug: "piscine-alban-minville", name: "Alban Minville" },
  { slug: "piscine-alex-jany", name: "Alex Jany" },
  { slug: "piscine-alfred-nakache-ete", name: "Alfred Nakache été" },
  { slug: "piscine-alfred-nakache-hiver", name: "Alfred Nakache hiver" },
  { slug: "piscine-bellevue", name: "Bellevue" },
  { slug: "piscine-castex", name: "Castex" },
  { slug: "piscine-chapou-ete", name: "Chapou été" },
  { slug: "piscine-jean-boiteux-espace-job", name: "Jean Boiteux (Espace Job)" },
  { slug: "piscine-leo-lagrange", name: "Léo Lagrange" },
  { slug: "piscine-papus", name: "Papus" },
  { slug: "piscine-toulouse-lautrec", name: "Toulouse Lautrec" },
  { slug: "piscine-yvonne-godard", name: "Yvonne Godard" },
];

export function poolUrl(pool: Pool): string {
  return `${POOL_BASE_URL}${pool.slug}`;
}
