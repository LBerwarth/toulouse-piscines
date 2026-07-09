-- Cache partagé du rapport d'état (une seule ligne, id = 1).
-- À exécuter une fois dans l'éditeur SQL Supabase.
--
-- Sert à la fois de cache et de minuteur : la page lit cette ligne à chaque
-- visite et ne relance un rescan de secours (verrouillé) que si `fetched_at`
-- dépasse le seuil de fraîcheur (35 min en journée, 10 h la nuit — cf.
-- lib/status.ts). `report` contient le StatusReport complet.
--
-- `fetched_at` est l'horodatage de la dernière TENTATIVE de scraping (minuteur).
-- En fonctionnement normal il coïncide avec `report.updatedAt` (l'âge réel des
-- données, affiché « Mis à jour »). En cas d'échec total du rescan (source en
-- maintenance), on conserve le dernier bon `report` mais on avance `fetched_at`
-- pour différer la prochaine tentative : les deux dates divergent alors, et
-- l'âge croissant de `report.updatedAt` déclenche le bandeau « périmé ».
-- L'accès se fait avec la clé secrète (service role), qui contourne la RLS.

create table if not exists public.status_cache (
  id         integer     primary key default 1,
  report     jsonb       not null,
  fetched_at timestamptz not null default now(),
  constraint status_cache_singleton check (id = 1)
);
