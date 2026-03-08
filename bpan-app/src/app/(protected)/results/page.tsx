import { redirect } from "next/navigation";
import type { ResultsSearchParams } from "./results-view";

export default async function ResultsPage({
  searchParams,
}: {
  searchParams?: Promise<ResultsSearchParams>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const next = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) next.set(key, value);
    }
  }
  const query = next.toString();
  redirect(query ? `/colony/results?${query}` : "/colony/results");
}
