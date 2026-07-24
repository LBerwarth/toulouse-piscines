import { SW_SOURCE } from "@/lib/sw-source";

export const dynamic = "force-static";

// Identifiant du build, figé au moment de la compilation : il change à chaque
// déploiement (SHA du commit sur Vercel), ce qui rend le script du SW différent
// et donc détecté comme une mise à jour.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? String(Date.now());

export function GET() {
  const body = `const SW_BUILD = ${JSON.stringify(BUILD_ID)};\n${SW_SOURCE}`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Toujours revalidé : les utilisateurs reçoivent vite la dernière version.
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
