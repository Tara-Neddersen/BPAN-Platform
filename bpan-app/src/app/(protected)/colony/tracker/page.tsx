import { renderColonyPageView } from "../page";

export default async function ColonyTrackerPage() {
  return renderColonyPageView({
    defaultTab: "tracker",
    title: "Colony Tracker",
    description: "Track and update colony experiment progress.",
    showTabList: false,
  });
}
