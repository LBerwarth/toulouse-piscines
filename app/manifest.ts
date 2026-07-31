import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Piscines de Toulouse",
    short_name: "Piscines TLS",
    description:
      "Quelles piscines municipales de Toulouse sont ouvertes aujourd'hui, et à quels horaires.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fdf8fc",
    theme_color: "#6d28d9",
    lang: "fr",
    dir: "ltr",
    categories: ["sports", "health", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Piscines ouvertes maintenant",
        short_name: "Maintenant",
        url: "/?ouvert=maintenant",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Mes piscines favorites",
        short_name: "Favoris ★",
        url: "/?favoris=1",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Piscines en plein air",
        short_name: "Plein air",
        url: "/?type=pleinair",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Bassins de 50 m",
        short_name: "50 m",
        url: "/?longueur=50",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
