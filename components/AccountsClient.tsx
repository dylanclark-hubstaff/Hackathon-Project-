"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Card";
import type { Account, AccountType, AccountStage, UserRole } from "@/lib/types";
import { ACCOUNT_TYPE_LABELS, COMMON_OUTREACH_LANGUAGES } from "@/lib/types";

const STAGE_TONE: Record<AccountStage, "slate" | "green" | "amber" | "blue"> = {
  prospect: "blue",
  onboarding: "amber",
  active: "green",
  dormant: "slate",
};

export function AccountsClient({ accounts, role }: { accounts: Account[]; role: UserRole }) {
  const [filter, setFilter] = useState<"all" | AccountType>("all");
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  const filtered = useMemo(
    () => (filter === "all" ? accounts : accounts.filter((a) => a.account_type === filter)),
    [accounts, filter]
  );

  const noun = role === "partner_manager" ? "Partner" : "Customer";

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Accounts</h1>
          <p className="text-sm text-slate-500">
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : `+ Add ${noun.toLowerCase()}`}</Button>
      </div>

      {showForm && (
        <div className="mb-6">
          <NewAccountForm
            defaultType={role === "partner_manager" ? "partner_distributor" : "end_user"}
            onCreated={(id) => {
              setShowForm(false);
              router.push(`/accounts/${id}`);
            }}
          />
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {(["all", "partner_distributor", "end_user"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === f ? "bg-brand-500 text-white" : "bg-white text-slate-600 border border-slate-300"
            }`}
          >
            {f === "all" ? "All" : ACCOUNT_TYPE_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a) => (
          <Link key={a.id} href={`/accounts/${a.id}`}>
            <Card className="h-full transition hover:border-brand-300 hover:shadow-md">
              <CardBody>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-medium text-slate-900">{a.company_name}</h3>
                  <Badge tone={STAGE_TONE[a.stage]}>{a.stage}</Badge>
                </div>
                <p className="text-sm text-slate-500">{ACCOUNT_TYPE_LABELS[a.account_type]}</p>
                {a.primary_contact_name && (
                  <p className="mt-1 text-sm text-slate-600">{a.primary_contact_name}</p>
                )}
                {a.region && <p className="text-xs text-slate-400">{a.region}</p>}
              </CardBody>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-slate-400">
            No accounts yet. Add one to get started.
          </p>
        )}
      </div>
    </div>
  );
}

function NewAccountForm({
  defaultType,
  onCreated,
}: {
  defaultType: AccountType;
  onCreated: (id: string) => void;
}) {
  const supabase = createClient();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [accountType, setAccountType] = useState<AccountType>(defaultType);
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState("English");
  const [customLanguage, setCustomLanguage] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("accounts")
      .insert({
        owner_user_id: user.id,
        company_name: companyName,
        primary_contact_name: contactName || null,
        primary_contact_email: contactEmail || null,
        account_type: accountType,
        region: region || null,
        language: language === "Other" ? customLanguage.trim() || "English" : language,
        notes: notes || null,
      })
      .select("id")
      .single();

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onCreated(data.id);
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="company_name">Company name</Label>
            <Input id="company_name" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="account_type">Type</Label>
            <Select id="account_type" value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)}>
              <option value="partner_distributor">Partner / Distributor</option>
              <option value="end_user">Customer</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="contact_name">Primary contact name</Label>
            <Input id="contact_name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="contact_email">Primary contact email</Label>
            <Input
              id="contact_email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="region">Region / country</Label>
            <Input id="region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Brazil" />
          </div>
          <div>
            <Label htmlFor="language">Outreach language</Label>
            <Select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {COMMON_OUTREACH_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              <option value="Other">Other (specify)...</option>
            </Select>
            {language === "Other" && (
              <Input
                className="mt-2"
                placeholder="e.g. Czech"
                value={customLanguage}
                onChange={(e) => setCustomLanguage(e.target.value)}
              />
            )}
            <p className="mt-1 text-xs text-slate-400">Sequences for this account are drafted natively in this language.</p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Create account"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
