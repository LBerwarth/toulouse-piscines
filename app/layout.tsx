import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { THEME_COLOR, THEME_INIT_SCRIPT } from "@/lib/theme";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Piscines de Toulouse — ouvertes aujourd'hui ?",
  description:
    "Statut du jour des 12 piscines municipales de Toulouse : horaires, fermetures exceptionnelles et travaux, mis à jour automatiquement depuis le site de la métropole.",
  applicationName: "Piscines Toulouse",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Piscines Toulouse",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${outfit.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Photo d'eau de piscine en fond, adoucie pour la lisibilité */}
        <div
          aria-hidden
          className="fixed inset-0 -z-10 bg-[url('/eau.jpg')] bg-cover bg-center dark:brightness-[0.38]"
        />
        {/* Voile assombri mais non opaque, et bleu et non violet : l'eau doit
            rester perceptible et se lire comme de l'eau, comme en clair. */}
        <div
          aria-hidden
          className="fixed inset-0 -z-10 bg-gradient-to-b from-[#e4f0fc]/86 via-[#cfe2f7]/93 to-[#bcd6f0]/98 dark:from-[#04141f]/66 dark:via-[#07182b]/72 dark:to-[#0d1430]/80"
        />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
