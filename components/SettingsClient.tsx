"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui/Card";
import type { BrandGuidePublic, IntegrationStatus, IntegrationService } from "@/lib/types";

function useIntegration(list: IntegrationStatus[], service: IntegrationService) {
  return list.find((i) => i.service === service) ?? null;
}

function ConnectedBadge({ connected }: { connected: boolean }) {
  return <Badge tone={connected ? "green" : "slate"}>{connected ? "Connected" : "Not connected"}</Badge>;
}

export function SettingsClient({
  integrations,
  brandGuide,
  voiceProfile,
}: {
  integrations: IntegrationStatus[];
  brandGuide: BrandGuidePublic | null;
  voiceProfile: { sample_message_count: number; built_at: string | null } | null;
}) {
  const supabase = createClient();
  const avoma = useIntegration(integrations, "avoma");
  const slack = useIntegration(integrations, "slack");
  const google = useIntegration(integrations, "google");
  const microsoft = useIntegration(integrations, "microsoft");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Connect your own integrations and manage the shared brand voice.</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">My integrations</h2>
        <div className="space-y-4">
          <AvomaCard current={avoma} />
          <SlackCard current={slack} voiceProfile={voiceProfile} />
          <OAuthCard
            title="Gmail"
            description="Read-only access to search your mailbox for threads with an account's contact."
            service="google"
            current={google}
          />
          <OAuthCard
            title="Outlook"
            description="Read-only access to search your mailbox for threads with an account's contact."
            service="microsoft"
            current={microsoft}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Brand voice (org-wide)
        </h2>
        <BrandGuideCard current={brandGuide} />
      </section>
    </div>
  );

  function AvomaCard({ current }: { current: IntegrationStatus | null }) {
    const [apiKey, setApiKey] = useState("");
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    async function handleSave() {
      setSaving(true);
      setMessage(null);
      const { error } = await supabase.functions.invoke("save-credential", {
        body: { service: "avoma", secret: apiKey, config: {} },
      });
      setSaving(false);
      setMessage(error ? error.message : "Saved. Now test the connection.");
      setApiKey("");
    }

    async function handleTest() {
      setTesting(true);
      setMessage(null);
      const { data, error } = await supabase.functions.invoke("test-connection", { body: { service: "avoma" } });
      setTesting(false);
      setMessage(error ? error.message : data?.connected ? "Connection verified." : "Could not verify.");
    }

    return (
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="font-medium text-slate-900">Avoma</h3>
          <ConnectedBadge connected={!!current?.connected} />
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-slate-500">Calls, transcripts, and AI notes for accounts you're on.</p>
          <div>
            <Label htmlFor="avoma_key">API key</Label>
            <Input
              id="avoma_key"
              type="password"
              placeholder={current?.connected ? "•••••••• (saved)" : "Paste your Avoma API key"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          {message && <p className="text-sm text-slate-600">{message}</p>}
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || !apiKey}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="secondary" onClick={handleTest} disabled={testing}>
              {testing ? "Testing..." : "Test connection"}
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  function SlackCard({
    current,
    voiceProfile,
  }: {
    current: IntegrationStatus | null;
    voiceProfile: { sample_message_count: number; built_at: string | null } | null;
  }) {
    const [botToken, setBotToken] = useState("");
    const [channelIds, setChannelIds] = useState(((current?.config as any)?.channel_ids ?? []).join(", "));
    const [slackUserId, setSlackUserId] = useState((current?.config as any)?.slack_user_id ?? "");
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [refreshingVoice, setRefreshingVoice] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    async function handleSave() {
      setSaving(true);
      setMessage(null);
      const { error } = await supabase.functions.invoke("save-credential", {
        body: {
          service: "slack",
          secret: botToken || undefined,
          config: {
            channel_ids: channelIds.split(",").map((s: string) => s.trim()).filter(Boolean),
            slack_user_id: slackUserId.trim() || undefined,
          },
        },
      });
      setSaving(false);
      setMessage(error ? error.message : "Saved. Now test the connection.");
      setBotToken("");
    }

    async function handleTest() {
      setTesting(true);
      setMessage(null);
      const { data, error } = await supabase.functions.invoke("test-connection", { body: { service: "slack" } });
      setTesting(false);
      setMessage(error ? error.message : data?.connected ? "Connection verified." : "Could not verify.");
    }

    async function handleRefreshVoice() {
      setRefreshingVoice(true);
      setMessage(null);
      const { data, error } = await supabase.functions.invoke("refresh-voice-profile", {});
      setRefreshingVoice(false);
      setMessage(
        error ? error.message : `Voice profile rebuilt from ${data?.sample_message_count ?? 0} of your messages.`
      );
    }

    return (
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="font-medium text-slate-900">Slack</h3>
          <ConnectedBadge connected={!!current?.connected} />
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-slate-500">
            Monitors the channels you pick for mentions of an account, and learns your own writing voice from your
            posts in them.
          </p>
          <div>
            <Label htmlFor="slack_token">Bot token</Label>
            <Input
              id="slack_token"
              type="password"
              placeholder={current?.connected ? "•••••••• (saved)" : "xoxb-..."}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="channel_ids">Channel IDs to monitor</Label>
            <Input
              id="channel_ids"
              placeholder="C0123456, C0789012"
              value={channelIds}
              onChange={(e) => setChannelIds(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="slack_user_id">Your Slack user ID</Label>
            <Input
              id="slack_user_id"
              placeholder="U0123456 (used to build your personal voice profile)"
              value={slackUserId}
              onChange={(e) => setSlackUserId(e.target.value)}
            />
          </div>
          {message && <p className="text-sm text-slate-600">{message}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="secondary" onClick={handleTest} disabled={testing}>
              {testing ? "Testing..." : "Test connection"}
            </Button>
            <Button variant="secondary" onClick={handleRefreshVoice} disabled={refreshingVoice}>
              {refreshingVoice ? "Building..." : "Refresh my voice profile"}
            </Button>
          </div>
          {voiceProfile?.built_at && (
            <p className="text-xs text-slate-400">
              Voice profile last built {new Date(voiceProfile.built_at).toLocaleString()} from{" "}
              {voiceProfile.sample_message_count} messages.
            </p>
          )}
        </CardBody>
      </Card>
    );
  }

  function OAuthCard({
    title,
    description,
    service,
    current,
  }: {
    title: string;
    description: string;
    service: "google" | "microsoft";
    current: IntegrationStatus | null;
  }) {
    const [connecting, setConnecting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    async function handleConnect() {
      setConnecting(true);
      setMessage(null);
      const fn = service === "google" ? "oauth-google" : "oauth-microsoft";
      const { data, error } = await supabase.functions.invoke(fn, { body: {} });
      setConnecting(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      window.location.href = data.url;
    }

    async function handleTest() {
      setMessage(null);
      const { data, error } = await supabase.functions.invoke("test-connection", { body: { service } });
      setMessage(error ? error.message : data?.connected ? "Connection verified." : "Could not verify.");
    }

    return (
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="font-medium text-slate-900">{title}</h3>
          <ConnectedBadge connected={!!current?.connected} />
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-slate-500">{description}</p>
          {message && <p className="text-sm text-slate-600">{message}</p>}
          <div className="flex gap-2">
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? "Redirecting..." : current?.connected ? "Reconnect" : `Connect ${title}`}
            </Button>
            {current?.connected && (
              <Button variant="secondary" onClick={handleTest}>
                Test connection
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    );
  }

  function BrandGuideCard({ current }: { current: BrandGuidePublic | null }) {
    const [mode, setMode] = useState<"manual_text" | "outline_doc">(current?.source_type ?? "manual_text");
    const [content, setContent] = useState(current?.content ?? "");
    const [outlineKey, setOutlineKey] = useState("");
    const [outlineUrl, setOutlineUrl] = useState(current?.outline_doc_url ?? "");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    async function handleSaveManual() {
      setSaving(true);
      setMessage(null);
      const { error } = await supabase.functions.invoke("sync-brand-guide", {
        body: { mode: "manual", content },
      });
      setSaving(false);
      setMessage(error ? error.message : "Brand guide saved.");
    }

    async function handleConnectOutline() {
      setSaving(true);
      setMessage(null);
      const { error } = await supabase.functions.invoke("sync-brand-guide", {
        body: { mode: "connect_outline", outline_api_key: outlineKey, outline_doc_url: outlineUrl },
      });
      setSaving(false);
      setMessage(error ? error.message : "Connected and synced from Outline.");
      setOutlineKey("");
    }

    async function handleResync() {
      setSaving(true);
      setMessage(null);
      const { error } = await supabase.functions.invoke("sync-brand-guide", { body: { mode: "resync" } });
      setSaving(false);
      setMessage(error ? error.message : "Re-synced from Outline.");
    }

    return (
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="font-medium text-slate-900">Brand voice guide</h3>
          {current?.last_synced_at && (
            <span className="text-xs text-slate-400">
              Last synced {new Date(current.last_synced_at).toLocaleString()}
            </span>
          )}
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setMode("manual_text")}
              className={`rounded-full px-3 py-1 text-sm ${
                mode === "manual_text" ? "bg-brand-500 text-white" : "border border-slate-300 text-slate-600"
              }`}
            >
              Paste text
            </button>
            <button
              onClick={() => setMode("outline_doc")}
              className={`rounded-full px-3 py-1 text-sm ${
                mode === "outline_doc" ? "bg-brand-500 text-white" : "border border-slate-300 text-slate-600"
              }`}
            >
              Connect Outline
            </button>
          </div>

          {mode === "manual_text" ? (
            <>
              <Textarea
                rows={8}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste the brand voice / style guide text here..."
              />
              <Button onClick={handleSaveManual} disabled={saving}>
                {saving ? "Saving..." : "Save brand guide"}
              </Button>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="outline_key">Outline API key</Label>
                <Input
                  id="outline_key"
                  type="password"
                  placeholder={current?.outline_connected ? "•••••••• (saved)" : "Paste your Outline API key"}
                  value={outlineKey}
                  onChange={(e) => setOutlineKey(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="outline_url">Document URL or ID</Label>
                <Input
                  id="outline_url"
                  placeholder="https://app.getoutline.com/doc/brand-voice-..."
                  value={outlineUrl}
                  onChange={(e) => setOutlineUrl(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleConnectOutline} disabled={saving || !outlineKey || !outlineUrl}>
                  {saving ? "Connecting..." : "Connect & sync"}
                </Button>
                {current?.outline_connected && (
                  <Button variant="secondary" onClick={handleResync} disabled={saving}>
                    Sync now
                  </Button>
                )}
              </div>
              {current?.content && (
                <details className="text-sm text-slate-500">
                  <summary className="cursor-pointer">Current synced content ({current.content.length} chars)</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">
                    {current.content}
                  </pre>
                </details>
              )}
            </>
          )}

          {message && <p className="text-sm text-slate-600">{message}</p>}
        </CardBody>
      </Card>
    );
  }
}
