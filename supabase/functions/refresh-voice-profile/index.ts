// Builds a distilled personal-voice style summary from the caller's own past
// Slack messages (their own posts only, in their configured channels). Stores
// only the distilled summary - never the raw message text.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireUser, HttpError } from "../_shared/auth.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { fetchOwnSlackMessages } from "../_shared/slack.ts";
import { callClaude } from "../_shared/llm.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const user = await requireUser(req);
    const admin = adminClient();

    const { data: slack, error } = await admin
      .from("integration_credentials")
      .select("secret_encrypted, config, connected")
      .eq("user_id", user.id)
      .eq("service", "slack")
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!slack?.connected || !slack.secret_encrypted) {
      throw new HttpError(400, "Connect Slack first, in Settings");
    }

    const channelIds = (slack.config?.channel_ids as string[]) ?? [];
    const slackUserId = slack.config?.slack_user_id as string | undefined;
    if (!channelIds.length || !slackUserId) {
      throw new HttpError(
        400,
        "Add your monitored channel(s) and your own Slack user ID in Settings first"
      );
    }

    const token = await decryptSecret(slack.secret_encrypted);
    const messages = await fetchOwnSlackMessages(token, channelIds, slackUserId);

    if (messages.length < 5) {
      throw new HttpError(400, `Only found ${messages.length} of your messages - need at least 5 to build a profile`);
    }

    const prompt = `Below are real Slack messages written by one person. Distill their natural writing voice into short bullet-point notes covering: typical sentence length/rhythm, structural habits (e.g. leads with the ask vs. context first, uses lists, short paragraphs), characteristic phrasing or transition words, and overall directness/warmth. Do NOT quote the messages verbatim and do NOT include any names, account details, or specifics from them - only abstract style notes that could apply to writing an email in this person's voice.

MESSAGES:
${messages.map((m, i) => `${i + 1}. ${m}`).join("\n")}

Return only the bullet-point style notes as plain text, no preamble.`;

    const summary = await callClaude({
      system: "You analyze writing style and produce abstract, reusable style notes. You never reproduce or quote source text.",
      user: prompt,
      maxTokens: 800,
    });

    const { error: upsertError } = await admin.from("voice_profiles").upsert(
      {
        user_id: user.id,
        style_summary: summary,
        sample_message_count: messages.length,
        built_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (upsertError) throw new HttpError(500, upsertError.message);

    return jsonResponse({ ok: true, sample_message_count: messages.length });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});
