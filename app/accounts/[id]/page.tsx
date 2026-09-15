import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import { AccountDetailClient } from "@/components/AccountDetailClient";
import type { Account, AppUser, ContextItem, Sequence } from "@/lib/types";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).single<AppUser>();

  const { data: account } = await supabase.from("accounts").select("*").eq("id", id).single<Account>();
  if (!account) notFound();

  const { data: contextItems } = await supabase
    .from("context_items")
    .select("*")
    .eq("account_id", id)
    .order("occurred_at", { ascending: false })
    .returns<ContextItem[]>();

  const { data: sequences } = await supabase
    .from("sequences")
    .select("*")
    .eq("account_id", id)
    .order("created_at", { ascending: false })
    .returns<Sequence[]>();

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar userName={profile?.name ?? user.email ?? ""} role={profile?.role ?? "account_executive"} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <AccountDetailClient
          account={account}
          contextItems={contextItems ?? []}
          sequences={sequences ?? []}
          role={profile?.role ?? "account_executive"}
        />
      </main>
    </div>
  );
}
