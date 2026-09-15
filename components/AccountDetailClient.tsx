"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui/Card";
import type { Account, ContextItem, Sequence, SequenceType, UserRole } from "@/lib/types";
import { ACCOUNT_TYPE_LABELS, SEQUENCE_TYPE_LABELS } from "@/lib/types";

const SOURCE_LABELS: Record<ContextItem["source"], string> = {
  avoma_call: "Call (Avoma)",
  email: "Email",
  slack_message: "Slack",
};

const SOURCE_TONE: Record<ContextItem["source"], "blue" | "green" | "amber"> = {
  avoma_call: "blue",
  email: "green",
  slack_message: "amber",
};

export function AccountDetailClient({
  account,
  contextItems,
  sequences,
  role,
}: {
  account: Account;
  contextItems: ContextItem[];
  sequences: Sequence[];
  role: UserRole;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullSummary, setPullSummary] = useState<string | null>(null);
  const [sequenceType, setSequenceType] = useState<SequenceType>(
    role === "partner_manager" ? "initial_outreach" : "initial_outreach"
  );
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  async function handlePullContext() {
    setPulling(true);
    setPullError(null);
    setPullSummary(null);
    const { data, error } = await supabase.functions.invoke("pull-context", {
      body: { account_id: account.id },
    });
    setPulling(false);
    if (error) {
      setPullError(error.message);
      return;
    }
    setPullSummary(
      `Pulled ${data?.total ?? 0} new item(s) — Avoma: ${data?.avoma ?? 0}, Email: ${data?.email ?? 0}, Slack: ${data?.slack ?? 0}`
    );
    router.refresh();
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    const { data, error } = await supabase.functions.invoke("generate-sequence", {
      body: { account_id: account.id, sequence_type: sequenceType },
    });
    setGenerating(false);
    if (error) {
      setGenError(error.message);
      return;
    }
    router.push(`/accounts/${account.id}/sequences/${data.sequence_id}`);
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/accounts" className="text-sm text-slate-500 hover:text-slate-700">
          ← All accounts
        </Link>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{account.company_name}</h1>
            <p className="text-sm text-slate-500">
              {ACCOUNT_TYPE_LABELS[account.account_type]} · {account.stage}
              {account.region ? ` · ${account.region}` : ""}
            </p>
            {account.primary_contact_name && (
              <p className="mt-1 text-sm text-slate-600">
                {account.primary_contact_name}
                {account.primary_contact_email ? ` · ${account.primary_contact_email}` : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="font-medium text-slate-900">Context feed</h2>
              <Button variant="secondary" onClick={handlePullContext} disabled={pulling}>
                {pulling ? "Pulling..." : "Pull latest context"}
              </Button>
            </CardHeader>
            <CardBody>
              {pullError && <p className="mb-3 text-sm text-red-600">{pullError}</p>}
              {pullSummary && <p className="mb-3 text-sm text-emerald-700">{pullSummary}</p>}
              {contextItems.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  No context yet. Connect integrations in Settings, then pull latest context.
                </p>
              )}
              <ul className="divide-y divide-slate-100">
                {contextItems.map((item) => (
                  <li key={item.id} className="py-3">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge tone={SOURCE_TONE[item.source]}>{SOURCE_LABELS[item.source]}</Badge>
                      <span className="text-xs text-slate-400">
                        {new Date(item.occurred_at).toLocaleString()}
                      </span>
                      {item.source_url && (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand-600 hover:underline"
                        >
                          View source ↗
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-slate-700">{item.ai_summary || item.raw_text?.slice(0, 300)}</p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <h2 className="font-medium text-slate-900">Generate sequence</h2>
            </CardHeader>
            <CardBody className="space-y-3">
              <Select value={sequenceType} onChange={(e) => setSequenceType(e.target.value as SequenceType)}>
                {Object.entries(SEQUENCE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              {genError && <p className="text-sm text-red-600">{genError}</p>}
              <Button onClick={handleGenerate} disabled={generating} className="w-full">
                {generating ? "Generating..." : "Generate sequence"}
              </Button>
              {contextItems.length === 0 && (
                <p className="text-xs text-amber-600">
                  No context pulled yet — the draft will flag thin context instead of inventing details.
                </p>
              )}
            </CardBody>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <h2 className="font-medium text-slate-900">Sequences</h2>
            </CardHeader>
            <CardBody>
              {sequences.length === 0 && <p className="text-sm text-slate-400">No sequences yet.</p>}
              <ul className="space-y-2">
                {sequences.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/accounts/${account.id}/sequences/${s.id}`}
                      className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-brand-300"
                    >
                      <span>{SEQUENCE_TYPE_LABELS[s.sequence_type]}</span>
                      <Badge tone={s.status === "approved" ? "green" : "slate"}>{s.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
