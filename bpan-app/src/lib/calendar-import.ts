import type { SupabaseClient } from "@supabase/supabase-js";

export type ExternalCalendarImportEvent = {
  provider: "google" | "outlook";
  providerEventId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt?: string | null;
  allDay: boolean;
  status?: string | null;
  providerUrl?: string | null;
  updatedAt?: string | null;
};

function mapStatus(input?: string | null) {
  const v = String(input || "").toLowerCase();
  if (["completed", "done"].includes(v)) return "completed";
  if (["cancelled", "canceled"].includes(v)) return "cancelled";
  if (["in_progress", "in progress", "tentative"].includes(v)) return "in_progress";
  return "scheduled";
}

export async function importExternalCalendarEventsToWorkspace(
  supabase: SupabaseClient,
  userId: string,
  events: ExternalCalendarImportEvent[]
) {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const ev of events) {
    const sourceType = `${ev.provider}_calendar_import`;
    const sourceId = ev.providerEventId;

    const { data: existing, error: findErr } = await supabase
      .from("workspace_calendar_events")
      .select("id, metadata")
      .eq("user_id", userId)
      .eq("source_type", sourceType)
      .eq("source_id", sourceId)
      .maybeSingle();
    if (findErr) {
      errors.push(findErr.message);
      continue;
    }

    const payload = {
      title: ev.title || `${ev.provider} event`,
      description: ev.description || null,
      start_at: ev.startAt,
      end_at: ev.endAt || null,
      all_day: ev.allDay,
      status: mapStatus(ev.status),
      category: "external_sync",
      location: ev.location || null,
      source_type: sourceType,
      source_id: sourceId,
      source_label: `${ev.provider} calendar`,
      metadata: {
        provider: ev.provider,
        provider_event_id: ev.providerEventId,
        provider_url: ev.providerUrl || null,
        provider_updated_at: ev.updatedAt || null,
        imported_at: new Date().toISOString(),
      },
    };

    if (existing) {
      const meta = (existing.metadata as Record<string, unknown> | null) || {};
      if (meta.skip_provider_import === true) {
        skipped++;
        continue;
      }
      const { error: upErr } = await supabase
        .from("workspace_calendar_events")
        .update(payload)
        .eq("id", existing.id)
        .eq("user_id", userId);
      if (upErr) {
        errors.push(upErr.message);
        continue;
      }
      updated++;
    } else {
      const { error: insErr } = await supabase
        .from("workspace_calendar_events")
        .insert({ user_id: userId, ...payload });
      if (insErr) {
        errors.push(insErr.message);
        continue;
      }
      created++;
    }
  }

  return { created, updated, skipped, errors: errors.slice(0, 20) };
}
