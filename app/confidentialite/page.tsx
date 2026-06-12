import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Confidentialité — Piscines de Toulouse",
  description:
    "Politique de confidentialité de l'application Piscines de Toulouse : aucune donnée personnelle collectée.",
};

const UPDATED = "12 juin 2026";
const CONTACT_EMAIL = "lena.berw@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold text-violet-800">{title}</h2>
      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export default function Confidentialite() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 sm:py-8">
      <header className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-fuchsia-600 to-violet-800 px-5 py-6 text-white shadow-lg shadow-pink-200/60 sm:px-7 sm:py-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Politique de confidentialité
        </h1>
        <p className="mt-1.5 text-sm font-light text-pink-50">
          Application « Piscines de Toulouse »
        </p>
        <p className="mt-3 text-xs text-pink-100/80">Dernière mise à jour : {UPDATED}</p>
      </header>

      <div className="rounded-3xl bg-white p-5 shadow-lg shadow-pink-100/60 sm:p-7">
        <p className="text-sm leading-relaxed text-slate-700">
          « Piscines de Toulouse » est une application personnelle et bénévole, non affiliée à
          la mairie de Toulouse ni à Toulouse Métropole. Elle affiche les horaires d&apos;ouverture
          des piscines municipales tels que publiés sur le site de la métropole. Cette page
          explique quelles données l&apos;application traite — en résumé&nbsp;: aucune donnée
          personnelle.
        </p>

        <Section title="Données personnelles collectées">
          <p>
            <strong>Aucune.</strong> L&apos;application ne demande pas de compte, ne nécessite
            aucune inscription et ne collecte aucune donnée personnelle vous concernant. Elle
            n&apos;accède pas à votre position, à vos contacts, à votre caméra, à vos photos ni à
            aucune autre information de votre appareil.
          </p>
        </Section>

        <Section title="Suivi, publicité et cookies">
          <p>
            L&apos;application ne contient <strong>aucune publicité</strong>, aucun outil de
            suivi ni de mesure d&apos;audience, et ne dépose <strong>aucun cookie</strong> à des
            fins de suivi.
          </p>
        </Section>

        <Section title="Notifications (facultatif)">
          <p>
            Si — et seulement si — vous activez les alertes de fermeture, votre navigateur crée
            un identifiant d&apos;abonnement push (une URL technique fournie par le service de
            notification de votre navigateur, sans votre nom ni votre e-mail). Nous le
            conservons, avec la liste des piscines que vous choisissez de suivre, à la seule fin
            de vous envoyer ces notifications.
          </p>
          <p>
            Vous pouvez tout désactiver à tout moment depuis le bouton « M&apos;alerter des
            fermetures » ou les réglages de votre navigateur&nbsp;: l&apos;abonnement est alors
            immédiatement supprimé. Ces données ne sont ni vendues ni partagées.
          </p>
        </Section>

        <Section title="Données techniques d'hébergement">
          <p>
            Le site est hébergé par Vercel. Comme tout serveur web, l&apos;infrastructure
            d&apos;hébergement peut journaliser des données techniques standard (par exemple
            l&apos;adresse IP et le type de navigateur) à seule fin de fournir la page et
            d&apos;assurer la sécurité du service. Ces journaux ne sont pas utilisés pour vous
            identifier ni exploités par l&apos;auteur de l&apos;application.
          </p>
        </Section>

        <Section title="Origine des informations affichées">
          <p>
            Les horaires et fermetures proviennent des pages publiques des piscines du site de
            Toulouse Métropole, relues automatiquement. L&apos;application n&apos;est qu&apos;une
            mise en forme de ces informations publiques&nbsp;; vérifiez toujours les informations
            critiques sur la page officielle de chaque piscine.
          </p>
        </Section>

        <Section title="Partage de données">
          <p>
            Aucune donnée personnelle n&apos;étant collectée, aucune donnée n&apos;est vendue,
            partagée ni transmise à des tiers.
          </p>
        </Section>

        <Section title="Vos droits">
          <p>
            L&apos;application ne traitant aucune donnée personnelle, il n&apos;y a aucune donnée
            à consulter, corriger ou supprimer. Pour toute question relative à cette politique,
            vous pouvez écrire à l&apos;adresse ci-dessous.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-fuchsia-700 underline underline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>

        <Section title="Modifications">
          <p>
            Cette politique pourra être mise à jour. La date de dernière mise à jour figure en
            haut de la page.
          </p>
        </Section>
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/"
          className="text-sm font-medium text-violet-700 underline underline-offset-2 hover:text-fuchsia-700"
        >
          ← Retour à l&apos;application
        </Link>
      </div>
    </main>
  );
}
