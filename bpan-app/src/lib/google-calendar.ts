const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function isGoogleCalendarConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleCalendarRedirectUri() {
  return `${getBaseUrl()}/api/calendar/google/callback`;
}

export function getGoogleCalendarAuthUrl(state: string) {
  if (!process.env.GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID not set");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleCalendarRedirectUri(),
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCalendarCode(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getGoogleCalendarRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Calendar token exchange failed: ${await res.text()}`);
  const data = await res.json();
  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_in: data.expires_in as number,
  };
}

export async function refreshGoogleCalendarToken(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Failed to refresh Google Calendar token");
  const data = await res.json();
  return {
    access_token: data.access_token as string,
    expires_in: data.expires_in as number,
  };
}

export async function getGoogleCalendarEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.email as string) || null;
  } catch {
    return null;
  }
}

export async function upsertGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: {
    eventId?: string | null;
    summary: string;
    description?: string | null;
    location?: string | null;
    startAt: string;
    endAt?: string | null;
    allDay?: boolean;
  }
) {
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description || undefined,
    location: input.location || undefined,
  };

  if (input.allDay) {
    const startDate = input.startAt.slice(0, 10);
    const endDateBase = input.endAt ? input.endAt.slice(0, 10) : startDate;
    const endDate = new Date(`${endDateBase}T00:00:00Z`);
    if (!input.endAt || endDateBase === startDate) endDate.setUTCDate(endDate.getUTCDate() + 1);
    body.start = { date: startDate };
    body.end = { date: endDate.toISOString().slice(0, 10) };
  } else {
    body.start = { dateTime: input.startAt };
    body.end = { dateTime: input.endAt || new Date(new Date(input.startAt).getTime() + 60 * 60 * 1000).toISOString() };
  }

  const method = input.eventId ? "PATCH" : "POST";
  const url = input.eventId
    ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}`
    : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Calendar event sync failed: ${await res.text()}`);
  const data = await res.json();
  return data as { id: string; htmlLink?: string };
}

