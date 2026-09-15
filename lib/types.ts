export type UserRole = "partner_manager" | "account_executive";
export type AccountType = "partner_distributor" | "end_user";
export type AccountStage = "prospect" | "onboarding" | "active" | "dormant";
export type IntegrationService = "avoma" | "slack" | "google" | "microsoft";
export type ContextSource = "avoma_call" | "email" | "slack_message";
export type SequenceType =
  | "initial_outreach"
  | "onboarding"
  | "nurture_checkin"
  | "reactivation"
  | "renewal_expansion";
export type SequenceStatus = "draft" | "approved" | "sent" | "archived";
export type SequenceEmailStatus = "draft" | "edited" | "approved";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

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
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  account_id: string;
  name: string;
  email: string | null;
  role: string | null;
  created_at: string;
}

export interface IntegrationStatus {
  id: string;
  user_id: string;
  service: IntegrationService;
  config: Record<string, unknown>;
  connected: boolean;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandGuidePublic {
  id: number;
  source_type: "outline_doc" | "manual_text";
  outline_doc_url: string | null;
  content: string;
  last_synced_at: string | null;
  updated_at: string;
  outline_connected: boolean;
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
  pulled_at: string;
}

export interface Sequence {
  id: string;
  account_id: string;
  owner_user_id: string;
  sequence_type: SequenceType;
  status: SequenceStatus;
  created_at: string;
  updated_at: string;
}

export interface SequenceEmail {
  id: string;
  sequence_id: string;
  position: number;
  send_offset_days: number;
  subject: string;
  body: string;
  status: SequenceEmailStatus;
  source_context_ids: string[];
  brand_guide_notes: string | null;
  created_at: string;
  updated_at: string;
}

export const SEQUENCE_TYPE_LABELS: Record<SequenceType, string> = {
  initial_outreach: "Initial outreach",
  onboarding: "Onboarding",
  nurture_checkin: "Ongoing nurture / check-in",
  reactivation: "Reactivation",
  renewal_expansion: "Renewal / expansion",
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  partner_distributor: "Partner / Distributor",
  end_user: "Customer",
};

// A curated shortlist covering current (Brazil) and planned (LATAM/APAC/EMEA)
// expansion - not exhaustive. The language field is free text under the hood
// (see the New account form), so any language can be typed in beyond this list;
// this just saves a keystroke for the common ones.
export const COMMON_OUTREACH_LANGUAGES = [
  "English",
  "Spanish",
  "Portuguese (Brazil)",
  "Portuguese (Portugal)",
  "French",
  "German",
  "Italian",
  "Dutch",
  "Polish",
  "Turkish",
  "Arabic",
  "Hindi",
  "Japanese",
  "Korean",
  "Mandarin Chinese",
  "Vietnamese",
  "Thai",
  "Indonesian",
  "Filipino (Tagalog)",
];
