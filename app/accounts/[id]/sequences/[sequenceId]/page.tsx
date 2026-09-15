import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import { SequenceEditorClient } from "@/components/SequenceEditorClient";
import type { Account, AppUser, ContextItem, Sequence, SequenceEmail } from "@/lib/types";

export default async function SequencePage({
  params,
}: {
  params: Promise<{ id: string; sequenceId: string }>;
}) {
  const { id, sequenceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).single<AppUser>();
  const { data: account } = await supabase.from("accounts").select("*").eq("id", id).single<Account>();
  const { data: sequence } = await supabase
    .from("sequences")
    .select("*")
    .eq("id", sequenceId)
    .single<Sequence>();
  if (!account || !sequence) notFound();

  const { data: emails } = await supabase
    .from("sequence_emails")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("position", { ascending: true })
    .returns<SequenceEmail[]>();

  const { data: contextItems } = await supabase
    .from("context_items")
    .select("*")
    .eq("account_id", id)
    .returns<ContextItem[]>();

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar userName={profile?.name ?? user.email ?? ""} role={profile?.role ?? "account_executive"} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <SequenceEditorClient
          account={account}
          sequence={sequence}
          emails={emails ?? []}
          contextItems={contextItems ?? []}
        />
      </main>
    </div>
  );
}
