const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function isGoogleSheetsConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleSheetsRedirectUri() {
  return `${getBaseUrl()}/api/sheets/google/callback`;
}

export function getGoogleSheetsAuthUrl(state: string) {
  if (!process.env.GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID not set");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleSheetsRedirectUri(),
    response_type: "code",
    scope: SHEETS_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleSheetsCode(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getGoogleSheetsRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Sheets token exchange failed: ${await res.text()}`);
  const data = await res.json();
  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_in: data.expires_in as number,
  };
}

export async function refreshGoogleSheetsToken(refreshToken: string) {
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
  if (!res.ok) throw new Error(`Failed to refresh Google Sheets token: ${await res.text()}`);
  const data = await res.json();
  return {
    access_token: data.access_token as string,
    expires_in: data.expires_in as number,
  };
}

export async function getGoogleSheetsEmail(accessToken: string): Promise<string | null> {
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

export function parseGoogleSheetUrl(sheetUrl: string): { sheetId: string; gid?: string | null } {
  const url = new URL(sheetUrl);
  const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match?.[1]) {
    throw new Error("Invalid Google Sheets URL. Expected /spreadsheets/d/<sheetId>.");
  }
  const gid = url.searchParams.get("gid");
  return { sheetId: match[1], gid };
}

type SpreadsheetMetadata = {
  properties?: { title?: string };
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
};

export async function getGoogleSpreadsheetMetadata(
  accessToken: string,
  sheetId: string
): Promise<SpreadsheetMetadata> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=properties.title,sheets.properties(sheetId,title)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to load spreadsheet metadata: ${await res.text()}`);
  }
  return (await res.json()) as SpreadsheetMetadata;
}

function resolveSheetTitleByGid(metadata: SpreadsheetMetadata, gid?: string | null) {
  if (!gid) return metadata.sheets?.[0]?.properties?.title || null;
  const numericGid = Number(gid);
  if (Number.isNaN(numericGid)) return metadata.sheets?.[0]?.properties?.title || null;
  const match = (metadata.sheets || []).find((sheet) => sheet.properties?.sheetId === numericGid);
  return match?.properties?.title || metadata.sheets?.[0]?.properties?.title || null;
}

function quoteSheetTitle(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

export async function fetchGoogleSheetRows(
  accessToken: string,
  sheetId: string,
  options?: {
    gid?: string | null;
    sheetTitle?: string | null;
    maxRows?: number;
  }
) {
  const metadata = await getGoogleSpreadsheetMetadata(accessToken, sheetId);
  const resolvedTitle = options?.sheetTitle || resolveSheetTitleByGid(metadata, options?.gid);
  if (!resolvedTitle) throw new Error("No sheet tabs found in this spreadsheet.");
  const maxRows = Math.max(2, Math.min(5000, options?.maxRows ?? 1000));
  const range = `${quoteSheetTitle(resolvedTitle)}!A1:ZZ${maxRows}`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`Failed to read sheet values: ${await res.text()}`);
  }

  const payload = await res.json() as { values?: string[][] };
  const rows = payload.values || [];
  return {
    spreadsheetTitle: metadata.properties?.title || null,
    sheetTitle: resolvedTitle,
    rows,
  };
}
