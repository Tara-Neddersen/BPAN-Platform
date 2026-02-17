import { createClient } from "@/lib/supabase/server";
import { MemoryClient } from "@/components/memory-client";
import type { AIMemory } from "@/types";
import { createMemory, updateMemory, deleteMemory, togglePin } from "./actions";

export default async function MemoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memories } = await supabase
    .from("ai_memory")
    .select("*")
    .eq("user_id", user.id)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Memory</h1>
        <p className="text-muted-foreground">
          Everything the AI remembers about your research. Pinned items are always included in every AI interaction.
          Auto-learned facts come from your advisor chats, meetings, and paper analysis.
        </p>
      </div>

      <MemoryClient
        memories={(memories || []) as AIMemory[]}
        actions={{ createMemory, updateMemory, deleteMemory, togglePin }}
      />
    </div>
  );
}

