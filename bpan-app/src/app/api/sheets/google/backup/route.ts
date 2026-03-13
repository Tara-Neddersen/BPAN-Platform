import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createGoogleSpreadsheet,
  refreshGoogleSheetsToken,
  writeGoogleSpreadsheetTabs,
} from "@/lib/google-sheets";
import {
  buildColonyResultsSheets,
  buildResultsWorkspaceSheets,
  type ExportSheet,
} from "@/lib/results-export";
import type { Analysis, Dataset, Figure, Animal, Cohort, ColonyResult } from "@/types";

type ResultsDatasetRecord = Dataset & {
  experiment_run_id?: string | null;
  result_schema_id?: string | null;
  schema_snapshot?: unknown;
};

function sheetRowsToValues(sheet: ExportSheet) {
  if (sheet.rows.length === 0) return [[""]];
  const headers = Object.keys(sheet.rows[0]);
  return [
    headers,
    ...sheet.rows.map((row) =>
      headers.map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return "";
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          return value;
        }
        return JSON.stringify(value);
      })
    ),
  ];
}

async function withFreshToken() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("google_sheets_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .single();

  if (tokenErr || !tokenRow) {
    return { error: "Google Sheets not connected", status: 400 as const };
  }

  let accessToken = String(tokenRow.access_token);
  if (new Date(String(tokenRow.expires_at)).getTime() < Date.now() + 60_000) {
    const refreshed = await refreshGoogleSheetsToken(String(tokenRow.refresh_token));
    accessToken = refreshed.access_token;
    await supabase
      .from("google_sheets_tokens")
      .update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("user_id", user.id);
  }

  return { supabase, user, accessToken };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const target = body?.target === "colony_results" ? "colony_results" : "results_workspace";

    const auth = await withFreshToken();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    let sheets: ExportSheet[] = [];
    let title = "";

    if (target === "results_workspace") {
      const [
        { data: datasets, error: datasetsError },
        { data: analyses, error: analysesError },
        { data: figures, error: figuresError },
      ] = await Promise.all([
        auth.supabase.from("datasets").select("*").eq("user_id", auth.user.id).order("created_at", { ascending: false }),
        auth.supabase.from("analyses").select("*").eq("user_id", auth.user.id).order("created_at", { ascending: false }),
        auth.supabase.from("figures").select("*").eq("user_id", auth.user.id).order("created_at", { ascending: false }),
      ]);

      if (datasetsError || analysesError || figuresError) {
        throw new Error(datasetsError?.message || analysesError?.message || figuresError?.message || "Failed to load results workspace data");
      }

      sheets = buildResultsWorkspaceSheets(
        (datasets || []) as ResultsDatasetRecord[],
        (analyses || []) as Analysis[],
        (figures || []) as Figure[]
      );
      title = `BPAN Results Backup ${new Date().toISOString().slice(0, 10)}`;
    } else {
      const [
        { data: animals, error: animalsError },
        { data: cohorts, error: cohortsError },
        { data: colonyResults, error: colonyResultsError },
      ] = await Promise.all([
        auth.supabase.from("animals").select("*").eq("user_id", auth.user.id).order("identifier"),
        auth.supabase.from("cohorts").select("*").eq("user_id", auth.user.id).order("name"),
        auth.supabase.from("colony_results").select("*").eq("user_id", auth.user.id).order("recorded_at", { ascending: false }),
      ]);

      if (animalsError || cohortsError || colonyResultsError) {
        throw new Error(animalsError?.message || cohortsError?.message || colonyResultsError?.message || "Failed to load colony results");
      }

      sheets = buildColonyResultsSheets(
        (colonyResults || []) as ColonyResult[],
        (animals || []) as Animal[],
        (cohorts || []) as Cohort[]
      );
      title = `BPAN Colony Results Backup ${new Date().toISOString().slice(0, 10)}`;
    }

    const created = await createGoogleSpreadsheet(
      auth.accessToken,
      title,
      sheets.map((sheet) => sheet.title)
    );

    await writeGoogleSpreadsheetTabs(
      auth.accessToken,
      created.spreadsheetId,
      sheets.map((sheet) => ({
        title: sheet.title,
        values: sheetRowsToValues(sheet),
      }))
    );

    return NextResponse.json({
      success: true,
      target,
      spreadsheetId: created.spreadsheetId,
      spreadsheetUrl: created.spreadsheetUrl,
      sheetCount: sheets.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create Google Sheets backup" },
      { status: 500 }
    );
  }
}
