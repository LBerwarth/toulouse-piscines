import type { MetadataRoute } from "next";

// Une seule page : le sitemap sert surtout à accélérer l'indexation du
// domaine (Search Console) et à déclarer sa fraîcheur.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://piscines-toulouse.fr/",
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: "https://piscines-toulouse.fr/confidentialite",
      changeFrequency: "monthly",
      priority: 0.2,
    },
  ];
}
