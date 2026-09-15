"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui/Card";
import type { Account, ContextItem, Sequence, SequenceEmail } from "@/lib/types";
import { SEQUENCE_TYPE_LABELS } from "@/lib/types";

export function SequenceEditorClient({
  account,
  sequence,
  emails: initialEmails,
  contextItems,
}: {
  account: Account;
  sequence: Sequence;
  emails: SequenceEmail[];
  contextItems: ContextItem[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [emails, setEmails] = useState(initialEmails);
  const [status, setStatus] = useState(sequence.status);
  const [approving, setApproving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [openWhyId, setOpenWhyId] = useState<string | null>(null);

  const contextById = new Map(contextItems.map((c) => [c.id, c]));

  function updateLocal(id: string, patch: Partial<SequenceEmail>) {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function handleSave(email: SequenceEmail) {
    setSavingId(email.id);
    await supabase
      .from("sequence_emails")
      .update({ subject: email.subject, body: email.body, status: "edited" })
      .eq("id", email.id);
    updateLocal(email.id, { status: "edited" });
    setSavingId(null);
  }

  async function handleRegenerate(email: SequenceEmail) {
    setRegeneratingId(email.id);
    const { data, error } = await supabase.functions.invoke("regenerate-email", {
      body: { sequence_email_id: email.id },
    });
    setRegeneratingId(null);
    if (error) return;
    updateLocal(email.id, {
      subject: data.subject,
      body: data.body,
      brand_guide_notes: data.brand_guide_notes,
      source_context_ids: data.source_context_ids,
      status: "draft",
    });
  }

  async function handleApprove() {
    setApproving(true);
    await supabase.from("sequences").update({ status: "approved" }).eq("id", sequence.id);
    setStatus("approved");
    setApproving(false);
    router.refresh();
  }

  return (
    <div>
      <Link href={`/accounts/${account.id}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← {account.company_name}
      </Link>

      <div className="mt-2 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{SEQUENCE_TYPE_LABELS[sequence.sequence_type]}</h1>
          <p className="text-sm text-slate-500">{account.company_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={status === "approved" ? "green" : "slate"}>{status}</Badge>
          {status !== "approved" && (
            <Button onClick={handleApprove} disabled={approving}>
              {approving ? "Approving..." : "Approve sequence"}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {emails.map((email, idx) => (
          <Card key={email.id}>
            <CardHeader className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">Email {idx + 1}</span>
                <span className="text-xs text-slate-400">
                  {email.send_offset_days === 0 ? "Send immediately" : `Send day ${email.send_offset_days}`}
                </span>
                <Badge tone={email.status === "approved" ? "green" : email.status === "edited" ? "blue" : "slate"}>
                  {email.status}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setOpenWhyId(openWhyId === email.id ? null : email.id)}
                >
                  {openWhyId === email.id ? "Hide why" : "Why this email?"}
                </Button>
                <Button variant="secondary" onClick={() => handleRegenerate(email)} disabled={regeneratingId === email.id}>
                  {regeneratingId === email.id ? "Regenerating..." : "Regenerate"}
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              {openWhyId === email.id && (
                <div className="mb-4 rounded-md bg-slate-50 p-3 text-sm">
                  <p className="mb-2 font-medium text-slate-700">Informed by:</p>
                  {email.source_context_ids.length === 0 && (
                    <p className="text-slate-500">No context items referenced — thin context, review carefully.</p>
                  )}
                  <ul className="mb-2 space-y-1">
                    {email.source_context_ids.map((cid) => {
                      const item = contextById.get(cid);
                      if (!item) return null;
                      return (
                        <li key={cid}>
                          <a href={item.source_url ?? "#"} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                            {item.source} · {new Date(item.occurred_at).toLocaleDateString()}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                  {email.brand_guide_notes && (
                    <p className="text-slate-600">
                      <span className="font-medium">Brand guide: </span>
                      {email.brand_guide_notes}
                    </p>
                  )}
                </div>
              )}
              <Input
                value={email.subject}
                onChange={(e) => updateLocal(email.id, { subject: e.target.value })}
                onBlur={() => handleSave(emails.find((e) => e.id === email.id)!)}
                className="mb-2 font-medium"
                placeholder="Subject"
              />
              <Textarea
                value={email.body}
                onChange={(e) => updateLocal(email.id, { body: e.target.value })}
                onBlur={() => handleSave(emails.find((e) => e.id === email.id)!)}
                rows={10}
              />
              {savingId === email.id && <p className="mt-1 text-xs text-slate-400">Saving...</p>}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
