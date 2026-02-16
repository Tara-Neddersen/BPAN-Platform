"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createWatchlist(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const name = formData.get("name") as string;
  const keywordsRaw = formData.get("keywords") as string;
  const keywords = keywordsRaw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!name || keywords.length === 0) {
    throw new Error("Name and at least one keyword are required");
  }

  const { error } = await supabase.from("watchlists").insert({
    user_id: user.id,
    name,
    keywords,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function updateWatchlist(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const keywordsRaw = formData.get("keywords") as string;
  const keywords = keywordsRaw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!name || keywords.length === 0) {
    throw new Error("Name and at least one keyword are required");
  }

  const { error } = await supabase
    .from("watchlists")
    .update({ name, keywords })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function deleteWatchlist(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const id = formData.get("id") as string;

  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function updateDigestPreference(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const digestEnabled = formData.get("digest_enabled") === "true";

  const { error } = await supabase
    .from("profiles")
    .update({ digest_enabled: digestEnabled })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}
