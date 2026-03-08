"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, FlaskConical, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Protocol } from "@/types";
import { saveExperimentTemplate, deleteExperimentTemplate } from "@/app/(protected)/experiments/template-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const COLUMN_TYPE_OPTIONS = [
  "text",
  "long_text",
  "number",
  "integer",
  "boolean",
  "date",
  "time",
  "datetime",
  "select",
  "multi_select",
  "file",
  "url",
  "animal_ref",
  "cohort_ref",
  "batch_ref",
] as const;

type ColumnType = (typeof COLUMN_TYPE_OPTIONS)[number];

export type ExperimentTemplateProtocolLink = {
  protocolId: string;
  sortOrder: number;
  isDefault: boolean;
  notes: string;
};

export type ExperimentTemplateColumn = {
  key: string;
  label: string;
  columnType: ColumnType;
  required: boolean;
  defaultValue: string;
  options: string[];
  unit: string;
  helpText: string;
  groupKey: string;
  sortOrder: number;
  isSystemDefault: boolean;
  isEnabled: boolean;
};

export type ExperimentTemplateRecord = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  defaultAssignmentScope: string | null;
  protocolLinks: ExperimentTemplateProtocolLink[];
  schema: {
    id: string;
    name: string;
    description: string | null;
    columns: ExperimentTemplateColumn[];
  } | null;
};

type TemplateDraft = {
  id: string | null;
  title: string;
  description: string;
  category: string;
  defaultAssignmentScope: string;
  schemaName: string;
  schemaDescription: string;
  protocolLinks: ExperimentTemplateProtocolLink[];
  columns: ExperimentTemplateColumn[];
};

const STARTER_COLUMNS: ExperimentTemplateColumn[] = [
  {
    key: "animal_id",
    label: "Animal ID",
    columnType: "animal_ref",
    required: true,
    defaultValue: "",
    options: [],
    unit: "",
    helpText: "Link each result row to the source animal.",
    groupKey: "colony",
    sortOrder: 0,
    isSystemDefault: true,
    isEnabled: true,
  },
  {
    key: "timepoint",
    label: "Timepoint",
    columnType: "text",
    required: true,
    defaultValue: "",
    options: [],
    unit: "",
    helpText: "Relative day or collection window.",
    groupKey: "timepoint",
    sortOrder: 1,
    isSystemDefault: true,
    isEnabled: true,
  },
  {
    key: "notes",
    label: "Notes",
    columnType: "long_text",
    required: false,
    defaultValue: "",
    options: [],
    unit: "",
    helpText: "Free-form operator notes.",
    groupKey: "",
    sortOrder: 2,
    isSystemDefault: false,
    isEnabled: true,
  },
];

function slugifyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function buildEmptyDraft(): TemplateDraft {
  return {
    id: null,
    title: "",
    description: "",
    category: "",
    defaultAssignmentScope: "animal",
    schemaName: "Default schema",
    schemaDescription: "",
    protocolLinks: [],
    columns: STARTER_COLUMNS.map((column, index) => ({
      ...column,
      sortOrder: index,
      options: [...column.options],
    })),
  };
}

function buildDraftFromTemplate(template: ExperimentTemplateRecord): TemplateDraft {
  return {
    id: template.id,
    title: template.title,
    description: template.description || "",
    category: template.category || "",
    defaultAssignmentScope: template.defaultAssignmentScope || "animal",
    schemaName: template.schema?.name || "Default schema",
    schemaDescription: template.schema?.description || "",
    protocolLinks: [...template.protocolLinks]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((link, index) => ({
        ...link,
        sortOrder: index,
      })),
    columns:
      template.schema?.columns.length
        ? [...template.schema.columns]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((column, index) => ({
              ...column,
              sortOrder: index,
              options: [...column.options],
              defaultValue: column.defaultValue || "",
              unit: column.unit || "",
              helpText: column.helpText || "",
              groupKey: column.groupKey || "",
            }))
        : buildEmptyDraft().columns,
  };
}

function reorderList<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(nextIndex, 0, moved);
  return next;
}

