import type { Account, ContextItem, SequenceType } from "./types.ts";

const SEQUENCE_GUIDANCE: Record<SequenceType, { emailCount: string; spacing: string; goal: string }> = {
  initial_outreach: {
    emailCount: "3-4 emails",
    spacing: "tight spacing - roughly 3-4 days apart",
    goal: "introduce value and secure a first conversation",
  },
  onboarding: {
    emailCount: "4-5 emails",
    spacing: "roughly a week apart",
    goal: "guide a newly signed account through setup milestones toward first value",
  },
  nurture_checkin: {
    emailCount: "3 emails",
    spacing: "roughly 2 weeks apart",
    goal: "maintain the relationship, surface new value, and check on open items without being pushy",
  },
  reactivation: {
    emailCount: "3-4 emails",
    spacing: "wider spacing - roughly 10-14 days apart",
    goal: "re-engage a dormant account, acknowledge the gap tactfully, and re-establish relevance",
  },
  renewal_expansion: {
    emailCount: "3-4 emails",
    spacing: "wider spacing - roughly 2 weeks apart, front-loaded ahead of a renewal/expansion decision",
    goal: "make the case for renewal or expansion using concrete usage/outcome evidence",
  },
};

export function formatContextForPrompt(items: ContextItem[]): string {
  if (items.length === 0) return "(No context has been pulled for this account yet.)";
  return items
    .slice(0, 40)
    .map((item) => {
      const date = new Date(item.occurred_at).toISOString().slice(0, 10);
      const body = item.ai_summary || item.raw_text?.slice(0, 1200) || "";
      return `- [id:${item.id}] [${item.source} · ${date}] ${body}`;
    })
    .join("\n");
}

export function buildSequenceSystemPrompt(opts: {
  account: Account;
  sequenceType: SequenceType;
  brandGuideContent: string;
  voiceProfileSummary: string;
  userName: string;
  userRole: string;
}): string {
  const guidance = SEQUENCE_GUIDANCE[opts.sequenceType];
  const counterpart = opts.account.account_type === "partner_distributor" ? "channel partner" : "customer";

  return `You are drafting a multi-email outreach sequence on behalf of ${opts.userName}, a ${
    opts.userRole === "partner_manager" ? "Partner Development Manager" : "Account Executive"
  } at Hubstaff, writing to a ${counterpart}.

SEQUENCE TYPE: ${opts.sequenceType} - ${guidance.goal}
Produce ${guidance.emailCount}, with ${guidance.spacing}.

VOICE - two layers, applied together:
1. Personal voice (phrasing, rhythm, structure) - learned from ${opts.userName}'s own past Slack messages:
${opts.voiceProfileSummary || "(No personal voice profile built yet - default to clear, direct, warm professional phrasing.)"}

2. Brand voice (terminology, product/feature naming, things to avoid, stated tone rules) - this WINS over personal voice on naming and terminology whenever they conflict:
${opts.brandGuideContent || "(No brand guide content configured yet - use standard, neutral Hubstaff product terminology and avoid inventing feature names.)"}

FORMALITY RULES (apply on top of both voice layers - these always win):
- Dial the register up to formal/professional. No slang, no emoji, complete sentences.
- Greeting is always "Hello [First Name]," - never "Dear [First Name],".
- Never fabricate specifics (numbers, dates, commitments, names) that are not present in the context the user message provides. If context is thin for a claim you'd want to make, write around it generically rather than inventing detail, and note the gap.

The user message will provide the account details and source-tagged context items (each with an id in [id:...] you must reference when you use it).`;
}

export function buildSequenceUserPrompt(opts: {
  account: Account;
  contextItems: ContextItem[];
}): string {
  return `ACCOUNT: ${opts.account.company_name}
Primary contact: ${opts.account.primary_contact_name ?? "(unknown)"} <${opts.account.primary_contact_email ?? "unknown"}>
Stage: ${opts.account.stage}
Notes: ${opts.account.notes ?? "(none)"}

CONTEXT ITEMS:
${formatContextForPrompt(opts.contextItems)}

Return ONLY a JSON object of this exact shape, no prose before or after:
{
  "emails": [
    {
      "position": 1,
      "send_offset_days": 0,
      "subject": "...",
      "body": "...",
      "source_context_ids": ["<ids from the CONTEXT ITEMS list that informed this email, or [] if none applied>"],
      "brand_guide_notes": "<one short sentence on what brand-guide terminology/tone was applied to this email, or empty string if none>"
    }
  ]
}`;
}
