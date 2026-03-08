import { redirect } from "next/navigation";

type Params = Promise<Record<string, string | string[] | undefined>>;

const PANEL_ALIASES: Record<string, string> = {
  reagents: "reagents",
  inventory: "reagents",
  booking: "equipment-booking",
  bookings: "equipment-booking",
  equipment: "equipment-booking",
  "equipment-booking": "equipment-booking",
  chat: "lab-chat",
  "lab-chat": "lab-chat",
  announcements: "announcements",
  inspection: "inspection-tasks",
  "inspection-tasks": "inspection-tasks",
  tasks: "general-tasks",
  "general-tasks": "general-tasks",
};

function getSingle(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizePanel(rawPanel: string | null) {
  if (!rawPanel) return null;
  return PANEL_ALIASES[rawPanel] ?? rawPanel;
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams?: Params;
}) {
  const params = searchParams ? await searchParams : {};
  const panel = normalizePanel(getSingle(params.panel));
  const tab = getSingle(params.tab);

  const next = new URLSearchParams();
  if (panel) next.set("panel", panel);
  if (!panel && tab) next.set("panel", normalizePanel(tab) ?? tab);

  redirect(next.size > 0 ? `/labs?${next.toString()}` : "/labs");
}
