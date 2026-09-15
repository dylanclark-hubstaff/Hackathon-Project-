import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import { AccountsClient } from "@/components/AccountsClient";
import type { Account, AppUser } from "@/lib/types";

export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single<AppUser>();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<Account[]>();

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar userName={profile?.name ?? user.email ?? ""} role={profile?.role ?? "account_executive"} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <AccountsClient accounts={accounts ?? []} role={profile?.role ?? "account_executive"} />
      </main>
    </div>
  );
}
