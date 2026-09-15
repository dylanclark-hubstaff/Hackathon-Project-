import { callerClient } from "./supabaseAdmin.ts";

export interface AuthedUser {
  id: string;
  email: string | null;
}

// Verifies the caller's JWT (forwarded automatically by supabase-js
// `functions.invoke`) and returns their user id. Every Edge Function in this
// project calls this first - nothing runs on behalf of an unauthenticated
// caller, and every downstream query is scoped to this user id.
export async function requireUser(req: Request): Promise<AuthedUser> {
  const supabase = callerClient(req);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new HttpError(401, "Not authenticated");
  }
  return { id: user.id, email: user.email ?? null };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
