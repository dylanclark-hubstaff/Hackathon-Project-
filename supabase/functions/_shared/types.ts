// Mirrors lib/types.ts on the frontend. Kept as a separate copy because
// Supabase deploys each function (and this _shared dir) in isolation - it
// cannot reach outside supabase/functions/.

export type AccountType = "partner_distributor" | "end_user";
export type AccountStage = "prospect" | "onboarding" | "active" | "dormant";
export type SequenceType =
  | "initial_outreach"
  | "onboarding"
  | "nurture_checkin"
  | "reactivation"
  | "renewal_expansion";
export type ContextSource = "avoma_call" | "email" | "slack_message";

export interface Account {
  id: string;
  owner_user_id: string;
  company_name: string;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  account_type: AccountType;
  region: string | null;
  stage: AccountStage;
  notes: string | null;
  language: string;
}

export interface ContextItem {
  id: string;
  account_id: string;
  owner_user_id: string;
  source: ContextSource;
  source_ref: string | null;
  source_url: string | null;
  occurred_at: string;
  raw_text: string | null;
  ai_summary: string | null;
}
