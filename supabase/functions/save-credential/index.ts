// Stores a user's per-service integration credential. The raw secret is
// encrypted here (server-side) before it ever touches the database - the
// client sends it once over HTTPS to invoke this function and never reads it
// back (see the `integration_status` view and revoked column grants in the
// migration).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireUser, HttpError } from "../_shared/auth.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { encryptSecret } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const user = await requireUser(req);
    const { service, secret, config } = await req.json();

    if (!["avoma", "slack"].includes(service)) {
      throw new HttpError(400, "This endpoint handles avoma/slack only - google/microsoft use OAuth.");
    }
    if (!secret || typeof secret !== "string") {
      throw new HttpError(400, "Missing secret");
    }

    const secret_encrypted = await encryptSecret(secret);
    const admin = adminClient();

    const { error } = await admin.from("integration_credentials").upsert(
      {
        user_id: user.id,
        service,
        secret_encrypted,
        config: config ?? {},
        connected: false, // set true by test-connection once verified
      },
      { onConflict: "user_id,service" }
    );

    if (error) throw new HttpError(500, error.message);

    return jsonResponse({ ok: true });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});
