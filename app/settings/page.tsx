import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import { SettingsClient } from "@/components/SettingsClient";
import type { AppUser, BrandGuidePublic, IntegrationStatus } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).single<AppUser>();

  const { data: integrations } = await supabase
    .from("integration_status")
    .select("*")
    .returns<IntegrationStatus[]>();

  const { data: brandGuide } = await supabase
    .from("brand_guide_public")
    .select("*")
    .eq("id", 1)
    .single<BrandGuidePublic>();

  const { data: voiceProfile } = await supabase
    .from("voice_profiles")
    .select("sample_message_count, built_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar userName={profile?.name ?? user.email ?? ""} role={profile?.role ?? "account_executive"} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <SettingsClient
          integrations={integrations ?? []}
          brandGuide={brandGuide ?? null}
          voiceProfile={voiceProfile ?? null}
        />
      </main>
    </div>
  );
}
