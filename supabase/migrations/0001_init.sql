-- Partner Sequencer: core schema
-- Run via `supabase db push`, or paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- users (profile row, one per auth.users, created on signup via trigger)
-- ---------------------------------------------------------------------------
create type user_role as enum ('partner_manager', 'account_executive');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role user_role not null default 'account_executive',
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "users can view own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "users can update own profile"
  on public.users for update
  using (auth.uid() = id);

-- Auto-create a users row when someone signs up. name/role come from
-- auth signup metadata (see app/signup page), defaulting sensibly if absent.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'account_executive')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create type account_type as enum ('partner_distributor', 'end_user');
create type account_stage as enum ('prospect', 'onboarding', 'active', 'dormant');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  company_name text not null,
  primary_contact_name text,
  primary_contact_email text,
  account_type account_type not null default 'end_user',
  region text,
  stage account_stage not null default 'prospect',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index accounts_owner_idx on public.accounts (owner_user_id);

alter table public.accounts enable row level security;

create policy "owner full access to own accounts"
  on public.accounts for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  email text,
  role text,
  created_at timestamptz not null default now()
);

create index contacts_account_idx on public.contacts (account_id);

alter table public.contacts enable row level security;

create policy "owner access to contacts via account"
  on public.contacts for all
  using (
    exists (select 1 from public.accounts a where a.id = contacts.account_id and a.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.accounts a where a.id = contacts.account_id and a.owner_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- integration_credentials
-- Per-user, per-service secrets. The client can only ever write (insert/update/
-- delete) its own row's non-secret fields via the masked view/RPC below - raw
-- secret material is only ever read by Edge Functions using the service role
-- key, which bypasses RLS entirely. We still lock RLS down to owner-only as a
-- second layer, and revoke SELECT on the secret column from the anon/authenticated
-- roles so even an owner's own client can't read the raw secret back.
-- ---------------------------------------------------------------------------
create type integration_service as enum ('avoma', 'slack', 'google', 'microsoft');

create table public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  service integration_service not null,
  -- Encrypted at rest by the Edge Function (AES-GCM) before insert; never plaintext.
  secret_encrypted text,
  -- Non-secret config, e.g. { "channel_ids": ["C123"], "channel_names": ["#partner-deals"] } for slack
  config jsonb not null default '{}'::jsonb,
  -- OAuth refresh token storage (google/microsoft), encrypted the same way as secret_encrypted
  refresh_token_encrypted text,
  connected boolean not null default false,
  last_connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, service)
);

alter table public.integration_credentials enable row level security;

-- Owner can see row metadata (connected, config, timestamps) but application code
-- should select specific columns and never surface secret_encrypted / refresh_token_encrypted
-- to the browser. Edge Functions use the service role key, which bypasses RLS.
create policy "owner can manage own integration rows"
  on public.integration_credentials for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Belt-and-suspenders: strip read access to the secret columns from normal roles.
-- Client code must use the `integration_status` view below instead of selecting *.
revoke select (secret_encrypted, refresh_token_encrypted) on public.integration_credentials from authenticated, anon;

create view public.integration_status as
select
  id,
  user_id,
  service,
  config,
  connected,
  last_connected_at,
  created_at,
  updated_at
from public.integration_credentials;

alter view public.integration_status set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- brand_guide (org-wide singleton)
-- ---------------------------------------------------------------------------
create type brand_guide_source as enum ('outline_doc', 'manual_text');

create table public.brand_guide (
  id integer primary key default 1,
  source_type brand_guide_source not null default 'manual_text',
  outline_doc_url text,
  -- Outline API key is stored encrypted, same scheme as integration_credentials.
  outline_api_key_encrypted text,
  content text not null default '',
  last_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint brand_guide_singleton check (id = 1)
);

insert into public.brand_guide (id, source_type, content) values (1, 'manual_text', '')
  on conflict (id) do nothing;

alter table public.brand_guide enable row level security;

-- Org-wide: any authenticated user can read; any authenticated user can update
-- (per spec: "editable by any user for now"). Revoke read on the outline key itself.
create policy "any authenticated user can read brand guide"
  on public.brand_guide for select
  to authenticated
  using (true);

create policy "any authenticated user can update brand guide"
  on public.brand_guide for update
  to authenticated
  using (true)
  with check (true);

revoke select (outline_api_key_encrypted) on public.brand_guide from authenticated, anon;

create view public.brand_guide_public as
select id, source_type, outline_doc_url, content, last_synced_at, updated_at,
       (outline_api_key_encrypted is not null) as outline_connected
from public.brand_guide;

alter view public.brand_guide_public set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- context_items
-- ---------------------------------------------------------------------------
create type context_source as enum ('avoma_call', 'email', 'slack_message');

create table public.context_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  source context_source not null,
  source_ref text, -- e.g. avoma recording id, gmail message id, slack ts
  source_url text, -- link back to the original (recording, email, permalink)
  occurred_at timestamptz not null,
  raw_text text,
  ai_summary text,
  pulled_at timestamptz not null default now()
);

create index context_items_account_idx on public.context_items (account_id, occurred_at desc);

alter table public.context_items enable row level security;

create policy "owner full access to own context items"
  on public.context_items for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- sequences + sequence_emails
-- ---------------------------------------------------------------------------
create type sequence_type as enum ('initial_outreach', 'onboarding', 'nurture_checkin', 'reactivation', 'renewal_expansion');
create type sequence_status as enum ('draft', 'approved', 'sent', 'archived');
create type sequence_email_status as enum ('draft', 'edited', 'approved');

create table public.sequences (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  sequence_type sequence_type not null,
  status sequence_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sequences_account_idx on public.sequences (account_id);

alter table public.sequences enable row level security;

create policy "owner full access to own sequences"
  on public.sequences for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create table public.sequence_emails (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  position integer not null check (position between 1 and 5),
  send_offset_days integer not null default 0,
  subject text not null default '',
  body text not null default '',
  status sequence_email_status not null default 'draft',
  source_context_ids uuid[] not null default '{}',
  brand_guide_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_id, position)
);

create index sequence_emails_sequence_idx on public.sequence_emails (sequence_id, position);

alter table public.sequence_emails enable row level security;

create policy "owner access to sequence emails via sequence"
  on public.sequence_emails for all
  using (
    exists (select 1 from public.sequences s where s.id = sequence_emails.sequence_id and s.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.sequences s where s.id = sequence_emails.sequence_id and s.owner_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- updated_at helper trigger
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger accounts_set_updated_at before update on public.accounts
  for each row execute procedure public.set_updated_at();
create trigger integration_credentials_set_updated_at before update on public.integration_credentials
  for each row execute procedure public.set_updated_at();
create trigger brand_guide_set_updated_at before update on public.brand_guide
  for each row execute procedure public.set_updated_at();
create trigger sequences_set_updated_at before update on public.sequences
  for each row execute procedure public.set_updated_at();
create trigger sequence_emails_set_updated_at before update on public.sequence_emails
  for each row execute procedure public.set_updated_at();
