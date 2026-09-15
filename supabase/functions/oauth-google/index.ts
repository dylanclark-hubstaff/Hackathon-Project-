// Handles both steps of the Gmail OAuth flow from a single function:
//   POST /functions/v1/oauth-google            -> returns the Google consent URL (requires the caller's JWT)
//   GET  /functions/v1/oauth-google/callback    -> Google redirects here after consent; exchanges the code,
//                                                   stores the encrypted refresh token, redirects back to Settings
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireUser, HttpError } from "../_shared/auth.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { encryptSecret, decryptSecret } from "../_shared/crypto.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const url = new URL(req.url);
  const isCallback = url.pathname.endsWith("/callback");

  try {
    if (!isCallback) {
      // --- init: build the consent URL for the caller ---
      const user = await requireUser(req);
      const state = await encryptSecret(user.id);
      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.searchParams.set("client_id", Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!);
      authUrl.searchParams.set("redirect_uri", Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI")!);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPE);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", state);
      return jsonResponse({ url: authUrl.toString() });
    }

    // --- callback: exchange code, store refresh token, bounce back to the app ---
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) throw new HttpError(400, "Missing code or state");

    const userId = await decryptSecret(state);

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
        redirect_uri: Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI")!,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new HttpError(500, `Google token exchange failed: ${await tokenRes.text()}`);
    const tokenBody = await tokenRes.json();
    if (!tokenBody.refresh_token) {
      throw new HttpError(
        500,
        "Google did not return a refresh token - revoke prior app access at myaccount.google.com/permissions and reconnect"
      );
    }

    const admin = adminClient();
    const refresh_token_encrypted = await encryptSecret(tokenBody.refresh_token);
    const { error } = await admin.from("integration_credentials").upsert(
      {
        user_id: userId,
        service: "google",
        refresh_token_encrypted,
        connected: true,
        last_connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id,service" }
    );
    if (error) throw new HttpError(500, error.message);

    return Response.redirect(`${Deno.env.get("APP_URL")}/settings?connected=google`, 302);
  } catch (err) {
    if (isCallback) {
      return Response.redirect(
        `${Deno.env.get("APP_URL")}/settings?error=${encodeURIComponent((err as Error).message)}`,
        302
      );
    }
    const status = err instanceof HttpError ? err.status : 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});
