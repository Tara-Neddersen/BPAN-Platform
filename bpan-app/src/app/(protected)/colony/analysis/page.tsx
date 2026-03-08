import { renderColonyPageView } from "../page";

export default async function ColonyAnalysisPage() {
  return renderColonyPageView({
    defaultTab: "analysis",
    title: "Analysis",
    description: "Compare cohorts, visualize trends, and export analysis-ready results.",
    showTabList: false,
  });
}
