import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_BASE_URL = "https://api.quartzy.com";

type QuartzyInventoryItem = Record<string, unknown>;
type LabRow = { id: string; name: string };
type ReagentRow = {
  id: string;
  lab_id: string;
  name: string | null;
  catalog_number: string | null;
  quantity: number | null;
  reorder_threshold: number | null;
};
type QuartzyLinkRow = {
  id: string;
  lab_id: string;
  lab_reagent_id: string;
  quartzy_item_id: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function quartzyHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function asObject(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function parseNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractItemId(item: QuartzyInventoryItem) {
  const candidates = [item.id, item.uuid, item.inventory_item_id, item.item_id];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

function extractCatalogNumber(item: QuartzyInventoryItem) {
  const nested = asObject(item.item);
  const candidates = [
    item.catalog_number,
    item.catalogNumber,
    item.sku,
    nested.catalog_number,
    nested.catalogNumber,
    nested.sku,
  ];
  for (const candidate of candidates) {
    const value = normalizeText(candidate);
    if (value) return value;
  }
  return "";
}

function extractItemName(item: QuartzyInventoryItem) {
  const nested = asObject(item.item);
  const candidates = [item.name, item.item_name, item.title, nested.name];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

function extractTypeName(item: QuartzyInventoryItem) {
  const typeObj = asObject(item.type);
  const candidates = [item.type_name, typeObj.name, item.category, item.category_name];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

function extractVendor(item: QuartzyInventoryItem) {
  const vendorObj = asObject(item.vendor);
  const candidates = [item.vendor_name, item.supplier, vendorObj.name];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

function extractLabContext(item: QuartzyInventoryItem) {
  const labObj = asObject(item.lab);
  const candidatesId = [item.lab_id, labObj.id];
  const candidatesName = [item.lab_name, labObj.name];

  let labId = "";
  let labName = "";
  for (const value of candidatesId) {
    const parsed = String(value ?? "").trim();
    if (parsed) {
      labId = parsed;
      break;
    }
  }
  for (const value of candidatesName) {
    const parsed = String(value ?? "").trim();
    if (parsed) {
      labName = parsed;
      break;
    }
  }
  return { labId, labName };
}

function extractQuantity(item: QuartzyInventoryItem) {
  const candidates = [
    item.quantity,
    item.qty,
    item.stock,
    item.available_quantity,
    item.on_hand_quantity,
    item.quantity_on_hand,
  ];
  for (const candidate of candidates) {
    const parsed = parseNumeric(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function classifyItem(item: QuartzyInventoryItem) {
  const haystack = `${extractTypeName(item)} ${extractItemName(item)}`.toLowerCase();
  if (
    /(reagent|chemical|antibody|primer|buffer|media|cell culture|enzyme|protein|compound|solution|stain|dye|plasmid)/.test(
      haystack,
    )
  ) {
    return "reagent" as const;
  }
  if (/(equipment|instrument|device|hardware|electronics|tool|machine)/.test(haystack)) {
    return "equipment" as const;
  }
  return "other" as const;
}

async function fetchQuartzyInventoryItems({
  baseUrl,
  token,
  maxPages,
  perPage,
  quartzyLabId,
}: {
  baseUrl: string;
  token: string;
  maxPages: number;
  perPage: number;
  quartzyLabId: string | null;
}) {
  const all: QuartzyInventoryItem[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL("/inventory-items", baseUrl);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    if (quartzyLabId) {
      url.searchParams.set("lab_id", quartzyLabId);
    }

    const response = await fetch(url, {
      headers: quartzyHeaders(token),
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Quartzy inventory request failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const payload = (await response.json()) as unknown;
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { data?: unknown[] })?.data)
        ? (payload as { data: unknown[] }).data
        : Array.isArray((payload as { inventory_items?: unknown[] })?.inventory_items)
          ? (payload as { inventory_items: unknown[] }).inventory_items
          : [];

    if (rows.length === 0) break;
    all.push(...(rows as QuartzyInventoryItem[]));
    if (rows.length < perPage) break;
  }

  return all;
}

function resolveTargetLabId({
  explicitLabId,
  labMap,
  quartzyLabId,
  quartzyLabName,
  labs,
}: {
  explicitLabId: string | null;
  labMap: Record<string, string>;
  quartzyLabId: string;
  quartzyLabName: string;
  labs: LabRow[];
}) {
  if (explicitLabId) return explicitLabId;
  if (quartzyLabId && labMap[quartzyLabId]) return labMap[quartzyLabId];

  if (quartzyLabName) {
    const byName = labs.find((lab) => lab.name.trim().toLowerCase() === quartzyLabName.trim().toLowerCase());
    if (byName) return byName.id;
  }

  if (labs.length === 1) return labs[0].id;
  return null;
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const secret =
      process.env.QUARTZY_CRON_SECRET ||
      process.env.CRON_SECRET ||
      process.env.DIGEST_CRON_SECRET;
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const quartzyToken = process.env.QUARTZY_ACCESS_TOKEN;
    const quartzyBaseUrl = process.env.QUARTZY_API_BASE_URL || DEFAULT_BASE_URL;
    const labMapJson = process.env.QUARTZY_LAB_MAP_JSON || "{}";
    if (!quartzyToken) {
      return NextResponse.json({ error: "Missing QUARTZY_ACCESS_TOKEN" }, { status: 500 });
    }

    let labMap: Record<string, string> = {};
    try {
      const parsed = JSON.parse(labMapJson);
      labMap = typeof parsed === "object" && parsed ? (parsed as Record<string, string>) : {};
    } catch {
      labMap = {};
    }

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "1";
    const explicitLabId = url.searchParams.get("lab_id");
    const quartzyLabId = url.searchParams.get("quartzy_lab_id");
    const maxPages = Math.max(1, Math.min(20, Number.parseInt(url.searchParams.get("max_pages") ?? "5", 10) || 5));
    const perPage = Math.max(1, Math.min(500, Number.parseInt(url.searchParams.get("per_page") ?? "100", 10) || 100));
    const autoCreate = url.searchParams.get("auto_create") !== "0";

    const admin = createAdminClient();
    const [{ data: labs, error: labsError }, { data: reagents, error: reagentError }, { data: links, error: linksError }] =
      await Promise.all([
        admin.from("labs").select("id,name"),
        admin.from("lab_reagents").select("id,lab_id,name,catalog_number,quantity,reorder_threshold"),
        admin.from("quartzy_inventory_links").select("id,lab_id,lab_reagent_id,quartzy_item_id"),
      ]);

    if (labsError || reagentError || linksError) {
      return NextResponse.json(
        { error: labsError?.message || reagentError?.message || linksError?.message || "Failed loading base data" },
        { status: 500 },
      );
    }

    const labRows = (labs ?? []) as LabRow[];
    const reagentRows = (reagents ?? []) as ReagentRow[];
    const linkRows = (links ?? []) as QuartzyLinkRow[];
    const linkByLabAndItem = new Map<string, QuartzyLinkRow>();
    for (const row of linkRows) {
      linkByLabAndItem.set(`${row.lab_id}:${row.quartzy_item_id}`, row);
    }

    const reagentByLabCatalog = new Map<string, ReagentRow>();
    const reagentByLabName = new Map<string, ReagentRow>();
    for (const row of reagentRows) {
      const catalog = normalizeText(row.catalog_number);
      const name = normalizeText(row.name);
      if (catalog) reagentByLabCatalog.set(`${row.lab_id}:${catalog}`, row);
      if (name) reagentByLabName.set(`${row.lab_id}:${name}`, row);
    }

    const inventoryItems = await fetchQuartzyInventoryItems({
      baseUrl: quartzyBaseUrl,
      token: quartzyToken,
      maxPages,
      perPage,
      quartzyLabId: quartzyLabId || null,
    });

    const summary = {
    dryRun,
    quartzyInventoryFetched: inventoryItems.length,
    reagentsMatched: 0,
    reagentsCreated: 0,
    linksUpserted: 0,
    quantityAdjusted: 0,
    skippedUnmappedLab: 0,
    skippedUnsupportedKind: 0,
    samples: [] as Array<{
      itemId: string;
      itemName: string;
      kind: "reagent" | "equipment" | "other";
      targetLabId: string;
      labReagentId: string;
      quantity: number | null;
    }>,
    };

    for (const item of inventoryItems) {
    const itemId = extractItemId(item);
    if (!itemId) continue;

    const itemName = extractItemName(item) || "Quartzy item";
    const catalog = extractCatalogNumber(item);
    const quantity = extractQuantity(item);
    const kind = classifyItem(item);
    const typeName = extractTypeName(item);
    const vendor = extractVendor(item);
    const labContext = extractLabContext(item);
    const targetLabId = resolveTargetLabId({
      explicitLabId,
      labMap,
      quartzyLabId: labContext.labId,
      quartzyLabName: labContext.labName,
      labs: labRows,
    });

    if (!targetLabId) {
      summary.skippedUnmappedLab += 1;
      continue;
    }

    if (kind !== "reagent") {
      summary.skippedUnsupportedKind += 1;
      continue;
    }

    let targetReagent: ReagentRow | null = null;
    const existingLink = linkByLabAndItem.get(`${targetLabId}:${itemId}`) ?? null;
    if (existingLink) {
      targetReagent = reagentRows.find((row) => row.id === existingLink.lab_reagent_id) ?? null;
    }

    if (!targetReagent) {
      const byCatalog = catalog ? reagentByLabCatalog.get(`${targetLabId}:${catalog}`) : null;
      const byName = itemName ? reagentByLabName.get(`${targetLabId}:${normalizeText(itemName)}`) : null;
      targetReagent = byCatalog ?? byName ?? null;
      if (targetReagent) {
        summary.reagentsMatched += 1;
      }
    }

    if (!targetReagent && autoCreate) {
      if (!dryRun) {
        const { data: created, error: createError } = await admin
          .from("lab_reagents")
          .insert({
            lab_id: targetLabId,
            name: itemName,
            catalog_number: catalog || null,
            supplier: vendor || "Quartzy",
            quantity: quantity ?? 0,
            unit: null,
            notes: "Synced from Quartzy inventory.",
            created_by: null,
          })
          .select("id,lab_id,name,catalog_number,quantity,reorder_threshold")
          .single();
        if (createError) {
          return NextResponse.json({ error: createError.message }, { status: 500 });
        }
        targetReagent = created as ReagentRow;
        reagentRows.push(targetReagent);
        const normalizedName = normalizeText(targetReagent.name);
        if (normalizedName) reagentByLabName.set(`${targetLabId}:${normalizedName}`, targetReagent);
        if (catalog) reagentByLabCatalog.set(`${targetLabId}:${catalog}`, targetReagent);
      } else {
        targetReagent = {
          id: `dryrun:${itemId}`,
          lab_id: targetLabId,
          name: itemName,
          catalog_number: catalog || null,
          quantity: quantity ?? 0,
          reorder_threshold: null,
        };
      }
      summary.reagentsCreated += 1;
    }

    if (!targetReagent) {
      continue;
    }

    if (!dryRun && quantity !== null && targetReagent.id && !targetReagent.id.startsWith("dryrun:")) {
      const currentQuantity = typeof targetReagent.quantity === "number" ? targetReagent.quantity : 0;
      const delta = quantity - currentQuantity;
      if (Math.abs(delta) > 0.000001) {
        const { error: stockEventError } = await admin.from("lab_reagent_stock_events").insert({
          lab_reagent_id: targetReagent.id,
          event_type: "adjust",
          quantity_delta: delta,
          unit: null,
          vendor: "Quartzy",
          reference_number: `quartzy_item:${itemId}`,
          notes: "Quartzy inventory sync adjustment.",
          created_by: null,
        });
        if (stockEventError) {
          return NextResponse.json({ error: stockEventError.message }, { status: 500 });
        }

        const threshold = targetReagent.reorder_threshold;
        const { error: reagentUpdateError } = await admin
          .from("lab_reagents")
          .update({
            quantity,
            needs_reorder: threshold !== null ? quantity <= threshold : false,
            last_ordered_at: new Date().toISOString(),
          })
          .eq("id", targetReagent.id);
        if (reagentUpdateError) {
          return NextResponse.json({ error: reagentUpdateError.message }, { status: 500 });
        }
        targetReagent.quantity = quantity;
        summary.quantityAdjusted += 1;
      }
    }

    if (!dryRun && !targetReagent.id.startsWith("dryrun:")) {
      const { error: linkError } = await admin.from("quartzy_inventory_links").upsert(
        {
          lab_id: targetLabId,
          lab_reagent_id: targetReagent.id,
          quartzy_item_id: itemId,
          quartzy_lab_id: labContext.labId || null,
          quartzy_lab_name: labContext.labName || null,
          quartzy_type_name: typeName || null,
          quartzy_vendor: vendor || null,
          quartzy_catalog_number: catalog || null,
          quartzy_quantity: quantity,
          item_kind: kind,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "lab_id,quartzy_item_id" },
      );
      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 500 });
      }
      summary.linksUpserted += 1;
    }

    summary.samples.push({
      itemId,
      itemName,
      kind,
      targetLabId,
      labReagentId: targetReagent.id,
      quantity,
    });
    }

    return NextResponse.json({
      success: true,
      ranAt: new Date().toISOString(),
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Quartzy inventory sync failed." },
      { status: 500 },
    );
  }
}
