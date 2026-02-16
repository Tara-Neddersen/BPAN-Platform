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
  const res = await fetch(TOKEN_URL, {
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

  if (!res.ok) {
    throw new Error("Failed to refresh access token");
  }

  const data = await res.json();
  return {
    access_token: data.access_token as string,
    expires_in: data.expires_in as number,
  };
}

export async function getGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
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
  // Search for existing folder
  let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
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

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
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

  // Use multipart upload
  const boundary = "bpan_upload_boundary";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaPart = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

  const body = Buffer.concat([
    Buffer.from(metadataPart, "utf-8"),
    Buffer.from(mediaPart, "utf-8"),
    fileBuffer,
    Buffer.from(closeDelim, "utf-8"),
  ]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
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

export function isDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

