import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// Service-role client: bypasses RLS. Only ever used inside Edge Functions,
// never exposed to the browser. Every function below still authenticates the
// caller first (see auth.ts) before doing anything with this client.
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

// Client scoped to the caller's own JWT - respects RLS. Use this whenever a
// query should be naturally restricted to the caller's own rows.
export function callerClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
  );
}
