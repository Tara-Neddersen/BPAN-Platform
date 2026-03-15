import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  findOrCreateFolder,
  getUsableGoogleDriveTokenRow,
  uploadFile,
  makeFilePublic,
} from "@/lib/google-drive";

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const cohortName = (formData.get("cohort_name") as string) || "Unknown Cohort";
    const animalId = (formData.get("animal_identifier") as string) || "Unknown Animal";
    const experimentType = (formData.get("experiment_type") as string) || "results";
    const experimentId = formData.get("experiment_id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Get user's Drive tokens
    const serviceSupabase = createServiceClient();
    let accessToken = "";
    let tokenRow: { root_folder_id: string | null };
    try {
      const tokenState = await getUsableGoogleDriveTokenRow(serviceSupabase, user.id);
      accessToken = tokenState.accessToken;
      tokenRow = tokenState.tokenRow;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Google Drive not connected. Please connect your Drive first." },
        { status: 400 }
      );
    }

    // Create folder structure: LabLynx / [Cohort] / [Animal]
    const rootFolderId = tokenRow.root_folder_id;

    let parentFolder = rootFolderId;
    if (parentFolder) {
      const cohortFolder = await findOrCreateFolder(accessToken, cohortName, parentFolder);
      parentFolder = cohortFolder;

      const animalFolder = await findOrCreateFolder(accessToken, animalId, parentFolder);
      parentFolder = animalFolder;
    } else {
      // Create root folder if it doesn't exist
      const root = await findOrCreateFolder(accessToken, "LabLynx");
      const cohortFolder = await findOrCreateFolder(accessToken, cohortName, root);
      const animalFolder = await findOrCreateFolder(accessToken, animalId, cohortFolder);
      parentFolder = animalFolder;

      // Save root folder ID
      await serviceSupabase
        .from("google_drive_tokens")
        .update({ root_folder_id: root })
        .eq("user_id", user.id);
    }

    // Generate filename: [ExperimentType]_[Date]_[OriginalName]
    const date = new Date().toISOString().split("T")[0];
    const fileName = `${experimentType}_${date}_${file.name}`;

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Drive
    const result = await uploadFile(
      accessToken,
      fileName,
      file.type || "application/octet-stream",
      buffer,
      parentFolder
    );
    try {
      await makeFilePublic(accessToken, result.fileId);
    } catch (err) {
      console.warn("Drive upload succeeded but sharing update failed:", err);
    }

    // If we have an experiment ID, update the experiment record with the Drive URL
    if (experimentId) {
      await supabase
        .from("animal_experiments")
        .update({ results_drive_url: result.webViewLink })
        .eq("id", experimentId)
        .eq("user_id", user.id);
    }

    return NextResponse.json({
      success: true,
      file_id: result.fileId,
      url: result.webViewLink,
    });
  } catch (err) {
    console.error("Drive upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
