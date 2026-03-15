const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_SHEETS_RECONNECT_MESSAGE = "Google Sheets needs to be reconnected. Please connect Google Sheets again.";

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

function shouldReconnectGoogleSheets(raw: string) {
  return /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes|invalid_grant|invalid_token|invalid credentials|unauthorized/i.test(
    raw
  );
}

export function getGoogleSheetsReconnectMessage() {
  return GOOGLE_SHEETS_RECONNECT_MESSAGE;
}

async function invalidateGoogleSheetsToken(supabase: any, userId: string) {
  try {
    await supabase.from("google_sheets_tokens").delete().eq("user_id", userId);
  } catch {
    // Best effort cleanup so stale connections do not linger.
  }
}

export async function validateGoogleSheetsAccess(accessToken: string) {
  const res = await fetch(
    "https://sheets.googleapis.com/v4/spreadsheets/0000000000000000000000000000000000000000000?fields=spreadsheetId",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (res.ok || res.status === 404) {
    return;
  }

  const text = await res.text();
  if (res.status === 401 || (res.status === 403 && shouldReconnectGoogleSheets(text))) {
    throw new Error(GOOGLE_SHEETS_RECONNECT_MESSAGE);
  }
}

export async function getUsableGoogleSheetsAccessToken(
  supabase: any,
  userId: string
) {
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("google_sheets_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    throw new Error("Google Sheets not connected");
  }

  let accessToken = String(tokenRow.access_token);
  if (new Date(String(tokenRow.expires_at)).getTime() < Date.now() + 60_000) {
    try {
      const refreshed = await refreshGoogleSheetsToken(String(tokenRow.refresh_token));
      accessToken = refreshed.access_token;
      await supabase
        .from("google_sheets_tokens")
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq("user_id", userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh Google Sheets token";
      if (shouldReconnectGoogleSheets(message)) {
        await invalidateGoogleSheetsToken(supabase, userId);
        throw new Error(GOOGLE_SHEETS_RECONNECT_MESSAGE);
      }
      throw error;
    }
  }

  try {
    await validateGoogleSheetsAccess(accessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to validate Google Sheets access";
    if (message === GOOGLE_SHEETS_RECONNECT_MESSAGE) {
      await invalidateGoogleSheetsToken(supabase, userId);
    }
    throw error;
  }

  return accessToken;
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

export async function fetchGoogleSheetTabs(
  accessToken: string,
  sheetId: string,
  sheetTitles: string[],
  maxRows = 5000
) {
  const cappedMaxRows = Math.max(2, Math.min(5000, maxRows));
  const params = new URLSearchParams();
  for (const title of sheetTitles) {
    params.append("ranges", `${quoteSheetTitle(title)}!A1:ZZ${cappedMaxRows}`);
  }
  params.set("majorDimension", "ROWS");

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchGet?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to read sheet tabs: ${await res.text()}`);
  }

  const payload = (await res.json()) as {
    valueRanges?: Array<{ range?: string; values?: string[][] }>;
  };

  const rowsByTitle = new Map<string, string[][]>();
  for (const valueRange of payload.valueRanges || []) {
    const range = valueRange.range || "";
    const matchedTitle = sheetTitles.find((title) => range.startsWith(`${quoteSheetTitle(title)}!`));
    if (matchedTitle) {
      rowsByTitle.set(matchedTitle, valueRange.values || []);
    }
  }

  return rowsByTitle;
}

export type GoogleSheetWriteTab = {
  title: string;
  values: Array<Array<string | number | boolean>>;
};

export async function createGoogleSpreadsheet(
  accessToken: string,
  title: string,
  sheetTitles: string[]
) {
  const uniqueTitles = Array.from(new Set(sheetTitles.filter(Boolean))).slice(0, 200);
  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: uniqueTitles.map((sheetTitle) => ({
        properties: { title: sheetTitle },
      })),
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create spreadsheet: ${await res.text()}`);
  }

  const payload = (await res.json()) as { spreadsheetId: string; spreadsheetUrl?: string | null };
  return {
    spreadsheetId: payload.spreadsheetId,
    spreadsheetUrl: payload.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${payload.spreadsheetId}/edit`,
  };
}

function quoteSheetTitleForRange(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

export async function writeGoogleSpreadsheetTabs(
  accessToken: string,
  spreadsheetId: string,
  tabs: GoogleSheetWriteTab[]
) {
  const data = tabs.map((tab) => ({
    range: `${quoteSheetTitleForRange(tab.title)}!A1`,
    majorDimension: "ROWS",
    values: tab.values.length > 0 ? tab.values : [[""]],
  }));

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to write spreadsheet tabs: ${await res.text()}`);
  }

  return res.json();
}

export async function ensureGoogleSpreadsheetTabs(
  accessToken: string,
  spreadsheetId: string,
  sheetTitles: string[]
) {
  const metadata = await getGoogleSpreadsheetMetadata(accessToken, spreadsheetId);
  const existingTitles = new Set((metadata.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean));
  const missingTitles = sheetTitles.filter((title) => !existingTitles.has(title));
  if (missingTitles.length === 0) return;

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: missingTitles.map((title) => ({
          addSheet: {
            properties: { title },
          },
        })),
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to ensure spreadsheet tabs: ${await res.text()}`);
  }
}

export async function clearGoogleSpreadsheetTabs(
  accessToken: string,
  spreadsheetId: string,
  sheetTitles: string[]
) {
  if (sheetTitles.length === 0) return;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchClear`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ranges: sheetTitles.map((title) => quoteSheetTitleForRange(title)),
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to clear spreadsheet tabs: ${await res.text()}`);
  }
}

export async function deleteGoogleSpreadsheetTabs(
  accessToken: string,
  spreadsheetId: string,
  sheetTitles: string[]
) {
  if (sheetTitles.length === 0) return;
  const metadata = await getGoogleSpreadsheetMetadata(accessToken, spreadsheetId);
  const titleToSheetId = new Map(
    (metadata.sheets || [])
      .map((sheet) => [sheet.properties?.title, sheet.properties?.sheetId] as const)
      .filter((entry): entry is [string, number] => Boolean(entry[0]) && typeof entry[1] === "number")
  );
  const existingIds = sheetTitles
    .map((title) => titleToSheetId.get(title))
    .filter((sheetId): sheetId is number => typeof sheetId === "number");
  if (existingIds.length === 0) return;

  const remainingSheetCount = (metadata.sheets || []).length - existingIds.length;
  if (remainingSheetCount < 1) {
    existingIds.pop();
  }
  if (existingIds.length === 0) return;

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: existingIds.map((sheetId) => ({
          deleteSheet: { sheetId },
        })),
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to delete spreadsheet tabs: ${await res.text()}`);
  }
}
