// Pulls fresh context for one account from the caller's own connected
// integrations (Avoma, Slack, Gmail/Outlook) and stores new items as
// context_items, deduped on (account_id, source, source_ref).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireUser, HttpError } from "../_shared/auth.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { findAvomaCallsForAccount } from "../_shared/avoma.ts";
import { findSlackMessagesForAccount } from "../_shared/slack.ts";
import { refreshGoogleAccessToken, findGmailMessagesForAccount, gmailMessageUrl } from "../_shared/gmail.ts";
import { refreshMicrosoftAccessToken, findOutlookMessagesForAccount } from "../_shared/outlook.ts";
import { callClaude, extractJson } from "../_shared/llm.ts";
import type { Account } from "../_shared/types.ts";

interface NewItem {
  source: "avoma_call" | "email" | "slack_message";
  source_ref: string;
  source_url: string | null;
  occurred_at: string;
  raw_text: string;
  ai_summary: string | null;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const user = await requireUser(req);
    const { account_id } = await req.json();
    if (!account_id) throw new HttpError(400, "account_id required");

    const admin = adminClient();

    const { data: account, error: accountError } = await admin
      .from("accounts")
      .select("*")
      .eq("id", account_id)
      .eq("owner_user_id", user.id)
      .single<Account>();
    if (accountError || !account) throw new HttpError(404, "Account not found");

    const { data: creds } = await admin
      .from("integration_credentials")
      .select("service, secret_encrypted, refresh_token_encrypted, config, connected")
      .eq("user_id", user.id);

    const byService = new Map((creds ?? []).map((c) => [c.service, c]));
    const { data: existing } = await admin
      .from("context_items")
      .select("source, source_ref")
      .eq("account_id", account_id);
    const existingKeys = new Set((existing ?? []).map((e) => `${e.source}:${e.source_ref}`));

    const newItems: NewItem[] = [];
    const counts = { avoma: 0, email: 0, slack: 0 };

    // --- Avoma ---
    const avoma = byService.get("avoma");
    if (avoma?.connected && avoma.secret_encrypted) {
      const apiKey = await decryptSecret(avoma.secret_encrypted);
      const calls = await findAvomaCallsForAccount(apiKey, {
        contactEmail: account.primary_contact_email ?? undefined,
        companyName: account.company_name,
      });
      for (const { call, detail } of calls) {
        const key = `avoma_call:${call.uuid}`;
        if (existingKeys.has(key)) continue;
        newItems.push({
          source: "avoma_call",
          source_ref: call.uuid,
          source_url: call.url ?? null,
          occurred_at: call.start_at,
          raw_text: detail.notes ?? call.subject ?? "",
          ai_summary: detail.notes ?? null, // Avoma's own AI notes double as our summary
        });
        counts.avoma++;
      }
    }

    // --- Slack ---
    const slack = byService.get("slack");
    if (slack?.connected && slack.secret_encrypted) {
      const token = await decryptSecret(slack.secret_encrypted);
      const channelIds = (slack.config?.channel_ids as string[]) ?? [];
      const needle = account.primary_contact_email || account.primary_contact_name || account.company_name;
      if (channelIds.length && needle) {
        const messages = await findSlackMessagesForAccount(token, channelIds, needle);
        for (const msg of messages) {
          const key = `slack_message:${msg.channel}:${msg.ts}`;
          if (existingKeys.has(key)) continue;
          newItems.push({
            source: "slack_message",
            source_ref: `${msg.channel}:${msg.ts}`,
            source_url: msg.permalink ?? null,
            occurred_at: new Date(Number(msg.ts) * 1000).toISOString(),
            raw_text: msg.text,
            ai_summary: null,
          });
          counts.slack++;
        }
      }
    }

    // --- Gmail / Outlook ---
    const contactEmail = account.primary_contact_email;
    if (contactEmail) {
      const google = byService.get("google");
      if (google?.connected && google.refresh_token_encrypted) {
        const accessToken = await refreshGoogleAccessToken(await decryptSecret(google.refresh_token_encrypted));
        const messages = await findGmailMessagesForAccount(accessToken, contactEmail);
        for (const m of messages) {
          const key = `email:gmail:${m.id}`;
          if (existingKeys.has(key)) continue;
          newItems.push({
            source: "email",
            source_ref: `gmail:${m.id}`,
            source_url: gmailMessageUrl(m.id),
            occurred_at: m.occurredAt,
            raw_text: `Subject: ${m.subject}\n\n${m.body}`,
            ai_summary: null,
          });
          counts.email++;
        }
      }

      const microsoft = byService.get("microsoft");
      if (microsoft?.connected && microsoft.refresh_token_encrypted) {
        const accessToken = await refreshMicrosoftAccessToken(
          await decryptSecret(microsoft.refresh_token_encrypted)
        );
        const messages = await findOutlookMessagesForAccount(accessToken, contactEmail);
        for (const m of messages) {
          const key = `email:outlook:${m.id}`;
          if (existingKeys.has(key)) continue;
          newItems.push({
            source: "email",
            source_ref: `outlook:${m.id}`,
            source_url: m.webLink,
            occurred_at: m.occurredAt,
            raw_text: `Subject: ${m.subject}\n\n${m.body}`,
            ai_summary: null,
          });
          counts.email++;
        }
      }
    }

    // Summarize email/Slack items that don't already have one (Avoma notes are
    // used as-is above) in a single batched call to keep this cheap.
    const toSummarize = newItems.filter((i) => !i.ai_summary && i.raw_text.trim());
    if (toSummarize.length > 0) {
      const prompt = `Summarize each of the following account-related messages in ONE short, factual sentence each (no speculation, no fabricated detail). Return ONLY a JSON array of strings, same order, same length as the input.\n\n${toSummarize
        .map((i, idx) => `${idx + 1}. [${i.source}] ${i.raw_text.slice(0, 1500)}`)
        .join("\n\n")}`;
      try {
        const response = await callClaude({
          system: "You write terse, factual one-sentence summaries. Never invent details not present in the text.",
          user: prompt,
          maxTokens: 1500,
        });
        const summaries = extractJson<string[]>(response);
        summaries.forEach((s, idx) => {
          if (toSummarize[idx]) toSummarize[idx].ai_summary = s;
        });
      } catch {
        // Non-fatal - items are still stored with raw_text, UI falls back to it.
      }
    }

    if (newItems.length > 0) {
      const { error: insertError } = await admin.from("context_items").insert(
        newItems.map((i) => ({
          account_id,
          owner_user_id: user.id,
          source: i.source,
          source_ref: i.source_ref,
          source_url: i.source_url,
          occurred_at: i.occurred_at,
          raw_text: i.raw_text,
          ai_summary: i.ai_summary,
        }))
      );
      if (insertError) throw new HttpError(500, insertError.message);
    }

    return jsonResponse({ total: newItems.length, ...counts });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});
