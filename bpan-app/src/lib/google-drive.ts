/**
 * Google Drive API helper
 * 
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   NEXT_PUBLIC_APP_URL  (e.g. https://bpan-app.vercel.app or http://localhost:3000)
 * 
 * Setup (one-time):
 *   1. Go to https://console.cloud.google.com
 *   2. Create a project (or use existing)
 *   3. Enable "Google Drive API"
 *   4. Go to Credentials → Create OAuth 2.0 Client ID (Web application)
 *   5. Add redirect URI: {APP_URL}/api/gdrive/callback
 *   6. Copy Client ID + Client Secret to your env vars
 */

const SCOPES = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_FETCH_TIMEOUT_MS = 30_000;
const GOOGLE_DRIVE_RECONNECT_MESSAGE = "Google Drive needs to be reconnected. Please connect Google Drive again.";

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = GOOGLE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Google Drive request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/gdrive/callback`;
}

export function getAuthUrl(state: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID not set");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string) {
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_in: data.expires_in as number,
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to refresh access token");
  }

  const data = await res.json();
  return {
    access_token: data.access_token as string,
    expires_in: data.expires_in as number,
  };
}

function shouldReconnectGoogleDrive(raw: string) {
  return /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes|invalid_grant|invalid_token|invalid credentials|unauthorized/i.test(
    raw
  );
}

export function getGoogleDriveReconnectMessage() {
  return GOOGLE_DRIVE_RECONNECT_MESSAGE;
}

async function invalidateGoogleDriveToken(supabase: any, userId: string) {
  try {
    await supabase.from("google_drive_tokens").delete().eq("user_id", userId);
  } catch {
    // Best effort cleanup so stale connections do not linger.
  }
}

export async function validateGoogleDriveAccess(accessToken: string) {
  const res = await fetchWithTimeout(
    "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (res.ok) {
    return;
  }

  const text = await res.text();
  if (res.status === 401 || (res.status === 403 && shouldReconnectGoogleDrive(text))) {
    throw new Error(GOOGLE_DRIVE_RECONNECT_MESSAGE);
  }
}

export async function getUsableGoogleDriveTokenRow(
  supabase: any,
  userId: string
) {
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("google_drive_tokens")
    .select("access_token, refresh_token, expires_at, root_folder_id, google_email")
    .eq("user_id", userId)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    throw new Error("Google Drive not connected. Please connect your Drive first.");
  }

  let accessToken = String(tokenRow.access_token);
  if (new Date(String(tokenRow.expires_at)).getTime() < Date.now() + 60_000) {
    try {
      const refreshed = await refreshAccessToken(String(tokenRow.refresh_token));
      accessToken = refreshed.access_token;
      await supabase
        .from("google_drive_tokens")
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq("user_id", userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh Google Drive token";
      if (shouldReconnectGoogleDrive(message)) {
        await invalidateGoogleDriveToken(supabase, userId);
        throw new Error(GOOGLE_DRIVE_RECONNECT_MESSAGE);
      }
      throw error;
    }
  }

  try {
    await validateGoogleDriveAccess(accessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to validate Google Drive access";
    if (message === GOOGLE_DRIVE_RECONNECT_MESSAGE) {
      await invalidateGoogleDriveToken(supabase, userId);
    }
    throw error;
  }

  return {
    accessToken,
    tokenRow: {
      ...tokenRow,
      access_token: accessToken,
    },
  };
}

export async function getGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}

/** Create or find a folder on Google Drive */
export async function findOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentId?: string
): Promise<string> {
  const escapedFolderName = folderName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  // Search for existing folder
  let query = `name='${escapedFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;

  const searchRes = await fetchWithTimeout(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files?.length > 0) {
      return searchData.files[0].id;
    }
  }

  // Create folder
  const metadata: Record<string, unknown> = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];

  const createRes = await fetchWithTimeout("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!createRes.ok) {
    throw new Error("Failed to create folder on Google Drive");
  }

  const created = await createRes.json();
  return created.id;
}

/** Upload a file to Google Drive using multipart upload */
export async function uploadFile(
  accessToken: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer,
  folderId: string
): Promise<{ fileId: string; webViewLink: string }> {
  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  const boundary = "bpan_upload_boundary";
  const openingBoundary = `--${boundary}\r\n`;
  const partBoundary = `\r\n--${boundary}\r\n`;
  const closingBoundary = `\r\n--${boundary}--\r\n`;

  const metadataPart =
    `${openingBoundary}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaPart = `${partBoundary}Content-Type: ${mimeType}\r\n\r\n`;

  const body = Buffer.concat([
    Buffer.from(metadataPart, "utf-8"),
    Buffer.from(mediaPart, "utf-8"),
    fileBuffer,
    Buffer.from(closingBoundary, "utf-8"),
  ]);

  const res = await fetchWithTimeout(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.byteLength),
      },
      body,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${text}`);
  }

  const data = await res.json();
  return {
    fileId: data.id,
    webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
  };
}

/** Make a Drive file publicly readable (anyone with link). */
export async function makeFilePublic(accessToken: string, fileId: string): Promise<void> {
  const res = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "reader",
      type: "anyone",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to make file public: ${text}`);
  }
}

/** Extract Drive file ID from common URL formats. */
export function extractDriveFileId(url: string): string | null {
  const filePathMatch = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
  if (filePathMatch) return filePathMatch[1];

  const idMatch = url.match(/[?&]id=([^&]+)/);
  if ((/drive\.google\.com\/open/.test(url) || /drive\.google\.com\/uc/.test(url) || /drive\.google\.com\/thumbnail/.test(url)) && idMatch) {
    return idMatch[1];
  }

  return null;
}

export function isDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
