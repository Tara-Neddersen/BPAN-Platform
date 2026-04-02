import { renderColonyPageView } from "./colony-page-view";

export default async function ColonyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cohort?: string; create?: string }>;
}) {
  const params = await searchParams;
  const defaultTab = params?.tab || "animals";
  const initialFilterCohort = params?.cohort || "all";
  const initialOpenAnimalDialog = params?.create === "animal";

  return renderColonyPageView({ defaultTab, initialFilterCohort, initialOpenAnimalDialog });
}
