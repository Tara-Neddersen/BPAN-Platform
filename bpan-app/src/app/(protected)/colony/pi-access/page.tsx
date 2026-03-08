import { renderColonyPageView } from "../page";

export default async function ColonyPiAccessPage() {
  return renderColonyPageView({
    defaultTab: "pi",
    title: "PI Access",
    description: "Manage read-only PI/advisor access to colony and experiment data.",
    showTabList: false,
  });
}
