// Syncs the org-wide brand guide from Outline, or accepts a manual paste.
// Any authenticated user may trigger this (brand guide is org-wide, per spec).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireUser, HttpError } from "../_shared/auth.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { encryptSecret, decryptSecret } from "../_shared/crypto.ts";
import { fetchOutlineDocumentText, testOutlineConnection } from "../_shared/outline.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    await requireUser(req); // any authenticated user may sync/edit the brand guide
    const body = await req.json();
    const admin = adminClient();

    if (body.mode === "manual") {
      const { error } = await admin
        .from("brand_guide")
        .update({
          source_type: "manual_text",
          content: body.content ?? "",
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", 1);
      if (error) throw new HttpError(500, error.message);
      return jsonResponse({ ok: true });
    }

    if (body.mode === "connect_outline") {
      const { outline_api_key, outline_doc_url } = body;
      if (!outline_api_key || !outline_doc_url) {
        throw new HttpError(400, "outline_api_key and outline_doc_url are required");
      }
      await testOutlineConnection(outline_api_key); // throws if invalid
      const content = await fetchOutlineDocumentText(outline_api_key, outline_doc_url);
      const outline_api_key_encrypted = await encryptSecret(outline_api_key);

      const { error } = await admin
        .from("brand_guide")
        .update({
          source_type: "outline_doc",
          outline_doc_url,
          outline_api_key_encrypted,
          content,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", 1);
      if (error) throw new HttpError(500, error.message);
      return jsonResponse({ ok: true, content_length: content.length });
    }

    if (body.mode === "resync") {
      const { data: row, error } = await admin
        .from("brand_guide")
        .select("outline_api_key_encrypted, outline_doc_url")
        .eq("id", 1)
        .single();
      if (error || !row?.outline_api_key_encrypted || !row.outline_doc_url) {
        throw new HttpError(400, "Outline is not connected yet");
      }
      const apiKey = await decryptSecret(row.outline_api_key_encrypted);
      const content = await fetchOutlineDocumentText(apiKey, row.outline_doc_url);
      const { error: updateError } = await admin
        .from("brand_guide")
        .update({ content, last_synced_at: new Date().toISOString() })
        .eq("id", 1);
      if (updateError) throw new HttpError(500, updateError.message);
      return jsonResponse({ ok: true, content_length: content.length });
    }

    throw new HttpError(400, "mode must be one of manual | connect_outline | resync");
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});
