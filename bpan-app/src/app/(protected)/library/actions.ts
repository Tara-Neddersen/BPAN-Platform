"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

export async function savePaper(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const paperData = {
    user_id: user.id,
    pmid: formData.get("pmid") as string,
    title: formData.get("title") as string,
    authors: JSON.parse(formData.get("authors") as string || "[]"),
    journal: formData.get("journal") as string || null,
    pub_date: formData.get("pub_date") as string || null,
    abstract: formData.get("abstract") as string || null,
    doi: formData.get("doi") as string || null,
    pdf_url: formData.get("pdf_url") as string || null,
  };

  const { error } = await supabase
    .from("saved_papers")
    .upsert(paperData, { onConflict: "user_id,pmid" });

  if (error) throw new Error(error.message);
  revalidatePath("/library");
  revalidatePath("/search");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function unsavePaper(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const pmid = formData.get("pmid") as string;

  const { error } = await supabase
    .from("saved_papers")
    .delete()
    .eq("user_id", user.id)
    .eq("pmid", pmid);

  if (error) throw new Error(error.message);
  revalidatePath("/library");
  revalidatePath("/search");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}
