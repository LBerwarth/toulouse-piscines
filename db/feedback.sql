-- Signalements et avis envoyés depuis l'application (formulaire « Signaler une
-- erreur »). À exécuter une fois dans l'éditeur SQL Supabase.
--
-- Écrits uniquement par /api/feedback avec la clé secrète (service role), qui
-- contourne la RLS : aucune permission n'est accordée au rôle anonyme, donc
-- personne ne peut insérer ni relire ces lignes depuis le navigateur.
--
-- `email` est facultatif et ne sert qu'à répondre à l'auteur du signalement.

create table if not exists public.feedback (
  id         uuid        primary key default gen_random_uuid(),
  kind       text        not null,
  pool_slug  text,
  message    text        not null,
  email      text,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_created_at on public.feedback (created_at desc);

alter table public.feedback enable row level security;
