import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireUser, HttpError } from "../_shared/auth.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { callClaude, extractJson } from "../_shared/llm.ts";
import { buildSequenceSystemPrompt, formatContextForPrompt } from "../_shared/prompt.ts";
import type { Account, ContextItem } from "../_shared/types.ts";

interface DraftEmail {
  subject: string;
  body: string;
  source_context_ids: string[];
  brand_guide_notes: string;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const user = await requireUser(req);
    const { sequence_email_id } = await req.json();
    if (!sequence_email_id) throw new HttpError(400, "sequence_email_id required");

    const admin = adminClient();

    const { data: email, error: emailError } = await admin
      .from("sequence_emails")
      .select("*, sequences!inner(id, account_id, sequence_type, owner_user_id)")
      .eq("id", sequence_email_id)
      .single();
    if (emailError || !email) throw new HttpError(404, "Sequence email not found");

    const sequence = (email as any).sequences;
    if (sequence.owner_user_id !== user.id) throw new HttpError(403, "Not your sequence");

    const [{ data: account }, { data: profile }, { data: brandGuide }, { data: voiceProfile }, { data: contextItems }] =
      await Promise.all([
        admin.from("accounts").select("*").eq("id", sequence.account_id).single<Account>(),
        admin.from("users").select("name, role").eq("id", user.id).single(),
        admin.from("brand_guide").select("content").eq("id", 1).single(),
        admin.from("voice_profiles").select("style_summary").eq("user_id", user.id).maybeSingle(),
        admin.from("context_items").select("*").eq("account_id", sequence.account_id).returns<ContextItem[]>(),
      ]);
    if (!account) throw new HttpError(404, "Account not found");

    const system = buildSequenceSystemPrompt({
      account,
      sequenceType: sequence.sequence_type,
      brandGuideContent: brandGuide?.content ?? "",
      voiceProfileSummary: voiceProfile?.style_summary ?? "",
      userName: profile?.name ?? "the sender",
      userRole: profile?.role ?? "account_executive",
      language: account.language,
    });

    const userPrompt = `Regenerate ONLY email #${email.position} of this sequence (send offset day ${
      email.send_offset_days
    }). Here is the current draft for reference (improve or vary it, don't just repeat it):
Subject: ${email.subject}
Body: ${email.body}

ACCOUNT: ${account.company_name}
Primary contact: ${account.primary_contact_name ?? "(unknown)"} <${account.primary_contact_email ?? "unknown"}>

CONTEXT ITEMS:
${formatContextForPrompt(contextItems ?? [])}

Return ONLY a JSON object of this exact shape, no prose before or after:
{
  "subject": "...",
  "body": "...",
  "source_context_ids": ["<ids from CONTEXT ITEMS that informed this email, or [] if none applied>"],
  "brand_guide_notes": "<one short sentence on brand-guide terminology/tone applied, or empty string>"
}`;

    const response = await callClaude({ system, user: userPrompt, maxTokens: 2000 });
    const parsed = extractJson<DraftEmail>(response);
    const validContextIds = new Set((contextItems ?? []).map((c) => c.id));
    const sourceIds = (parsed.source_context_ids ?? []).filter((id) => validContextIds.has(id));

    const { error: updateError } = await admin
      .from("sequence_emails")
      .update({
        subject: parsed.subject,
        body: parsed.body,
        source_context_ids: sourceIds,
        brand_guide_notes: parsed.brand_guide_notes ?? null,
        status: "draft",
      })
      .eq("id", sequence_email_id);
    if (updateError) throw new HttpError(500, updateError.message);

    return jsonResponse({
      subject: parsed.subject,
      body: parsed.body,
      source_context_ids: sourceIds,
      brand_guide_notes: parsed.brand_guide_notes,
    });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});
