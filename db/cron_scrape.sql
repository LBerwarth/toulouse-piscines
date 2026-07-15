-- Planification du scraping côté Supabase (pg_cron + pg_net).
-- À exécuter une fois dans l'éditeur SQL Supabase, après avoir remplacé
-- <CRON_SECRET> par la valeur de la variable d'environnement CRON_SECRET.
--
-- Remplace la planification GitHub Actions : ses déclencheurs `schedule` sont
-- « best effort » et ~85 % des ticks quart d'heure étaient silencieusement
-- ignorés (6 à 12 passages/jour observés au lieu de 61), d'où des notifications
-- en retard de 1 à 3 h. pg_cron tourne dans le Postgres du projet : cadence tenue.
--
-- Heures en UTC (pg_cron ignore les fuseaux) : 5-16 UTC ≈ 7 h – 19 h à Toulouse
-- l'été (1 h plus tôt l'hiver) — mêmes créneaux que l'ancien workflow.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secret partagé avec l'endpoint, chiffré dans Vault — jamais en clair dans
-- cron.job. Rotation : update vault.secrets via vault.update_secret(...).
select vault.create_secret('<CRON_SECRET>', 'cron_secret');

-- Appel de l'endpoint, réutilisé par les deux planifications. Test manuel :
-- select public.trigger_check_closures();
create or replace function public.trigger_check_closures()
returns bigint
language sql
as $fn$
  select net.http_get(
    url := 'https://toulouse-piscines.vercel.app/api/cron/check-closures',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    -- L'endpoint scrape 12 pages (maxDuration 60 s) : marge alignée.
    timeout_milliseconds := 60000
  );
$fn$;

-- Tous les quarts d'heure en journée…
select cron.schedule('check-closures', '7,22,37,52 5-16 * * *', $$select public.trigger_check_closures()$$);
-- …et un dernier passage (~19 h 07 à Toulouse l'été).
select cron.schedule('check-closures-last', '7 17 * * *', $$select public.trigger_check_closures()$$);

-- Contrôle : select jobname, schedule, active from cron.job;
--            select status, created from net._http_response order by created desc limit 5;
--            select * from cron.job_run_details order by start_time desc limit 10;
-- Rollback : select cron.unschedule('check-closures');
--            select cron.unschedule('check-closures-last');
