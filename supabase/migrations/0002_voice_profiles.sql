-- Personal voice profile: a distilled style summary (not raw message text) built
-- from the logged-in user's own past Slack messages. Rebuilt on demand from
-- Settings ("Refresh my voice profile").

create table public.voice_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  -- Distilled phrasing/rhythm/structure notes, produced by the LLM from a sample
  -- of the user's own Slack messages. Never stores the raw messages themselves.
  style_summary text not null default '',
  sample_message_count integer not null default 0,
  built_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.voice_profiles enable row level security;

create policy "owner can manage own voice profile"
  on public.voice_profiles for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger voice_profiles_set_updated_at before update on public.voice_profiles
  for each row execute procedure public.set_updated_at();
