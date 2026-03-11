import { createClient } from "@/lib/supabase/server";
import { WritingClient } from "@/components/writing-client";
import type { Figure, PaperOutline } from "@/types";

export default async function WritingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: figures }, { data: outlines }] = await Promise.all([
    supabase.from("figures").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("paper_outlines").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
  ]);

  return (
    <div className="page-shell">
      <section className="section-card card-density-comfy">
        <WritingClient
          figures={(figures as Figure[]) || []}
          initialOutlines={(outlines as PaperOutline[]) || []}
        />
      </section>
    </div>
  );
}
