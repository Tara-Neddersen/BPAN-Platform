import { createClient } from "@/lib/supabase/server";
import { ExperimentsClient } from "@/components/experiments-client";
import type {
  Experiment,
  ExperimentTimepoint,
  Protocol,
  Reagent,
  AnimalExperiment,
  Animal,
  Cohort,
  ColonyTimepoint,
  WorkspaceCalendarEvent,
  ScheduleTemplate,
  ScheduleDay,
  ScheduleSlot,
  ScheduledBlock,
  ExperimentRun,
  RunScheduleBlock,
  RunAssignment,
} from "@/types";
import type { ExperimentTemplateColumn, ExperimentTemplateProtocolLink, ExperimentTemplateRecord } from "@/components/experiment-template-builder";
import { HelpHint } from "@/components/ui/help-hint";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronDown, FlaskConical, GitBranch, TestTube2 } from "lucide-react";
import type { ReactNode } from "react";
import { buildExperimentTraceabilityCards } from "@/lib/workspace-integration";
import { UI_SURFACE_ACTIONS } from "@/lib/ui-copy";

// Cursor-based pagination helper (same as colony)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(supabase: any, table: string, userId: string): Promise<any[]> {
  const PAGE = 900;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  let lastId: string | null = null;
  while (true) {
    let q = supabase.from(table).select("*").eq("user_id", userId).order("id", { ascending: true }).limit(PAGE);
    if (lastId) q = q.gt("id", lastId);
    const { data, error } = await q;
    if (error) break;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    lastId = data[data.length - 1].id;
    if (data.length < PAGE) break;
  }
  return all;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchExperimentTemplates(supabase: any, userId: string): Promise<{ templates: ExperimentTemplateRecord[]; persistenceEnabled: boolean }> {
  const { data: templates, error: templatesError } = await supabase
    .from("experiment_templates")
    .select("id,title,description,category,default_assignment_scope")
    .eq("owner_user_id", userId)
    .eq("owner_type", "user")
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (templatesError) {
    return { templates: [], persistenceEnabled: false };
  }

  const templateRows = (templates || []) as Array<Record<string, unknown>>;
  const templateIds = templateRows
    .map((template) => (typeof template.id === "string" ? template.id : ""))
    .filter(Boolean);

  let protocolLinksByTemplate = new Map<string, ExperimentTemplateProtocolLink[]>();
  let schemaRowsByTemplate = new Map<string, { id: string; name: string; description: string | null }>();
  let columnsBySchema = new Map<string, ExperimentTemplateColumn[]>();

  if (templateIds.length > 0) {
    const { data: protocolLinks, error: protocolLinksError } = await supabase
      .from("template_protocol_links")
      .select("template_id,protocol_id,sort_order,is_default,notes")
      .in("template_id", templateIds)
      .order("sort_order", { ascending: true });

    if (protocolLinksError) {
      return { templates: [], persistenceEnabled: false };
    }

    protocolLinksByTemplate = (protocolLinks || []).reduce((map: Map<string, ExperimentTemplateProtocolLink[]>, item: Record<string, unknown>) => {
      const templateId = typeof item.template_id === "string" ? item.template_id : "";
      const protocolId = typeof item.protocol_id === "string" ? item.protocol_id : "";
      if (!templateId || !protocolId) {
        return map;
      }

      const nextItem: ExperimentTemplateProtocolLink = {
        protocolId,
        sortOrder: typeof item.sort_order === "number" ? item.sort_order : 0,
        isDefault: Boolean(item.is_default),
        notes: typeof item.notes === "string" ? item.notes : "",
      };

      const existing = map.get(templateId) || [];
      map.set(templateId, [...existing, nextItem]);
      return map;
    }, new Map<string, ExperimentTemplateProtocolLink[]>());

    const { data: resultSchemas, error: resultSchemasError } = await supabase
      .from("result_schemas")
      .select("id,template_id,name,description")
      .in("template_id", templateIds)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (resultSchemasError) {
      return { templates: [], persistenceEnabled: false };
    }

    const schemaRows = (resultSchemas || []) as Array<Record<string, unknown>>;
    const schemaIds = schemaRows
      .map((schema) => (typeof schema.id === "string" ? schema.id : ""))
      .filter(Boolean);

    schemaRowsByTemplate = schemaRows.reduce(
      (map: Map<string, { id: string; name: string; description: string | null }>, item: Record<string, unknown>) => {
        const templateId = typeof item.template_id === "string" ? item.template_id : "";
        const schemaId = typeof item.id === "string" ? item.id : "";
        if (!templateId || !schemaId || map.has(templateId)) {
          return map;
        }

        map.set(templateId, {
          id: schemaId,
          name: typeof item.name === "string" && item.name.trim() ? item.name : "Default schema",
          description: typeof item.description === "string" ? item.description : null,
        });
        return map;
      },
      new Map<string, { id: string; name: string; description: string | null }>(),
    );

    if (schemaIds.length > 0) {
      const { data: resultColumns, error: resultColumnsError } = await supabase
        .from("result_schema_columns")
        .select("schema_id,key,label,column_type,required,default_value,options,unit,help_text,group_key,sort_order,is_system_default,is_enabled")
        .in("schema_id", schemaIds)
        .order("sort_order", { ascending: true });

      if (resultColumnsError) {
        return { templates: [], persistenceEnabled: false };
      }

      columnsBySchema = (resultColumns || []).reduce((map: Map<string, ExperimentTemplateColumn[]>, item: Record<string, unknown>) => {
        const schemaId = typeof item.schema_id === "string" ? item.schema_id : "";
        const key = typeof item.key === "string" ? item.key : "";
        const label = typeof item.label === "string" ? item.label : "";
        if (!schemaId || !key || !label) {
          return map;
        }

        const nextItem: ExperimentTemplateColumn = {
          key,
          label,
          columnType:
            typeof item.column_type === "string" && item.column_type.trim().length > 0
              ? (item.column_type as ExperimentTemplateColumn["columnType"])
              : "text",
          required: Boolean(item.required),
          defaultValue:
            item.default_value == null
              ? ""
              : typeof item.default_value === "string"
                ? item.default_value
                : JSON.stringify(item.default_value),
          options: Array.isArray(item.options)
            ? item.options.filter((option): option is string => typeof option === "string")
            : [],
          unit: typeof item.unit === "string" ? item.unit : "",
          helpText: typeof item.help_text === "string" ? item.help_text : "",
          groupKey: typeof item.group_key === "string" ? item.group_key : "",
          sortOrder: typeof item.sort_order === "number" ? item.sort_order : 0,
          isSystemDefault: Boolean(item.is_system_default),
          isEnabled: item.is_enabled === false ? false : true,
        };

        const existing = map.get(schemaId) || [];
        map.set(schemaId, [...existing, nextItem]);
        return map;
      }, new Map<string, ExperimentTemplateColumn[]>());
    }
  }

  return {
    templates: templateRows.map((template) => {
      const templateId = typeof template.id === "string" ? template.id : "";
      const schema = schemaRowsByTemplate.get(templateId);

      return {
        id: templateId,
        title: typeof template.title === "string" ? template.title : "Untitled template",
        description: typeof template.description === "string" ? template.description : null,
        category: typeof template.category === "string" ? template.category : null,
        defaultAssignmentScope:
          typeof template.default_assignment_scope === "string" ? template.default_assignment_scope : null,
        protocolLinks: protocolLinksByTemplate.get(templateId) || [],
        schema: schema
          ? {
              ...schema,
              columns: columnsBySchema.get(schema.id) || [],
            }
          : null,
      };
    }),
    persistenceEnabled: true,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchScheduleTemplatesForTemplates(supabase: any, templateIds: string[]): Promise<{
  scheduleTemplates: ScheduleTemplate[];
  scheduleDays: ScheduleDay[];
  scheduleSlots: ScheduleSlot[];
  scheduledBlocks: ScheduledBlock[];
  persistenceEnabled: boolean;
}> {
  if (templateIds.length === 0) {
    return {
      scheduleTemplates: [],
      scheduleDays: [],
      scheduleSlots: [],
      scheduledBlocks: [],
      persistenceEnabled: true,
    };
  }

  const { data: scheduleTemplates, error: scheduleTemplatesError } = await supabase
    .from("schedule_templates")
    .select("*")
    .in("template_id", templateIds)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (scheduleTemplatesError) {
    return {
      scheduleTemplates: [],
      scheduleDays: [],
      scheduleSlots: [],
      scheduledBlocks: [],
      persistenceEnabled: false,
    };
  }

  const scheduleTemplateRows = (scheduleTemplates as ScheduleTemplate[]) || [];
  const scheduleTemplateIds = scheduleTemplateRows.map((schedule) => schedule.id);

  if (scheduleTemplateIds.length === 0) {
    return {
      scheduleTemplates: scheduleTemplateRows,
      scheduleDays: [],
      scheduleSlots: [],
      scheduledBlocks: [],
      persistenceEnabled: true,
    };
  }

  const { data: scheduleDays, error: scheduleDaysError } = await supabase
    .from("schedule_days")
    .select("*")
    .in("schedule_template_id", scheduleTemplateIds)
    .order("sort_order", { ascending: true });

  if (scheduleDaysError) {
    return {
      scheduleTemplates: [],
      scheduleDays: [],
      scheduleSlots: [],
      scheduledBlocks: [],
      persistenceEnabled: false,
    };
  }

  const scheduleDayRows = (scheduleDays as ScheduleDay[]) || [];
  const scheduleDayIds = scheduleDayRows.map((day) => day.id);

  if (scheduleDayIds.length === 0) {
    return {
      scheduleTemplates: scheduleTemplateRows,
      scheduleDays: scheduleDayRows,
      scheduleSlots: [],
      scheduledBlocks: [],
      persistenceEnabled: true,
    };
  }

  const { data: scheduleSlots, error: scheduleSlotsError } = await supabase
    .from("schedule_slots")
    .select("*")
    .in("schedule_day_id", scheduleDayIds)
    .order("sort_order", { ascending: true });

  if (scheduleSlotsError) {
    return {
      scheduleTemplates: [],
      scheduleDays: [],
      scheduleSlots: [],
      scheduledBlocks: [],
      persistenceEnabled: false,
    };
  }

  const scheduleSlotRows = (scheduleSlots as ScheduleSlot[]) || [];
  const scheduleSlotIds = scheduleSlotRows.map((slot) => slot.id);

  if (scheduleSlotIds.length === 0) {
    return {
      scheduleTemplates: scheduleTemplateRows,
      scheduleDays: scheduleDayRows,
      scheduleSlots: scheduleSlotRows,
      scheduledBlocks: [],
      persistenceEnabled: true,
    };
  }

  const { data: scheduledBlocks, error: scheduledBlocksError } = await supabase
    .from("scheduled_blocks")
    .select("*")
    .in("schedule_slot_id", scheduleSlotIds)
    .order("sort_order", { ascending: true });

  if (scheduledBlocksError) {
    return {
      scheduleTemplates: [],
      scheduleDays: [],
      scheduleSlots: [],
      scheduledBlocks: [],
      persistenceEnabled: false,
    };
  }

  return {
    scheduleTemplates: scheduleTemplateRows,
    scheduleDays: scheduleDayRows,
    scheduleSlots: scheduleSlotRows,
    scheduledBlocks: (scheduledBlocks as ScheduledBlock[]) || [],
    persistenceEnabled: true,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchRunExecutionData(supabase: any): Promise<{
  runs: ExperimentRun[];
  runScheduleBlocks: RunScheduleBlock[];
  runAssignments: RunAssignment[];
  persistenceEnabled: boolean;
  warning: string | null;
}> {
  const { data: runs, error: runsError } = await supabase
    .from("experiment_runs")
    .select("*")
    .order("updated_at", { ascending: false });

  if (runsError) {
    return {
      runs: [],
      runScheduleBlocks: [],
      runAssignments: [],
      persistenceEnabled: false,
      warning: "Run data could not be loaded.",
    };
  }

  const runRows = (runs as ExperimentRun[]) || [];
  const runIds = runRows.map((run) => run.id);

  if (runIds.length === 0) {
    return {
      runs: runRows,
      runScheduleBlocks: [],
      runAssignments: [],
      persistenceEnabled: true,
      warning: null,
    };
  }

  const [{ data: runScheduleBlocks, error: runBlocksError }, { data: runAssignments, error: runAssignmentsError }] =
    await Promise.all([
      supabase
        .from("run_schedule_blocks")
        .select("*")
        .in("experiment_run_id", runIds)
        .order("day_index", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase
        .from("run_assignments")
        .select("*")
        .in("experiment_run_id", runIds)
        .order("sort_order", { ascending: true }),
    ]);

  const warningParts: string[] = [];
  if (runBlocksError) {
    warningParts.push("timeline blocks");
  }
  if (runAssignmentsError) {
    warningParts.push("assignments");
  }

  return {
    runs: runRows,
    runScheduleBlocks: runBlocksError ? [] : (runScheduleBlocks as RunScheduleBlock[]) || [],
    runAssignments: runAssignmentsError ? [] : (runAssignments as RunAssignment[]) || [],
    persistenceEnabled: true,
    warning:
      warningParts.length > 0
        ? `Run list loaded, but ${warningParts.join(" and ")} could not be loaded.`
        : null,
  };
}

export default async function ExperimentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=%2Fexperiments");
  }
  const userId = user.id;

  const [
    { data: experiments },
    { data: timepoints },
    { data: protocols },
    { data: reagents },
    animalExperiments,
    animals,
    { data: cohorts },
    { data: colonyTimepoints },
    { data: datasets },
    { data: analyses },
    { data: figures },
    { data: tasks },
    { data: workspaceCalendarEvents },
    templateBuilderData,
  ] = await Promise.all([
    supabase
      .from("experiments")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("experiment_timepoints")
      .select("*")
      .eq("user_id", userId)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("protocols")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("reagents")
      .select("*")
      .eq("user_id", userId)
      .order("name", { ascending: true }),
    fetchAllRows(supabase, "animal_experiments", userId),
    fetchAllRows(supabase, "animals", userId),
    supabase
      .from("cohorts")
      .select("*")
      .eq("user_id", userId)
      .order("name"),
    supabase
      .from("colony_timepoints")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order"),
    supabase
      .from("datasets")
      .select("id,name,experiment_id,created_at,updated_at,row_count")
      .eq("user_id", userId),
    supabase
      .from("analyses")
      .select("id,name,dataset_id,created_at,test_type")
      .eq("user_id", userId),
    supabase
      .from("figures")
      .select("id,name,dataset_id,analysis_id,created_at,updated_at,chart_type")
      .eq("user_id", userId),
    supabase
      .from("tasks")
      .select("id,title,source_id,source_type,status,due_date,updated_at")
      .eq("user_id", userId)
      .eq("source_type", "experiment"),
    supabase
      .from("workspace_calendar_events")
      .select("*")
      .eq("user_id", userId)
      .order("start_at", { ascending: true }),
    fetchExperimentTemplates(supabase, userId),
  ]);

  const traceCards = buildExperimentTraceabilityCards({
    experiments: (experiments as Experiment[]) || [],
    timepoints: (timepoints as ExperimentTimepoint[]) || [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    datasets: (datasets as any[]) || [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    analyses: (analyses as any[]) || [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    figures: (figures as any[]) || [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tasks: (tasks as any[]) || [],
  });

  const scheduleBuilderData = templateBuilderData.persistenceEnabled
    ? await fetchScheduleTemplatesForTemplates(
        supabase,
        templateBuilderData.templates.map((template) => template.id).filter(Boolean),
      )
    : {
        scheduleTemplates: [] as ScheduleTemplate[],
        scheduleDays: [] as ScheduleDay[],
        scheduleSlots: [] as ScheduleSlot[],
        scheduledBlocks: [] as ScheduledBlock[],
        persistenceEnabled: false,
      };
  const runExecutionData = await fetchRunExecutionData(supabase);

  return (
    <div className="page-shell">
      <details className="group section-card card-density-compact">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
          <span className="flex items-center gap-1.5">
            Traceability Timeline
            <HelpHint text="Track progress from planning to datasets, analyses, and figures." />
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div />
          <Link href="/results" className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
            {UI_SURFACE_ACTIONS.openResults}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {traceCards.length === 0 ? (
          <p className="text-sm text-slate-600">No experiments yet.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {traceCards.map((card) => (
              <div key={card.id} className="rounded-2xl border border-slate-200/80 bg-white/75 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{card.title}</p>
                    <p className="text-xs text-slate-600">
                      {card.statusLabel} {card.lastEventAt ? `• updated ${formatTraceTime(card.lastEventAt)}` : ""}
                    </p>
                  </div>
                  <Link href="/experiments" className="text-xs text-cyan-700 hover:text-cyan-800">Open</Link>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <TraceMetric icon={<GitBranch className="h-3.5 w-3.5" />} label="Timepoints" value={`${card.timepointsCompleted}/${card.timepointsTotal}`} />
                  <TraceMetric icon={<TestTube2 className="h-3.5 w-3.5" />} label="Datasets" value={String(card.datasets)} />
                  <TraceMetric icon={<FlaskConical className="h-3.5 w-3.5" />} label="Analyses" value={String(card.analyses)} />
                  <TraceMetric icon={<FlaskConical className="h-3.5 w-3.5" />} label="Figures" value={String(card.figures)} />
                </div>

                <div className="mt-3 space-y-1.5">
                  {card.timeline.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 px-2.5 py-2 text-xs text-slate-500">
                      No linked downstream artifacts yet.
                    </p>
                  ) : (
                    card.timeline.map((event, idx) => (
                      <Link key={`${event.kind}-${idx}`} href={event.href || "/experiments"} className="flex items-start gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-slate-50">
                        <div className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-500" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{event.label}</p>
                          <p className="truncate text-slate-500">{event.meta}</p>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </details>

      <ExperimentsClient
        experiments={(experiments as Experiment[]) || []}
        timepoints={(timepoints as ExperimentTimepoint[]) || []}
        protocols={(protocols as Protocol[]) || []}
        reagents={(reagents as Reagent[]) || []}
        animalExperiments={(animalExperiments as AnimalExperiment[]) || []}
        animals={(animals as Animal[]) || []}
        cohorts={(cohorts as Cohort[]) || []}
        colonyTimepoints={(colonyTimepoints as ColonyTimepoint[]) || []}
        workspaceCalendarEvents={(workspaceCalendarEvents as WorkspaceCalendarEvent[]) || []}
        experimentTemplates={templateBuilderData.templates}
        templateBuilderPersistenceEnabled={templateBuilderData.persistenceEnabled}
        scheduleTemplates={scheduleBuilderData.scheduleTemplates}
        scheduleDays={scheduleBuilderData.scheduleDays}
        scheduleSlots={scheduleBuilderData.scheduleSlots}
        scheduledBlocks={scheduleBuilderData.scheduledBlocks}
        scheduleBuilderPersistenceEnabled={scheduleBuilderData.persistenceEnabled}
        experimentRuns={runExecutionData.runs}
        runScheduleBlocks={runExecutionData.runScheduleBlocks}
        runAssignments={runExecutionData.runAssignments}
        runExecutionPersistenceEnabled={runExecutionData.persistenceEnabled}
        runExecutionWarning={runExecutionData.warning}
      />
    </div>
  );
}

function TraceMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1 text-slate-500">{icon}<span className="text-[10px] uppercase tracking-[0.12em]">{label}</span></div>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function formatTraceTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffHrs = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60));
  if (diffHrs < 24) return diffHrs <= 0 ? "today" : `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}
