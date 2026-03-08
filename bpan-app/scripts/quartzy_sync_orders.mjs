#!/usr/bin/env node

/**
 * Quartzy -> BPAN reagent reorder status sync.
 *
 * Maps Quartzy order request statuses into lab reagent stock events:
 * - placed-ish statuses   -> reorder_placed
 * - delivered-ish statuses -> reorder_received
 *
 * Matching priority:
 * 1) catalog number exact
 * 2) reagent name exact
 *
 * Usage:
 *   node scripts/quartzy_sync_orders.mjs
 *   node scripts/quartzy_sync_orders.mjs --apply
 *   node scripts/quartzy_sync_orders.mjs --lab-id <uuid>
 *   node scripts/quartzy_sync_orders.mjs --max-pages 3 --per-page 100 --apply
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   QUARTZY_ACCESS_TOKEN
 *
 * Optional env:
 *   QUARTZY_API_BASE_URL (default: https://api.quartzy.com)
 */

import { createClient } from "@supabase/supabase-js";

const DEFAULT_BASE_URL = "https://api.quartzy.com";
const PLACED_STATUSES = new Set([
  "approved",
  "ordered",
  "order_placed",
  "processing",
  "shipped",
  "in_transit",
  "partially_received",
]);
const RECEIVED_STATUSES = new Set([
  "delivered",
  "received",
  "complete",
  "completed",
  "fulfilled",
]);

function parseArgs(argv) {
  const options = {
    dryRun: true,
    labId: null,
    maxPages: 5,
    perPage: 100,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.dryRun = false;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--lab-id") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value for --lab-id.");
      options.labId = value;
      index += 1;
      continue;
    }
    if (arg === "--max-pages") {
      const value = Number.parseInt(argv[index + 1] ?? "", 10);
      if (!Number.isInteger(value) || value <= 0) throw new Error("Invalid --max-pages value.");
      options.maxPages = value;
      index += 1;
      continue;
    }
    if (arg === "--per-page") {
      const value = Number.parseInt(argv[index + 1] ?? "", 10);
      if (!Number.isInteger(value) || value <= 0 || value > 500) throw new Error("Invalid --per-page value.");
      options.perPage = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { ...options, help: false };
}

function printHelp() {
  console.log("Quartzy order sync");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/quartzy_sync_orders.mjs");
  console.log("  node scripts/quartzy_sync_orders.mjs --apply");
  console.log("  node scripts/quartzy_sync_orders.mjs --lab-id <uuid> --apply");
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function extractStatus(order) {
  const candidates = [
    order?.status,
    order?.state,
    order?.request_status,
    order?.order_status,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) return normalized;
  }
  return "";
}

function extractOrderId(order) {
  return String(
    order?.id ??
      order?.uuid ??
      order?.request_id ??
      order?.order_id ??
      "",
  ).trim();
}

function extractCatalogNumber(order) {
  const candidates = [
    order?.catalog_number,
    order?.sku,
    order?.item?.catalog_number,
    order?.item?.sku,
    order?.inventory_item?.catalog_number,
    order?.inventory_item?.sku,
    order?.product?.catalog_number,
    order?.product?.sku,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) return normalized;
  }
  return "";
}

function extractName(order) {
  const candidates = [
    order?.name,
    order?.item_name,
    order?.item?.name,
    order?.inventory_item?.name,
    order?.product?.name,
    order?.title,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) return normalized;
  }
  return "";
}

function resolveEventType(status) {
  if (RECEIVED_STATUSES.has(status)) return "reorder_received";
  if (PLACED_STATUSES.has(status)) return "reorder_placed";
  return null;
}

async function fetchQuartzyOrders({ baseUrl, token, perPage, maxPages }) {
  const all = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL("/order-requests", baseUrl);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Quartzy request failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.order_requests)
          ? payload.order_requests
          : [];

    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < perPage) break;
  }

  return all;
}

