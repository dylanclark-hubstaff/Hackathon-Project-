// Microsoft Graph API (readonly mail). OAuth 2.0 with refresh tokens stored encrypted per user.

export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<string> {
  const tenant = Deno.env.get("MICROSOFT_OAUTH_TENANT_ID") || "common";
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MICROSOFT_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("MICROSOFT_OAUTH_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "offline_access Mail.Read",
    }),
  });
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${await res.text()}`);
  const body = await res.json();
  return body.access_token;
}

interface GraphMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  receivedDateTime: string;
  webLink: string;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  body?: { content: string; contentType: string };
}

export async function findOutlookMessagesForAccount(
  accessToken: string,
  contactEmail: string,
  daysBack = 180
): Promise<{ id: string; occurredAt: string; subject: string; snippet: string; body: string; webLink: string }[]> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  // Graph's $filter on nested toRecipients/any collections is unreliable across
  // mailbox configs, so we pull recent mail by date and match the contact
  // client-side against from/to addresses instead.
  const url =
    `https://graph.microsoft.com/v1.0/me/messages?$top=50&$orderby=receivedDateTime desc` +
    `&$select=id,subject,bodyPreview,receivedDateTime,webLink,body,from,toRecipients` +
    `&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Microsoft Graph error: ${await res.text()}`);
  const body = await res.json();
  const messages: GraphMessage[] = body.value ?? [];

  const needle = contactEmail.toLowerCase();
  return messages
    .filter((m) => {
      const from = m.from?.emailAddress?.address?.toLowerCase();
      const to = (m.toRecipients ?? []).map((r) => r.emailAddress?.address?.toLowerCase());
      return from === needle || to.includes(needle);
    })
    .map((m) => ({
      id: m.id,
      occurredAt: m.receivedDateTime,
      subject: m.subject,
      snippet: m.bodyPreview,
      body: (m.body?.content ?? "").replace(/<[^>]+>/g, " ").slice(0, 4000),
      webLink: m.webLink,
    }));
}
