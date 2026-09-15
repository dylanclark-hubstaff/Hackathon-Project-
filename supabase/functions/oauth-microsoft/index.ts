// Handles both steps of the Outlook OAuth flow from a single function:
//   POST /functions/v1/oauth-microsoft            -> returns the Microsoft consent URL (requires the caller's JWT)
//   GET  /functions/v1/oauth-microsoft/callback    -> Microsoft redirects here after consent; exchanges the code,
//                                                      stores the encrypted refresh token, redirects back to Settings
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireUser, HttpError } from "../_shared/auth.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { encryptSecret, decryptSecret } from "../_shared/crypto.ts";

const SCOPE = "offline_access Mail.Read";

function tenant() {
  return Deno.env.get("MICROSOFT_OAUTH_TENANT_ID") || "common";
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const url = new URL(req.url);
  const isCallback = url.pathname.endsWith("/callback");

  try {
    if (!isCallback) {
      const user = await requireUser(req);
      const state = await encryptSecret(user.id);
      const authUrl = new URL(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`);
      authUrl.searchParams.set("client_id", Deno.env.get("MICROSOFT_OAUTH_CLIENT_ID")!);
      authUrl.searchParams.set("redirect_uri", Deno.env.get("MICROSOFT_OAUTH_REDIRECT_URI")!);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("response_mode", "query");
      authUrl.searchParams.set("scope", SCOPE);
      authUrl.searchParams.set("state", state);
      return jsonResponse({ url: authUrl.toString() });
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) throw new HttpError(400, "Missing code or state");

    const userId = await decryptSecret(state);

    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get("MICROSOFT_OAUTH_CLIENT_ID")!,
        client_secret: Deno.env.get("MICROSOFT_OAUTH_CLIENT_SECRET")!,
        redirect_uri: Deno.env.get("MICROSOFT_OAUTH_REDIRECT_URI")!,
        grant_type: "authorization_code",
        scope: SCOPE,
      }),
    });
    if (!tokenRes.ok) throw new HttpError(500, `Microsoft token exchange failed: ${await tokenRes.text()}`);
    const tokenBody = await tokenRes.json();
    if (!tokenBody.refresh_token) {
      throw new HttpError(500, "Microsoft did not return a refresh token - try reconnecting");
    }

    const admin = adminClient();
    const refresh_token_encrypted = await encryptSecret(tokenBody.refresh_token);
    const { error } = await admin.from("integration_credentials").upsert(
      {
        user_id: userId,
        service: "microsoft",
        refresh_token_encrypted,
        connected: true,
        last_connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id,service" }
    );
    if (error) throw new HttpError(500, error.message);

    return Response.redirect(`${Deno.env.get("APP_URL")}/settings?connected=microsoft`, 302);
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
