import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireUser, HttpError } from "../_shared/auth.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { callClaude, extractJson } from "../_shared/llm.ts";
import { buildSequenceSystemPrompt, buildSequenceUserPrompt } from "../_shared/prompt.ts";
import type { Account, ContextItem, SequenceType } from "../_shared/types.ts";

interface DraftEmail {
  position: number;
  send_offset_days: number;
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
    const { account_id, sequence_type } = (await req.json()) as {
      account_id: string;
      sequence_type: SequenceType;
    };
    if (!account_id || !sequence_type) throw new HttpError(400, "account_id and sequence_type required");

    const admin = adminClient();

    const [{ data: account }, { data: profile }, { data: brandGuide }, { data: voiceProfile }, { data: contextItems }] =
      await Promise.all([
        admin.from("accounts").select("*").eq("id", account_id).eq("owner_user_id", user.id).single<Account>(),
        admin.from("users").select("name, role").eq("id", user.id).single(),
        admin.from("brand_guide").select("content").eq("id", 1).single(),
        admin.from("voice_profiles").select("style_summary").eq("user_id", user.id).maybeSingle(),
        admin
          .from("context_items")
          .select("*")
          .eq("account_id", account_id)
          .order("occurred_at", { ascending: false })
          .returns<ContextItem[]>(),
      ]);

    if (!account) throw new HttpError(404, "Account not found");

    const system = buildSequenceSystemPrompt({
      account,
      sequenceType: sequence_type,
      brandGuideContent: brandGuide?.content ?? "",
      voiceProfileSummary: voiceProfile?.style_summary ?? "",
      userName: profile?.name ?? "the sender",
      userRole: profile?.role ?? "account_executive",
    });
    const userPrompt = buildSequenceUserPrompt({ account, contextItems: contextItems ?? [] });

    const response = await callClaude({ system, user: userPrompt, maxTokens: 6000 });
    const parsed = extractJson<{ emails: DraftEmail[] }>(response);

    const validContextIds = new Set((contextItems ?? []).map((c) => c.id));

    const { data: sequence, error: seqError } = await admin
      .from("sequences")
      .insert({ account_id, owner_user_id: user.id, sequence_type, status: "draft" })
      .select("id")
      .single();
    if (seqError || !sequence) throw new HttpError(500, seqError?.message ?? "Failed to create sequence");

    // Normalize positions to a guaranteed 1..N sequential run (no gaps/dupes)
    // regardless of what the model returned, so the insert can't violate the
    // sequence_emails position constraints.
    const orderedEmails = [...parsed.emails].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.send_offset_days ?? 0) - (b.send_offset_days ?? 0)
    );

    const emailRows = orderedEmails.map((e, idx) => ({
      sequence_id: sequence.id,
      position: idx + 1,
      send_offset_days: e.send_offset_days ?? idx * 7,
      subject: e.subject ?? "",
      body: e.body ?? "",
      status: "draft" as const,
      source_context_ids: (e.source_context_ids ?? []).filter((id) => validContextIds.has(id)),
      brand_guide_notes: e.brand_guide_notes ?? null,
    }));

    const { error: emailsError } = await admin.from("sequence_emails").insert(emailRows);
    if (emailsError) throw new HttpError(500, emailsError.message);

    return jsonResponse({ sequence_id: sequence.id });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});
