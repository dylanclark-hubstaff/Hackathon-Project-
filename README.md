# Partner Sequencer

Pulls account context from Avoma, Gmail/Outlook, and Slack, checks it against Hubstaff's brand voice guide, and drafts multi-email outreach sequences in your own (formalized, on-brand) voice.

This build covers the **core loop**: auth, accounts, per-user integration settings, context pull, sequence generation, and the review/approve screen. Nice-to-haves from the spec (context feed search/filter, "regenerate with different tone", team rollup view) and phase-2 send-via-mailbox are intentionally not built yet.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase: Postgres + Auth + Row-Level Security + Edge Functions (all third-party API calls happen server-side in Edge Functions, never from the browser)
- Anthropic Claude for sequence drafting and voice-profile summarization

## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. Run the migrations (SQL editor, in order, or via CLI):
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_voice_profiles.sql`
3. In **Project Settings > API**, copy the Project URL, `anon` public key, and `service_role` key.

## 2. Set Edge Function secrets

Edge Functions read these from their own secret store (Project Settings > Edge Functions > Secrets, or `supabase secrets set`), **not** from `.env` — they never inherit the Next.js app's env vars.

```bash
supabase secrets set \
  SUPABASE_URL=https://<project-ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... \
  SUPABASE_ANON_KEY=... \
  ANTHROPIC_API_KEY=... \
  CREDENTIALS_ENCRYPTION_KEY=$(openssl rand -base64 32) \
  GOOGLE_OAUTH_CLIENT_ID=... \
  GOOGLE_OAUTH_CLIENT_SECRET=... \
  GOOGLE_OAUTH_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/oauth-google/callback \
  MICROSOFT_OAUTH_CLIENT_ID=... \
  MICROSOFT_OAUTH_CLIENT_SECRET=... \
  MICROSOFT_OAUTH_TENANT_ID=common \
  MICROSOFT_OAUTH_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/oauth-microsoft/callback \
  APP_URL=https://<your-vercel-domain>
```

Then deploy the functions:

```bash
supabase functions deploy
```

## 3. Set up the OAuth apps (for Gmail / Outlook connect)

- **Google**: Google Cloud Console → OAuth consent screen (internal or external + your users added as test users) → Credentials → OAuth client ID (Web application). Authorized redirect URI = the `GOOGLE_OAUTH_REDIRECT_URI` above. Scope needed: `gmail.readonly`.
- **Microsoft**: Azure AD → App registrations → new registration → Redirect URI (Web) = the `MICROSOFT_OAUTH_REDIRECT_URI` above → Certificates & secrets → new client secret → API permissions → add delegated `Mail.Read` and `offline_access`.

## 4. Set up Slack, Avoma, Outline (per the spec's prerequisites)

- **Slack app**: create at api.slack.com/apps, add bot scopes `channels:history`, `channels:read`, `users:read`, install to your workspace, invite the bot into the channel(s) you want monitored, copy the Bot User OAuth Token (`xoxb-...`). Each user pastes their own token + channel IDs + their own Slack user ID in Settings.
- **Avoma**: grab an API key from Avoma → Settings → API.
- **Outline**: grab an API key from Outline → Settings → API, and the URL of the brand voice guide document (or just paste its text manually instead — no Outline account needed for that path).

## 5. Configure and deploy the Next.js app on Vercel

Import this repo in Vercel, then set these **Environment Variables** on the Vercel project:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

That's all the Next.js app itself needs — it never talks to Avoma/Slack/Google/Microsoft/Outline/Anthropic directly; it only calls Supabase Edge Functions, which hold their own secrets from step 2.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## Multi-language outreach

Each account has an `language` field (`accounts.language`, default `"English"`). The New Account form offers a shortlist covering current (Brazil) and planned LATAM/APAC/EMEA expansion, plus a free-text "Other" option — so it's not capped to a fixed list. `generate-sequence` and `regenerate-email` pass this straight into the drafting prompt, which writes the whole email natively in that language (adapting the formal greeting convention rather than translating "Hello" literally) while keeping Hubstaff product/feature names untranslated. Internal-facing text (context summaries, the "why this email" panel) stays in English regardless, since that's for the Hubstaff user reviewing the draft, not the recipient.

## Notes on the data model vs. the spec

- `contacts` (a second contact per account beyond the primary one) exists in the schema for future use but has no UI yet — the core loop uses `accounts.primary_contact_name/email` for context search and drafting.
- Personal voice is built from the user's own Slack messages only (never other people's), distilled into an abstract style summary (`voice_profiles.style_summary`) rather than stored as raw quotes — this keeps the profile lightweight and avoids ever reproducing someone's literal past messages in a new draft.
- Brand guide is a singleton row editable by any authenticated user, per the spec ("editable by any user for now").
