import { renderColonyPageView } from "../colony-page-view";

export default async function ColonyPiAccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ create?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;

  return renderColonyPageView({
    defaultTab: "pi",
    title: "PI Access",
    description: "Manage read-only PI/advisor access to colony and experiment data.",
    showTabList: false,
    initialOpenPiAccessDialog: params?.create === "1",
  });
}
