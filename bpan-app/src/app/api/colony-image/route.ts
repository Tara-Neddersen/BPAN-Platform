import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "cage-images";
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * POST — upload a cage image (nesting / marble burying)
 * Returns the storage path that can be used to generate signed URLs.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const animalId = formData.get("animal_id") as string;
    const experimentType = formData.get("experiment_type") as string;
    const timepointAge = formData.get("timepoint_age") as string;

    if (!file || !animalId || !experimentType || !timepointAge) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    }

    // Validate image type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const storagePath = `${user.id}/${animalId}/${experimentType}_${timepointAge}.${ext}`;

    const buffer = await file.arrayBuffer();

    // Upload (upsert to allow re-uploads)
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Generate signed URL (valid 1 year)
    const { data: urlData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

    return NextResponse.json({
      success: true,
      path: storagePath,
      url: urlData?.signedUrl || null,
    });
  } catch (err) {
    console.error("Cage image upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}

/**
 * GET — get a signed URL for an existing cage image
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const path = req.nextUrl.searchParams.get("path");
    if (!path) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    // Security: only allow users to access their own images
    if (!path.startsWith(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60); // 1 hour

    return NextResponse.json({
      url: data?.signedUrl || null,
    });
  } catch (err) {
    console.error("Cage image URL error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get URL" },
      { status: 500 }
    );
  }
}

