// Slack Web API client. Bot token needs scopes: channels:history, channels:read, users:read.
// Bot tokens cannot use search.messages (Enterprise-only), so we page through
// conversations.history for the user's configured channels and match on text
// instead - this is what channels:history is for.

const SLACK_API = "https://slack.com/api";

async function slackFetch(token: string, method: string, params: Record<string, string> = {}) {
  const url = new URL(`${SLACK_API}/${method}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!body.ok) throw new Error(`Slack API error (${method}): ${body.error}`);
  return body;
}

export async function testSlackConnection(token: string): Promise<{ botUserId: string; team: string }> {
  const body = await slackFetch(token, "auth.test");
  return { botUserId: body.user_id, team: body.team };
}

export interface SlackMessage {
  ts: string;
  user?: string;
  text: string;
  channel: string;
  permalink?: string;
}

// Fetches recent history for the given channels and returns messages whose
// text mentions the needle (contact name/email or company name).
export async function findSlackMessagesForAccount(
  token: string,
  channelIds: string[],
  needle: string,
  daysBack = 90
): Promise<SlackMessage[]> {
  const oldest = ((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000).toFixed(6);
  const lowerNeedle = needle.toLowerCase();
  const matches: SlackMessage[] = [];

  for (const channelId of channelIds) {
    let cursor: string | undefined;
    do {
      const body: any = await slackFetch(token, "conversations.history", {
        channel: channelId,
        oldest,
        limit: "200",
        ...(cursor ? { cursor } : {}),
      });
      for (const msg of body.messages ?? []) {
        if (typeof msg.text === "string" && msg.text.toLowerCase().includes(lowerNeedle)) {
          matches.push({ ts: msg.ts, user: msg.user, text: msg.text, channel: channelId });
        }
      }
      cursor = body.response_metadata?.next_cursor || undefined;
    } while (cursor);
  }

  // Resolve permalinks for matched messages.
  await Promise.all(
    matches.map(async (m) => {
      try {
        const body = await slackFetch(token, "chat.getPermalink", {
          channel: m.channel,
          message_ts: m.ts,
        });
        m.permalink = body.permalink;
      } catch {
        // Non-fatal - context item is stored without a source link if this fails.
      }
    })
  );

  return matches;
}

// Fetches the given user's own messages across the configured channels, for
// building their personal voice profile. Never returns other people's text.
export async function fetchOwnSlackMessages(
  token: string,
  channelIds: string[],
  slackUserId: string,
  maxMessages = 150
): Promise<string[]> {
  const texts: string[] = [];
  for (const channelId of channelIds) {
    if (texts.length >= maxMessages) break;
    let cursor: string | undefined;
    do {
      const body: any = await slackFetch(token, "conversations.history", {
        channel: channelId,
        limit: "200",
        ...(cursor ? { cursor } : {}),
      });
      for (const msg of body.messages ?? []) {
        if (msg.user === slackUserId && typeof msg.text === "string" && msg.text.trim()) {
          texts.push(msg.text);
        }
      }
      cursor = body.response_metadata?.next_cursor || undefined;
    } while (cursor && texts.length < maxMessages);
  }
  return texts.slice(0, maxMessages);
}
