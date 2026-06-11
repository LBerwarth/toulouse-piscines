# 🏊 Piscines de Toulouse

Quelles piscines municipales de Toulouse sont ouvertes **aujourd'hui**, et à quels horaires — y compris les fermetures exceptionnelles (problème technique, travaux…) publiées en cours de journée par la mairie.

Application web mobile-first (installable comme PWA), construite avec Next.js. **Aucune clé API, aucun coût** : tout repose sur le scraping des pages officielles et un parseur déterministe.

## Comment ça marche

Il n'existe **aucune API officielle** pour les horaires et fermetures : le jeu de données open data « Piscines » de Toulouse Métropole ne contient que des informations statiques (adresse, accessibilité). La source de vérité est la page de chaque piscine sur `metropole.toulouse.fr/annuaire/piscine-*`.

Le pipeline, exécuté côté serveur et mis en cache 30 minutes (ISR) :

1. **Scraping** (`lib/scrape.ts`) — les 12 pages sont récupérées et les sections utiles extraites du HTML Drupal (chapeau, accordéons « Horaires » avec leur structure titres/lignes, encarts d'alerte) avec cheerio.
2. **Analyse déterministe** (`lib/parse-schedule.ts`) — un parseur en français pur (regex, sans LLM) lit les périodes (« du 5 juin au 5 juillet », « à compter du… », « période scolaire »), les jours (« du lundi au vendredi », « le dimanche ») et les créneaux (« de 9h30 à 20h30 », « 12h - 19h »), choisit la période qui contient la date du jour et en déduit : ouverte/fermée, créneaux, alertes. Les fermetures exceptionnelles repérées dans le chapeau ou les encarts priment sur les horaires.
3. **Vacances scolaires** (`lib/today.ts`) — l'arbitrage « période scolaire / vacances » utilise le calendrier officiel zone C via l'open data du ministère de l'Éducation nationale (gratuit, mis en cache 24 h). Si l'API est injoignable, repli en période scolaire avec mention « information incertaine ».
4. **Affichage** (`app/page.tsx`) — frise du jour (une barre par piscine sur l'axe des heures, ligne « maintenant ») + liste triée : ouvertes maintenant, puis ouvre plus tard, puis fermées. Le badge « ouverte » est calculé dans le navigateur, donc juste même si la page en cache a 30 minutes. Les horaires bruts restent consultables sous chaque carte (« Voir les horaires publiés »).

## Démarrer en local

```bash
npm install
npm run dev
```

Ouvrir http://localhost:3001.

## Tests

Le parseur est couvert par des tests unitaires reprenant les formulations réelles des pages de la mairie :

```bash
npm test
```

Si la mairie change de formulation et qu'une piscine s'affiche mal, ajouter le nouveau cas dans `lib/parse-schedule.test.ts` puis adapter le parseur.

## Déployer sur Vercel

1. Pousser ce dépôt sur GitHub.
2. Importer le projet sur [vercel.com](https://vercel.com) — aucune variable d'environnement à configurer.
3. Déployer. Le plan Hobby suffit : pas de cron, la page se régénère à la demande (ISR, 30 min).

## Limites connues

- Le parseur est déterministe : si la mairie publie une formulation inédite, la piscine concernée passe en « information incertaine » ou « horaires non reconnus » — les horaires bruts restent visibles. Corriger via un test + une règle.
- Si la mairie publie une fermeture sans mettre à jour la page de la piscine (ex. seulement sur les réseaux sociaux), l'app ne peut pas la voir.
- Fraîcheur maximale : 30 minutes (réglable via `revalidate` dans `app/page.tsx`).
