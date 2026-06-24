import { renderColonyPageView } from "../colony-page-view";
import { renderResultsView, type ResultsSearchParams } from "../../results/results-view";

export default async function ColonyAnalysisPage({
  searchParams,
}: {
  searchParams?: Promise<ResultsSearchParams>;
}) {
  const params = searchParams ? await searchParams : undefined;

  return renderColonyPageView({
    defaultTab: "analysis",
    title: "Analysis",
    description: "Compare cohorts, visualize trends, and export analysis-ready results.",
    showTabList: false,
    footer: (
      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Data &amp; sources</h2>
          <p className="text-sm text-muted-foreground">
            Import, paste, build, back up, and connect the datasets your analyses run on. Build charts and run
            statistics with the Analysis wizard above.
          </p>
        </div>
        {await renderResultsView(params, { emptyStateVariant: "colony", mode: "dataSource" })}
      </div>
    ),
  });
}
