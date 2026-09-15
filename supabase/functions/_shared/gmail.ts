// Gmail API (readonly). OAuth 2.0 with refresh tokens stored encrypted per user.

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  const body = await res.json();
  return body.access_token;
}

interface GmailMessage {
  id: string;
  internalDate: string;
  snippet: string;
  payload?: { headers?: { name: string; value: string }[]; parts?: any[]; body?: { data?: string } };
}

function decodeBody(payload: GmailMessage["payload"]): string {
  function findPlainText(part: any): string | null {
    if (!part) return null;
    if (part.mimeType === "text/plain" && part.body?.data) return part.body.data;
    for (const p of part.parts ?? []) {
      const found = findPlainText(p);
      if (found) return found;
    }
    return null;
  }
  const data = payload?.body?.data ?? findPlainText(payload);
  if (!data) return "";
  try {
    return decodeURIComponent(
      atob(data.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
  } catch {
    return "";
  }
}

export async function findGmailMessagesForAccount(
  accessToken: string,
  contactEmail: string,
  daysBack = 180
): Promise<{ id: string; occurredAt: string; subject: string; snippet: string; body: string }[]> {
  const afterEpoch = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);
  const q = `from:${contactEmail} OR to:${contactEmail} after:${afterEpoch}`;
  const listRes = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q, maxResults: "25" })}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) throw new Error(`Gmail list error: ${await listRes.text()}`);
  const list = await listRes.json();
  const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);

  const messages = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) return null;
      const msg: GmailMessage = await res.json();
      const subject = msg.payload?.headers?.find((h) => h.name === "Subject")?.value ?? "(no subject)";
      return {
        id: msg.id,
        occurredAt: new Date(Number(msg.internalDate)).toISOString(),
        subject,
        snippet: msg.snippet,
        body: decodeBody(msg.payload).slice(0, 4000),
      };
    })
  );

  return messages.filter((m): m is NonNullable<typeof m> => m !== null);
}

export function gmailMessageUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${messageId}`;
}