async function main() {
  const { help, dryRun, labId, maxPages, perPage } = parseArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    process.exit(0);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const quartzyToken = process.env.QUARTZY_ACCESS_TOKEN;
  const quartzyBaseUrl = process.env.QUARTZY_API_BASE_URL || DEFAULT_BASE_URL;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!quartzyToken) {
    throw new Error("Missing QUARTZY_ACCESS_TOKEN.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: reagents, error: reagentsError } = labId
    ? await supabase
        .from("lab_reagents")
        .select("id,lab_id,name,catalog_number,unit")
        .eq("lab_id", labId)
    : await supabase
        .from("lab_reagents")
        .select("id,lab_id,name,catalog_number,unit");

  if (reagentsError) throw new Error(`Failed loading lab_reagents: ${reagentsError.message}`);

  const reagentRows = reagents ?? [];
  const byCatalog = new Map();
  const byName = new Map();
  for (const reagent of reagentRows) {
    const cat = normalizeText(reagent.catalog_number);
    const name = normalizeText(reagent.name);
    if (cat && !byCatalog.has(cat)) byCatalog.set(cat, reagent);
    if (name && !byName.has(name)) byName.set(name, reagent);
  }

  const quartzyOrders = await fetchQuartzyOrders({
    baseUrl: quartzyBaseUrl,
    token: quartzyToken,
    maxPages,
    perPage,
  });

  const summary = {
    dryRun,
    quartzyOrdersFetched: quartzyOrders.length,
    statusMapped: 0,
    matchedReagents: 0,
    insertedEvents: 0,
    skippedUnknownReagent: 0,
    skippedDuplicateEvent: 0,
    skippedUnsupportedStatus: 0,
    samples: [],
  };

  for (const order of quartzyOrders) {
    const orderId = extractOrderId(order);
    const status = extractStatus(order);
    const eventType = resolveEventType(status);
    if (!eventType || !orderId) {
      summary.skippedUnsupportedStatus += 1;
      continue;
    }
    summary.statusMapped += 1;

    const catalog = extractCatalogNumber(order);
    const name = extractName(order);
    const reagent = (catalog ? byCatalog.get(catalog) : null) || (name ? byName.get(name) : null);

    if (!reagent) {
      summary.skippedUnknownReagent += 1;
      continue;
    }
    summary.matchedReagents += 1;

    const referenceNumber = `quartzy:${orderId}`;
    const { data: existingEvent, error: eventLookupError } = await supabase
      .from("lab_reagent_stock_events")
      .select("id")
      .eq("lab_reagent_id", reagent.id)
      .eq("reference_number", referenceNumber)
      .eq("event_type", eventType)
      .maybeSingle();

    if (eventLookupError) {
      throw new Error(`Event lookup failed for reagent ${reagent.id}: ${eventLookupError.message}`);
    }
    if (existingEvent?.id) {
      summary.skippedDuplicateEvent += 1;
      continue;
    }

    summary.samples.push({
      orderId,
      status,
      eventType,
      labReagentId: reagent.id,
      reagentName: reagent.name,
      catalogNumber: reagent.catalog_number,
    });

    if (dryRun) continue;

    const note = `Quartzy sync: ${status || "unknown status"}`;
    const { error: insertError } = await supabase.from("lab_reagent_stock_events").insert({
      lab_reagent_id: reagent.id,
      event_type: eventType,
      quantity_delta: 0,
      unit: reagent.unit || null,
      vendor: "Quartzy",
      reference_number: referenceNumber,
      notes: note,
      created_by: null,
    });
    if (insertError) {
      throw new Error(`Failed inserting stock event for reagent ${reagent.id}: ${insertError.message}`);
    }

    const nowIso = new Date().toISOString();
    const patch = {
      last_ordered_at: nowIso,
      needs_reorder: eventType === "reorder_received" ? false : true,
    };
    const { error: updateError } = await supabase.from("lab_reagents").update(patch).eq("id", reagent.id);
    if (updateError) {
      throw new Error(`Failed updating reagent ${reagent.id}: ${updateError.message}`);
    }

    summary.insertedEvents += 1;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

