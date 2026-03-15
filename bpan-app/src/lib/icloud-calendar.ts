import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

export type IcloudCalendarFeedRow = {
  id: string;
  user_id: string;
  label: string;
  feed_url: string;
  last_synced_at: string | null;
  last_error: string | null;
};

type ParsedIcsEvent = {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  status: string | null;
  url: string | null;
  updatedAt: string | null;
};

function unfoldIcsLines(ics: string) {
  return ics
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .map((line) => line.trimEnd());
}

function decodeIcsText(value: string) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parsePropertyLine(line: string) {
  const colonIndex = line.indexOf(":");
  if (colonIndex < 0) return null;
  const rawName = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [name, ...paramParts] = rawName.split(";");
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const [k, v] = part.split("=");
    if (!k || !v) continue;
    params[k.toUpperCase()] = v.replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

function parseIcsDateOnly(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(value: string, timeZone: string) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  const guess = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6])
  ));
  const offset = getTimeZoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset).toISOString();
}

function parseIcsDateTime(value: string, tzid?: string) {
  if (/^\d{8}$/.test(value)) return parseIcsDateOnly(value);
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const iso = value.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      "$1-$2-$3T$4:$5:$6.000Z"
    );
    return iso;
  }
  if (/^\d{8}T\d{6}$/.test(value) && tzid) {
    try {
      return zonedDateTimeToUtc(value, tzid);
    } catch {
      // Fall back to a floating local datetime parse if the feed timezone token is not supported by Intl.
    }
  }
  if (/^\d{8}T\d{6}$/.test(value)) {
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
    if (!match) return null;
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6])
    ).toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function minusOneDay(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString();
}

function parseIcsEvents(ics: string): ParsedIcsEvent[] {
  const lines = unfoldIcsLines(ics);
  const events: ParsedIcsEvent[] = [];
  let current: Record<string, { value: string; params: Record<string, string> }> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (!current) continue;
      const startRaw = current.DTSTART;
      const uid = current.UID?.value?.trim();
      const startAt = startRaw ? parseIcsDateTime(startRaw.value, startRaw.params.TZID) : null;
      if (uid && startAt) {
        const endRaw = current.DTEND;
        const isAllDay = startRaw.params.VALUE === "DATE" || /^\d{8}$/.test(startRaw.value);
        let endAt = endRaw ? parseIcsDateTime(endRaw.value, endRaw.params.TZID) : null;
        if (isAllDay && endAt) {
          endAt = minusOneDay(endAt);
          if (startAt.slice(0, 10) === endAt.slice(0, 10)) endAt = null;
        }
        events.push({
          uid,
          title: decodeIcsText(current.SUMMARY?.value || "iCloud event"),
          description: current.DESCRIPTION ? decodeIcsText(current.DESCRIPTION.value) : null,
          location: current.LOCATION ? decodeIcsText(current.LOCATION.value) : null,
          startAt,
          endAt,
          allDay: isAllDay,
          status: current.STATUS?.value || null,
          url: current.URL?.value || null,
          updatedAt: current["LAST-MODIFIED"] ? parseIcsDateTime(current["LAST-MODIFIED"].value, current["LAST-MODIFIED"].params.TZID) : null,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const parsed = parsePropertyLine(line);
    if (!parsed) continue;
    current[parsed.name] = { value: parsed.value, params: parsed.params };
  }

  return events;
}

function sourceIdForFeedEvent(feedId: string, eventUid: string) {
  return `${feedId}:${eventUid}`;
}

export function normalizeIcloudFeedUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Calendar link is required.");
  const normalized = trimmed.replace(/^webcal:\/\//i, "https://");
  const url = new URL(normalized);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Calendar link must use https://, http://, or webcal://.");
  }
  return url.toString();
}

export async function fetchIcloudFeedEvents(feedUrl: string) {
  const response = await fetch(normalizeIcloudFeedUrl(feedUrl), {
    headers: {
      "user-agent": "LabLynx Calendar Importer/1.0",
      accept: "text/calendar,text/plain;q=0.9,*/*;q=0.1",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`iCloud feed fetch failed (${response.status})`);
  }
  const body = await response.text();
  return parseIcsEvents(body);
}

export async function importIcloudCalendarFeedToWorkspace(
  supabase: SupabaseClient,
  userId: string,
  feed: Pick<IcloudCalendarFeedRow, "id" | "label" | "feed_url">
) {
  const providerEvents = await fetchIcloudFeedEvents(feed.feed_url);
  const now = Date.now();
  const horizonPast = now - 30 * 24 * 60 * 60 * 1000;
  const horizonFuture = now + 365 * 24 * 60 * 60 * 1000;
  const importable = providerEvents.filter((ev) => {
    const startMs = new Date(ev.startAt).getTime();
    return !Number.isNaN(startMs) && startMs >= horizonPast && startMs <= horizonFuture;
  });

  const sourceIds = importable.map((ev) => sourceIdForFeedEvent(feed.id, ev.uid));
  const existingRes = sourceIds.length
    ? await supabase
        .from("workspace_calendar_events")
        .select("id,source_id")
        .eq("user_id", userId)
        .eq("source_type", "icloud_external")
        .in("source_id", sourceIds)
    : { data: [] as Array<{ id: string; source_id: string }> };
  const existingBySourceId = new Map((existingRes.data || []).map((row) => [String(row.source_id), String(row.id)]));

  let imported = 0;
  let updated = 0;
  const skipped = 0;
  const errors: string[] = [];

  for (const ev of importable) {
    try {
      const sourceId = sourceIdForFeedEvent(feed.id, ev.uid);
      const payload = {
        user_id: userId,
        title: ev.title || feed.label || "iCloud Calendar event",
        description: ev.description,
        location: ev.location,
        start_at: ev.startAt,
        end_at: ev.endAt,
        all_day: ev.allDay,
        status: ev.status && /cancelled|canceled/i.test(ev.status) ? "cancelled" : "scheduled",
        category: "external",
        source_type: "icloud_external",
        source_id: sourceId,
        source_label: feed.label || "iCloud Calendar",
        metadata: {
          provider: "icloud",
          provider_event_id: ev.uid,
          provider_url: ev.url,
          provider_updated_at: ev.updatedAt,
          icloud_feed_id: feed.id,
          icloud_feed_label: feed.label,
          icloud_feed_url: feed.feed_url,
          imported_at: new Date().toISOString(),
        },
      };
      const existingId = existingBySourceId.get(sourceId);
      if (existingId) {
        const { error } = await supabase
          .from("workspace_calendar_events")
          .update(payload)
          .eq("id", existingId)
          .eq("user_id", userId);
        if (error) {
          errors.push(error.message);
          continue;
        }
        updated++;
      } else {
        const { error } = await supabase.from("workspace_calendar_events").insert(payload);
        if (error) {
          errors.push(error.message);
          continue;
        }
        imported++;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "icloud_import_failed");
    }
  }

  await refreshWorkspaceBackstageIndexBestEffort(supabase, userId);
  return {
    imported,
    updated,
    skipped,
    scanned: providerEvents.length,
    errors: errors.slice(0, 20),
  };
}
