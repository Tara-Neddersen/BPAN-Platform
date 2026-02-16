import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReaderClient } from "@/components/reader-client";
import { createNote, updateNote, deleteNote } from "./actions";
import type { SavedPaper, Note } from "@/types";

function toDirectUrl(url: string): string | null {
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFileMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveFileMatch[1]}`;
  }
  const driveOpenMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (driveOpenMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveOpenMatch[1]}`;
  }
  if (url.includes("drive.google.com/uc")) return url;
  if (url.startsWith("http")) return url;
  return null;
}

interface PaperPageProps {
  params: Promise<{ id: string }>;
}

export default async function PaperPage({ params }: PaperPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: paper } = await supabase
    .from("saved_papers")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!paper) notFound();

  const { data: notes } = await supabase
    .from("notes")
    .select("*")
    .eq("paper_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  // If paper has a saved Google Drive link, build the proxy URL
  let pdfUrl: string | null = null;
  if (paper.pdf_url) {
    const directUrl = toDirectUrl(paper.pdf_url);
    if (directUrl) {
      pdfUrl = `/api/pdf-proxy?url=${encodeURIComponent(directUrl)}`;
    }
  }

  return (
    <ReaderClient
      paper={paper as SavedPaper}
      notes={(notes ?? []) as Note[]}
      initialPdfUrl={pdfUrl}
      createAction={createNote}
      updateAction={updateNote}
      deleteAction={deleteNote}
    />
  );
}