export function ExperimentTemplateBuilder({
  templates,
  protocols,
  persistenceEnabled,
}: {
  templates: ExperimentTemplateRecord[];
  protocols: Protocol[];
  persistenceEnabled: boolean;
}) {
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("new");
  const [draft, setDraft] = useState<TemplateDraft>(buildEmptyDraft);
  const [protocolPickerValue, setProtocolPickerValue] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  function updateDraft(patch: Partial<TemplateDraft>) {
    setDraft((current) => ({
      ...current,
      ...patch,
    }));
  }

  function addProtocol(protocolId: string) {
    if (!protocolId || draft.protocolLinks.some((link) => link.protocolId === protocolId)) {
      return;
    }

    updateDraft({
      protocolLinks: [
        ...draft.protocolLinks,
        {
          protocolId,
          sortOrder: draft.protocolLinks.length,
          isDefault: draft.protocolLinks.length === 0,
          notes: "",
        },
      ],
    });
    setProtocolPickerValue("");
  }

  function updateProtocolLink(index: number, patch: Partial<ExperimentTemplateProtocolLink>) {
    updateDraft({
      protocolLinks: draft.protocolLinks.map((link, linkIndex) => {
        if (linkIndex !== index) return link;
        return { ...link, ...patch };
      }),
    });
  }

  function setDefaultProtocol(index: number) {
    updateDraft({
      protocolLinks: draft.protocolLinks.map((link, linkIndex) => ({
        ...link,
        isDefault: linkIndex === index,
      })),
    });
  }

  function removeProtocol(index: number) {
    const nextLinks = draft.protocolLinks
      .filter((_, linkIndex) => linkIndex !== index)
      .map((link, linkIndex) => ({
        ...link,
        sortOrder: linkIndex,
      }));

    if (nextLinks.length > 0 && !nextLinks.some((link) => link.isDefault)) {
      nextLinks[0] = { ...nextLinks[0], isDefault: true };
    }

    updateDraft({ protocolLinks: nextLinks });
  }

  function moveProtocol(index: number, direction: -1 | 1) {
    updateDraft({
      protocolLinks: reorderList(draft.protocolLinks, index, direction).map((link, linkIndex) => ({
        ...link,
        sortOrder: linkIndex,
      })),
    });
  }

  function addColumn() {
    const nextIndex = draft.columns.length;
    updateDraft({
      columns: [
        ...draft.columns,
        {
          key: `field_${nextIndex + 1}`,
          label: `Field ${nextIndex + 1}`,
          columnType: "text",
          required: false,
          defaultValue: "",
          options: [],
          unit: "",
          helpText: "",
          groupKey: "",
          sortOrder: nextIndex,
          isSystemDefault: false,
          isEnabled: true,
        },
      ],
    });
  }

  function updateColumn(index: number, patch: Partial<ExperimentTemplateColumn>) {
    updateDraft({
      columns: draft.columns.map((column, columnIndex) => {
        if (columnIndex !== index) return column;

        if (typeof patch.label === "string" && !("key" in patch)) {
          const previousAutoKey = slugifyKey(column.label);
          const shouldAutoUpdateKey = !column.key || column.key === previousAutoKey;
          return {
            ...column,
            ...patch,
            key: shouldAutoUpdateKey ? slugifyKey(patch.label) || column.key : column.key,
          };
        }

        return { ...column, ...patch };
      }),
    });
  }

  function removeColumn(index: number) {
    updateDraft({
      columns: draft.columns
        .filter((_, columnIndex) => columnIndex !== index)
        .map((column, columnIndex) => ({
          ...column,
          sortOrder: columnIndex,
        })),
    });
  }

  function moveColumn(index: number, direction: -1 | 1) {
    updateDraft({
      columns: reorderList(draft.columns, index, direction).map((column, columnIndex) => ({
        ...column,
        sortOrder: columnIndex,
      })),
    });
  }

  function handleSave() {
    if (!persistenceEnabled) {
      toast.info("Templates are not ready in this workspace yet. You can keep editing in draft mode.");
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        if (draft.id) {
          formData.set("template_id", draft.id);
        }
        formData.set("title", draft.title);
        formData.set("description", draft.description);
        formData.set("category", draft.category);
        formData.set("default_assignment_scope", draft.defaultAssignmentScope);
        formData.set("schema_name", draft.schemaName);
        formData.set("schema_description", draft.schemaDescription);
        formData.set("protocol_links", JSON.stringify(draft.protocolLinks));
        formData.set(
          "result_columns",
          JSON.stringify(
            draft.columns.map((column, index) => ({
              ...column,
              sortOrder: index,
              defaultValue: column.defaultValue || null,
            })),
          ),
        );

        await saveExperimentTemplate(formData);
        router.refresh();
        toast.success(draft.id ? "Template updated." : "Template created.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save template.");
      }
    });
  }

  function handleDelete() {
    if (!draft.id || !persistenceEnabled) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteExperimentTemplate(draft.id as string);
        setSelectedTemplateId("new");
        setDraft(buildEmptyDraft());
        router.refresh();
        toast.success("Template deleted.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete template.");
      }
    });
  }

  const selectedProtocolIds = new Set(draft.protocolLinks.map((link) => link.protocolId));
  const unselectedProtocols = protocols.filter((protocol) => !selectedProtocolIds.has(protocol.id));

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="border-slate-200/80 bg-white/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Template Library</CardTitle>
          <CardDescription>Reusable templates with protocols and default result fields.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
            <Button
              type="button"
              variant={selectedTemplateId === "new" ? "default" : "outline"}
              className="w-full justify-start gap-2"
              onClick={() => {
                setSelectedTemplateId("new");
                setDraft(buildEmptyDraft());
              }}
            >
              <Plus className="h-4 w-4" />
              New template
            </Button>

          <div className="space-y-2">
            {templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                No saved templates yet.
              </div>
            ) : (
              templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setDraft(buildDraftFromTemplate(template));
                  }}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                    selectedTemplateId === template.id
                      ? "border-cyan-300 bg-cyan-50/80"
                      : "border-slate-200/80 bg-white hover:border-slate-300"
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-slate-900">{template.title}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {template.protocolLinks.length} protocol{template.protocolLinks.length === 1 ? "" : "s"} •{" "}
                    {template.schema?.columns.length || 0} columns
                  </p>
                </button>
              ))
            )}
          </div>

          {!persistenceEnabled ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
              Draft only. Save is disabled until templates are available in this workspace.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 bg-white/80 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-base">
                {draft.id ? "Edit experiment template" : "Create experiment template"}
              </CardTitle>
              <CardDescription>
                Create a template, attach protocols, and set default result fields.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {draft.id ? (
                <Button type="button" variant="outline" onClick={handleDelete} disabled={isPending || !persistenceEnabled}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
              <Button type="button" onClick={handleSave} disabled={isPending || !draft.title.trim() || !persistenceEnabled}>
                <Save className="mr-2 h-4 w-4" />
                Save template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="template-title">Title</Label>
              <Input
                id="template-title"
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
                placeholder="Behavioral baseline battery"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-category">Category</Label>
              <Input
                id="template-category"
                value={draft.category}
                onChange={(event) => updateDraft({ category: event.target.value })}
                placeholder="Behavior, surgery, imaging"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                value={draft.description}
                onChange={(event) => updateDraft({ description: event.target.value })}
                placeholder="Describe what this reusable template standardizes."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-assignment-scope">Default Assignment Scope</Label>
              <select
                id="template-assignment-scope"
                value={draft.defaultAssignmentScope}
                onChange={(event) => updateDraft({ defaultAssignmentScope: event.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
              >
                <option value="study">Study</option>
                <option value="cohort">Cohort</option>
                <option value="animal">Animal</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Ownership</Label>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Personal for now. Shared lab ownership is coming soon.
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-200/80 bg-slate-50/60 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Protocols</p>
                <p className="text-xs text-slate-600">Attach multiple protocols, define order, and mark one default.</p>
              </div>
              <div className="flex gap-2">
                <select
                  value={protocolPickerValue}
                  onChange={(event) => {
                    setProtocolPickerValue(event.target.value);
                    addProtocol(event.target.value);
                  }}
                  className="flex h-10 min-w-56 rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none"
                >
                  <option value="">Add a protocol</option>
                  {unselectedProtocols.map((protocol) => (
                    <option key={protocol.id} value={protocol.id}>
                      {protocol.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {draft.protocolLinks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                  No linked protocols yet.
                </div>
              ) : (
                draft.protocolLinks.map((link, index) => {
                  const protocol = protocols.find((item) => item.id === link.protocolId);

                  return (
                    <div key={`${link.protocolId}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {protocol?.title || "Unknown protocol"}
                          </p>
                          <p className="text-xs text-slate-600">
                            Position {index + 1}
                            {link.isDefault ? " • Default protocol" : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => moveProtocol(index, -1)} disabled={index === 0}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => moveProtocol(index, 1)}
                            disabled={index === draft.protocolLinks.length - 1}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant={link.isDefault ? "default" : "outline"} size="sm" onClick={() => setDefaultProtocol(index)}>
                            Default
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => removeProtocol(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        <Label htmlFor={`protocol-notes-${index}`}>Protocol Notes</Label>
                        <Textarea
                          id={`protocol-notes-${index}`}
                          value={link.notes}
                          onChange={(event) => updateProtocolLink(index, { notes: event.target.value })}
                          placeholder="Override notes, prep details, or handoff context."
                          rows={2}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-200/80 bg-slate-50/60 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="schema-name">Result Schema Name</Label>
                <Input
                  id="schema-name"
                  value={draft.schemaName}
                  onChange={(event) => updateDraft({ schemaName: event.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="schema-description">Schema Description</Label>
                <Textarea
                  id="schema-description"
                  value={draft.schemaDescription}
                  onChange={(event) => updateDraft({ schemaDescription: event.target.value })}
                  placeholder="Describe what operators should capture by default."
                  rows={2}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Default Result Columns</p>
                <p className="text-xs text-slate-600">Add, remove, and reorder default fields.</p>
              </div>
              <Button type="button" variant="outline" onClick={addColumn}>
                <Plus className="mr-2 h-4 w-4" />
                Add column
              </Button>
            </div>

            <div className="space-y-3">
              {draft.columns.map((column, index) => (
                <div key={`${column.key}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor={`column-label-${index}`}>Label</Label>
                        <Input
                          id={`column-label-${index}`}
                          value={column.label}
                          onChange={(event) => updateColumn(index, { label: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`column-key-${index}`}>Key</Label>
                        <Input
                          id={`column-key-${index}`}
                          value={column.key}
                          onChange={(event) => updateColumn(index, { key: slugifyKey(event.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`column-type-${index}`}>Type</Label>
                        <select
                          id={`column-type-${index}`}
                          value={column.columnType}
                          onChange={(event) => updateColumn(index, { columnType: event.target.value as ColumnType })}
                          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
                        >
                          {COLUMN_TYPE_OPTIONS.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`column-unit-${index}`}>Unit</Label>
                        <Input
                          id={`column-unit-${index}`}
                          value={column.unit}
                          onChange={(event) => updateColumn(index, { unit: event.target.value })}
                          placeholder="ms, %, g"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => moveColumn(index, -1)} disabled={index === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => moveColumn(index, 1)}
                        disabled={index === draft.columns.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => removeColumn(index)} disabled={draft.columns.length === 1}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor={`column-default-${index}`}>Default Value</Label>
                      <Input
                        id={`column-default-${index}`}
                        value={column.defaultValue}
                        onChange={(event) => updateColumn(index, { defaultValue: event.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`column-options-${index}`}>Options</Label>
                      <Input
                        id={`column-options-${index}`}
                        value={column.options.join(", ")}
                        onChange={(event) =>
                          updateColumn(index, {
                            options: event.target.value
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Only for select fields"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`column-group-${index}`}>Group Key</Label>
                      <Input
                        id={`column-group-${index}`}
                        value={column.groupKey}
                        onChange={(event) => updateColumn(index, { groupKey: event.target.value })}
                        placeholder="batch, colony, timepoint"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`column-help-${index}`}>Help Text</Label>
                      <Input
                        id={`column-help-${index}`}
                        value={column.helpText}
                        onChange={(event) => updateColumn(index, { helpText: event.target.value })}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={column.required}
                        onChange={(event) => updateColumn(index, { required: event.target.checked })}
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={column.isEnabled}
                        onChange={(event) => updateColumn(index, { isEnabled: event.target.checked })}
                      />
                      Enabled
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={column.isSystemDefault}
                        onChange={(event) => updateColumn(index, { isSystemDefault: event.target.checked })}
                      />
                      System default
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-3 text-xs text-cyan-900">
              <div className="flex items-start gap-2">
                <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  This sets template defaults. Run-level changes are handled in the run workflow.
                </p>
              </div>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
