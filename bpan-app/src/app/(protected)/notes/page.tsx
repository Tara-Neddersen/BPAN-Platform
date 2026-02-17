import { createClient } from "@/lib/supabase/server";
import { NoteCard } from "@/components/note-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SemanticSearch } from "@/components/semantic-search";
import { ExportButtons } from "@/components/export-buttons";
import type { NoteWithPaper } from "@/types";
import Link from "next/link";

interface NotesPageProps {
  searchParams: Promise<{ q?: string; tag?: string; type?: string }>;
}

export default async function NotesPage({ searchParams }: NotesPageProps) {
  const params = await searchParams;
  const searchQuery = params.q ?? "";
  const filterTag = params.tag ?? "";
  const filterType = params.type ?? "";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase
    .from("notes")
    .select("*, saved_papers(title, pmid, journal)")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  if (filterType) {
    query = query.eq("note_type", filterType);
  }

  if (filterTag) {
    query = query.contains("tags", [filterTag]);
  }

  const { data: notes } = await query;

  let typedNotes = (notes ?? []) as NoteWithPaper[];

  // Client-side text search filter (Supabase free tier doesn't have full-text search)
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    typedNotes = typedNotes.filter(
      (n) =>
        n.content.toLowerCase().includes(q) ||
        (n.highlight_text && n.highlight_text.toLowerCase().includes(q)) ||
        n.saved_papers.title.toLowerCase().includes(q)
    );
  }

  // Collect all unique tags for the filter sidebar
  const allTags: Record<string, number> = {};
  for (const note of (notes ?? []) as NoteWithPaper[]) {
    for (const tag of note.tags) {
      allTags[tag] = (allTags[tag] || 0) + 1;
    }
  }
  const sortedTags = Object.entries(allTags).sort((a, b) => b[1] - a[1]);

  const noteTypes = ["finding", "method", "limitation", "general"];

  // Check if any notes lack embeddings (for backfill prompt)
  const totalNotes = (notes ?? []).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All your notes across all papers. Filter by tag, type, or search.
          </p>
        </div>
        <ExportButtons noteCount={totalNotes} />
      </div>

      {/* Standard text search */}
      <form className="flex gap-2">
        <Input
          name="q"
          type="text"
          placeholder="Search notes by keyword..."
          defaultValue={searchQuery}
          className="max-w-md"
        />
        {filterTag && <input type="hidden" name="tag" value={filterTag} />}
        {filterType && <input type="hidden" name="type" value={filterType} />}
        <button type="submit" className="sr-only">Search</button>
      </form>

      {/* Semantic search */}
      <SemanticSearch />

      <div className="flex gap-6">
        {/* Sidebar: tags + type filters */}
        <aside className="hidden md:block w-48 shrink-0 space-y-4">
          {/* Type filter */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Type</h3>
            <div className="space-y-1">
              <Link
                href={buildFilterUrl("", filterTag, searchQuery)}
                className={`block text-sm px-2 py-1 rounded hover:bg-muted ${!filterType ? "bg-muted font-medium" : "text-muted-foreground"}`}
              >
                All types
              </Link>
              {noteTypes.map((type) => (
                <Link
                  key={type}
                  href={buildFilterUrl(type, filterTag, searchQuery)}
                  className={`block text-sm px-2 py-1 rounded capitalize hover:bg-muted ${filterType === type ? "bg-muted font-medium" : "text-muted-foreground"}`}
                >
                  {type}
                </Link>
              ))}
            </div>
          </div>

          {/* Tag filter */}
          {sortedTags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Tags</h3>
              <div className="flex flex-wrap gap-1">
                {filterTag && (
                  <Link href={buildFilterUrl(filterType, "", searchQuery)}>
                    <Badge variant="outline" className="text-xs cursor-pointer">
                      Clear filter
                    </Badge>
                  </Link>
                )}
                {sortedTags.map(([tag, count]) => (
                  <Link key={tag} href={buildFilterUrl(filterType, tag, searchQuery)}>
                    <Badge
                      variant={filterTag === tag ? "default" : "secondary"}
                      className="text-xs cursor-pointer"
                    >
                      {tag} ({count})
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Notes list */}
        <div className="flex-1 space-y-3">
          {typedNotes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-muted-foreground">
                {searchQuery || filterTag || filterType
                  ? "No notes match your filters."
                  : "No notes yet. Save a paper and start annotating."}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {typedNotes.length} note{typedNotes.length !== 1 ? "s" : ""}
                {filterTag && <> tagged &ldquo;{filterTag}&rdquo;</>}
                {filterType && <> of type &ldquo;{filterType}&rdquo;</>}
                {searchQuery && <> matching &ldquo;{searchQuery}&rdquo;</>}
              </p>
              {typedNotes.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function buildFilterUrl(type: string, tag: string, q: string): string {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (tag) params.set("tag", tag);
  if (q) params.set("q", q);
  const qs = params.toString();
  return `/notes${qs ? `?${qs}` : ""}`;
}
