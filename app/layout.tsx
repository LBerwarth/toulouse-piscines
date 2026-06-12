import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

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
  themeColor: "#6D28D9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Photo d'eau de piscine en fond, adoucie pour la lisibilité */}
        <div
          aria-hidden
          className="fixed inset-0 -z-10 bg-[url('/eau.jpg')] bg-cover bg-center"
        />
        <div
          aria-hidden
          className="fixed inset-0 -z-10 bg-gradient-to-b from-[#e4f0fc]/86 via-[#cfe2f7]/93 to-[#bcd6f0]/98"
        />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
