-- Lets each account carry its own outreach language, so drafted sequences are
-- written natively in the recipient's language (LATAM/APAC/EMEA expansion)
-- rather than always in English. Free text rather than an enum, so it's not
-- capped to a fixed language list - the app UI offers a curated shortlist plus
-- a custom option, and generate-sequence/regenerate-email just pass whatever
-- is here straight into the drafting prompt.
alter table public.accounts
  add column language text not null default 'English';
