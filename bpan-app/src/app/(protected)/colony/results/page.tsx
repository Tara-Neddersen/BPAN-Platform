import { renderColonyPageView } from "../colony-page-view";

export default async function ColonyResultsPage() {
  return renderColonyPageView({
    defaultTab: "results",
    title: "Results",
    description: "Record and manage colony experiment result data.",
    showTabList: false,
  });
}
