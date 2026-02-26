const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const OUTLOOK_SCOPE = "offline_access User.Read Calendars.ReadWrite";

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function isOutlookCalendarConfigured() {
  return !!(process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET);
}

export function getOutlookCalendarRedirectUri() {
  return `${getBaseUrl()}/api/calendar/outlook/callback`;
}

export function getOutlookCalendarAuthUrl(state: string) {
  if (!process.env.OUTLOOK_CLIENT_ID) throw new Error("OUTLOOK_CLIENT_ID not set");
  const params = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID,
    response_type: "code",
    redirect_uri: getOutlookCalendarRedirectUri(),
    response_mode: "query",
    scope: OUTLOOK_SCOPE,
    state,
  });
  return `${MS_AUTH_URL}?${params.toString()}`;
}

export async function exchangeOutlookCalendarCode(code: string) {
  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID!,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
      code,
      redirect_uri: getOutlookCalendarRedirectUri(),
      grant_type: "authorization_code",
      scope: OUTLOOK_SCOPE,
    }),
  });
  if (!res.ok) throw new Error(`Outlook token exchange failed: ${await res.text()}`);
  const data = await res.json();
  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_in: Number(data.expires_in || 3600),
  };
}

export async function refreshOutlookCalendarToken(refreshToken: string) {
  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID!,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
      refresh_token: refreshToken,
      redirect_uri: getOutlookCalendarRedirectUri(),
      grant_type: "refresh_token",
      scope: OUTLOOK_SCOPE,
    }),
  });
  if (!res.ok) throw new Error(`Failed to refresh Outlook token: ${await res.text()}`);
  const data = await res.json();
  return {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string | undefined) || refreshToken,
    expires_in: Number(data.expires_in || 3600),
  };
}

export async function getOutlookCalendarEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${MS_GRAPH_BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.mail as string) || (data.userPrincipalName as string) || null;
  } catch {
    return null;
  }
}

type OutlookEventInput = {
  eventId?: string | null;
  subject: string;
  body?: string | null;
  location?: string | null;
  startAt: string;
  endAt?: string | null;
  allDay?: boolean;
};

export async function upsertOutlookCalendarEvent(accessToken: string, input: OutlookEventInput) {
  const start = new Date(input.startAt);
  const end = input.endAt ? new Date(input.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
  const body: Record<string, unknown> = {
    subject: input.subject,
    isAllDay: Boolean(input.allDay),
    body: input.body ? { contentType: "Text", content: input.body } : undefined,
    location: input.location ? { displayName: input.location } : undefined,
    start: { dateTime: start.toISOString(), timeZone: "UTC" },
    end: { dateTime: end.toISOString(), timeZone: "UTC" },
  };

  const url = input.eventId
    ? `${MS_GRAPH_BASE}/me/events/${encodeURIComponent(input.eventId)}`
    : `${MS_GRAPH_BASE}/me/events`;
  const method = input.eventId ? "PATCH" : "POST";
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: 'outlook.timezone="UTC"',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Outlook Calendar event sync failed: ${await res.text()}`);
  const data = await res.json();
  return data as { id: string; webLink?: string };
}
