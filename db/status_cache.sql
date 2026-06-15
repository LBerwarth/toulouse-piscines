-- Cache partagé du rapport d'état (une seule ligne, id = 1).
-- À exécuter une fois dans l'éditeur SQL Supabase.
--
-- Sert à la fois de cache et de minuteur : la page lit cette ligne à chaque
-- visite et ne rescrape les pages de la mairie que si `fetched_at` date de plus
-- de 30 minutes. `report` contient le StatusReport complet (cf. lib/status.ts) ;
-- `fetched_at` est l'horodatage réel du scraping, affiché comme « Mis à jour ».
-- L'accès se fait avec la clé secrète (service role), qui contourne la RLS.

create table if not exists public.status_cache (
  id         integer     primary key default 1,
  report     jsonb       not null,
  fetched_at timestamptz not null default now(),
  constraint status_cache_singleton check (id = 1)
);
