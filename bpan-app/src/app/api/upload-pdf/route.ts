import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Upload a PDF for a saved paper.
 * Stores in Supabase Storage under paper-pdfs/<userId>/<paperId>.pdf
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const paperId = formData.get("paperId") as string | null;

    if (!file || !paperId) {
      return NextResponse.json(
        { error: "file and paperId are required" },
        { status: 400 }
      );
    }

    if (!file.type.includes("pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 400 }
      );
    }

    const storagePath = `${user.id}/${paperId}.pdf`;
    const buffer = await file.arrayBuffer();

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("paper-pdfs")
      .upload(storagePath, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      );
    }

    // Get a signed URL (valid for 1 year)
    const { data: urlData } = await supabase.storage
      .from("paper-pdfs")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

    const pdfUrl = urlData?.signedUrl || null;

    // Save the storage path on the paper record
    await supabase
      .from("saved_papers")
      .update({ pdf_url: storagePath })
      .eq("id", paperId)
      .eq("user_id", user.id);

    return NextResponse.json({ url: pdfUrl });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "Failed to upload PDF" },
      { status: 500 }
    );
  }
}
