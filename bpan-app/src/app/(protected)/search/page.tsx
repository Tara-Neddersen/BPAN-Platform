import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SearchBar } from "@/components/search-bar";
import { PaperList } from "@/components/paper-list";
import { Pagination } from "@/components/pagination";
import { searchPubMed, RESULTS_PER_PAGE } from "@/lib/pubmed";
import { savePaper, unsavePaper } from "@/app/(protected)/library/actions";

interface SearchPageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

async function SearchResults({ query, page }: { query: string; page: number }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const result = await searchPubMed(query, page);

  // Get saved PMIDs for this user
  let savedPmids: Set<string> = new Set();
  if (user) {
    const { data: saved } = await supabase
      .from("saved_papers")
      .select("pmid")
      .eq("user_id", user.id);
    savedPmids = new Set((saved ?? []).map((s: { pmid: string }) => s.pmid));
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {result.totalCount.toLocaleString()} results for &ldquo;{result.query}&rdquo;
      </p>
      <PaperList
        papers={result.papers}
        savedPmids={savedPmids}
        saveAction={savePaper}
        unsaveAction={unsavePaper}
      />
      <Pagination
        totalCount={result.totalCount}
        perPage={RESULTS_PER_PAGE}
        currentPage={page}
      />
    </>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.q ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Search Results</h1>
      </div>

      <SearchBar defaultQuery={query} />

      {query ? (
        <Suspense
          fallback={
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Searching PubMed...</p>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-40 animate-pulse rounded-lg border bg-muted"
                />
              ))}
            </div>
          }
        >
          <SearchResults query={query} page={page} />
        </Suspense>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            Enter a search term above to find papers on PubMed.
          </p>
        </div>
      )}
    </div>
  );
}
