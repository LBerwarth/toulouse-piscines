-- Cache des lectures LLM des actus « En bref » (cf. lib/news-llm.ts).
-- À exécuter une fois dans l'éditeur SQL Supabase.
--
-- Une ligne par actu (hash sha256 de « titre\ntexte ») : la même actu n'est
-- interprétée qu'une seule fois par Gemini, quel que soit le nombre de scrapes.
-- `reading` contient le NewsReading validé (mesures par piscine). Purge libre :
-- une ligne supprimée sera simplement réinterprétée au prochain passage.
-- L'accès se fait avec la clé secrète (service role), qui contourne la RLS.

create table if not exists public.news_readings (
  hash       text        primary key,
  title      text        not null,
  reading    jsonb       not null,
  model      text        not null,
  created_at timestamptz not null default now()
);
