import { renderColonyPageView } from "../colony-page-view";
import { renderResultsView, type ResultsSearchParams } from "../../results/results-view";

export default async function ColonyResultsPage({
  searchParams,
}: {
  searchParams?: Promise<ResultsSearchParams>;
}) {
  const params = searchParams ? await searchParams : undefined;

  return renderColonyPageView({
    defaultTab: "results",
    title: "Results",
    description: "Record and manage colony experiment result data.",
    showTabList: false,
    footer: (
      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Results Workspace</h2>
          <p className="text-sm text-muted-foreground">
            Unified data import and visualization tools from Results. Use Analysis for colony-level analytics.
          </p>
        </div>
        {await renderResultsView(params, { emptyStateVariant: "colony" })}
      </div>
    ),
  });
}
