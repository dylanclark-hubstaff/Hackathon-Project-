// Exercises the stored credential for a given service and reports whether it
// actually works, updating `connected` / `last_connected_at` accordingly.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireUser, HttpError } from "../_shared/auth.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { testAvomaConnection } from "../_shared/avoma.ts";
import { testSlackConnection } from "../_shared/slack.ts";
import { refreshGoogleAccessToken } from "../_shared/gmail.ts";
import { refreshMicrosoftAccessToken } from "../_shared/outlook.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const user = await requireUser(req);
    const { service } = await req.json();
    const admin = adminClient();

    const { data: row, error } = await admin
      .from("integration_credentials")
      .select("secret_encrypted, refresh_token_encrypted, config")
      .eq("user_id", user.id)
      .eq("service", service)
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!row) throw new HttpError(404, "No credential saved for this service yet");

    let extra: Record<string, unknown> = {};

    if (service === "avoma") {
      if (!row.secret_encrypted) throw new HttpError(400, "No API key saved");
      await testAvomaConnection(await decryptSecret(row.secret_encrypted));
    } else if (service === "slack") {
      if (!row.secret_encrypted) throw new HttpError(400, "No bot token saved");
      const info = await testSlackConnection(await decryptSecret(row.secret_encrypted));
      extra = { config: { ...row.config, bot_user_id: info.botUserId, team: info.team } };
    } else if (service === "google") {
      if (!row.refresh_token_encrypted) throw new HttpError(400, "Not connected via OAuth yet");
      await refreshGoogleAccessToken(await decryptSecret(row.refresh_token_encrypted));
    } else if (service === "microsoft") {
      if (!row.refresh_token_encrypted) throw new HttpError(400, "Not connected via OAuth yet");
      await refreshMicrosoftAccessToken(await decryptSecret(row.refresh_token_encrypted));
    } else {
      throw new HttpError(400, "Unknown service");
    }

    await admin
      .from("integration_credentials")
      .update({ connected: true, last_connected_at: new Date().toISOString(), ...extra })
      .eq("user_id", user.id)
      .eq("service", service);

    return jsonResponse({ ok: true, connected: true });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return jsonResponse({ ok: false, error: (err as Error).message }, status);
  }
});
