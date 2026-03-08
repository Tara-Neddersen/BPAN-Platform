"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";
import { createTemplateAiWorkflowSuggestion } from "@/lib/automation-workflows";

type TemplateProtocolInput = {
  protocolId: string;
  sortOrder: number;
  isDefault: boolean;
  notes: string | null;
};

type TemplateResultColumnInput = {
  key: string;
  label: string;
  columnType: string;
  required: boolean;
  defaultValue: unknown;
  options: string[];
  unit: string | null;
  helpText: string | null;
  groupKey: string | null;
  sortOrder: number;
  isSystemDefault: boolean;
  isEnabled: boolean;
};

function parseJsonField<T>(formData: FormData, key: string, fallback: T): T {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeProtocolInputs(value: unknown): TemplateProtocolInput[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const protocolId = typeof record.protocolId === "string" ? record.protocolId.trim() : "";
      if (!protocolId) return null;

      return {
        protocolId,
        sortOrder: typeof record.sortOrder === "number" ? record.sortOrder : index,
        isDefault: Boolean(record.isDefault),
        notes: typeof record.notes === "string" && record.notes.trim().length > 0 ? record.notes.trim() : null,
      };
    })
    .filter((item): item is TemplateProtocolInput => Boolean(item))
    .map((item, index) => ({
      ...item,
      sortOrder: index,
    }));

  if (normalized.length === 0) {
    return normalized;
  }

  const explicitDefaultIndex = normalized.findIndex((item) => item.isDefault);

  return normalized.map((item, index) => ({
    ...item,
    isDefault: explicitDefaultIndex >= 0 ? index === explicitDefaultIndex : index === 0,
  }));
}

function normalizeColumnInputs(value: unknown): TemplateResultColumnInput[] {
  if (!Array.isArray(value)) return [];

  const mapped = value.map<TemplateResultColumnInput | null>((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const key = typeof record.key === "string" ? record.key.trim() : "";
      const columnType = typeof record.columnType === "string" ? record.columnType.trim() : "text";
      if (!label || !key) return null;

      return {
        key,
        label,
        columnType,
        required: Boolean(record.required),
        defaultValue: record.defaultValue ?? null,
        options: Array.isArray(record.options)
          ? record.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0)
          : [],
        unit: typeof record.unit === "string" && record.unit.trim().length > 0 ? record.unit.trim() : null,
        helpText: typeof record.helpText === "string" && record.helpText.trim().length > 0 ? record.helpText.trim() : null,
        groupKey: typeof record.groupKey === "string" && record.groupKey.trim().length > 0 ? record.groupKey.trim() : null,
        sortOrder: typeof record.sortOrder === "number" ? record.sortOrder : index,
        isSystemDefault: Boolean(record.isSystemDefault),
        isEnabled: record.isEnabled === false ? false : true,
      };
    });

  return mapped
    .filter((item): item is TemplateResultColumnInput => item !== null)
    .map((item, index) => ({
      ...item,
      sortOrder: index,
    }));
}

function withTemplateSchemaGuidance(message: string) {
  return `${message} Templates may still be loading for this workspace. You can continue in draft mode and save later.`;
}

export async function saveExperimentTemplate(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const templateId = typeof formData.get("template_id") === "string" ? (formData.get("template_id") as string) : "";
  const title = typeof formData.get("title") === "string" ? (formData.get("title") as string).trim() : "";
  const description = typeof formData.get("description") === "string" ? (formData.get("description") as string).trim() : "";
  const category = typeof formData.get("category") === "string" ? (formData.get("category") as string).trim() : "";
  const assignmentScope =
    typeof formData.get("default_assignment_scope") === "string"
      ? (formData.get("default_assignment_scope") as string).trim()
      : "";
  const schemaName = typeof formData.get("schema_name") === "string" ? (formData.get("schema_name") as string).trim() : "Default schema";
  const schemaDescription =
    typeof formData.get("schema_description") === "string" ? (formData.get("schema_description") as string).trim() : "";

  if (!title) {
    throw new Error("Template title is required.");
  }

  const protocolInputs = normalizeProtocolInputs(parseJsonField(formData, "protocol_links", []));
  const columnInputs = normalizeColumnInputs(parseJsonField(formData, "result_columns", []));

  const templatePayload = {
    owner_type: "user",
    owner_user_id: user.id,
    visibility: "private",
    title,
    description: description || null,
    category: category || null,
    default_assignment_scope: assignmentScope || null,
    created_by: user.id,
  };

  let persistedTemplateId = templateId;

  if (templateId) {
    const { error } = await supabase
      .from("experiment_templates")
      .update(templatePayload)
      .eq("id", templateId)
      .eq("owner_type", "user")
      .eq("owner_user_id", user.id);
    if (error) {
      throw new Error(withTemplateSchemaGuidance(error.message));
    }
  } else {
    const { data, error } = await supabase
      .from("experiment_templates")
      .insert(templatePayload)
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(withTemplateSchemaGuidance(error?.message || "Failed to create experiment template."));
    }

    persistedTemplateId = data.id as string;
  }

  if (!persistedTemplateId) {
    throw new Error("Failed to resolve the experiment template id.");
  }

  const { error: deleteProtocolLinksError } = await supabase
    .from("template_protocol_links")
    .delete()
    .eq("template_id", persistedTemplateId);

  if (deleteProtocolLinksError) {
    throw new Error(withTemplateSchemaGuidance(deleteProtocolLinksError.message));
  }

  if (protocolInputs.length > 0) {
    const { error } = await supabase.from("template_protocol_links").insert(
      protocolInputs.map((item) => ({
        template_id: persistedTemplateId,
        protocol_id: item.protocolId,
        sort_order: item.sortOrder,
        is_default: item.isDefault,
        notes: item.notes,
        created_by: user.id,
      })),
    );

    if (error) {
      throw new Error(withTemplateSchemaGuidance(error.message));
    }
  }

  const { data: existingSchemas, error: existingSchemaError } = await supabase
    .from("result_schemas")
    .select("id")
    .eq("template_id", persistedTemplateId)
    .eq("is_active", true);

  if (existingSchemaError) {
    throw new Error(withTemplateSchemaGuidance(existingSchemaError.message));
  }

  let schemaId = existingSchemas?.[0]?.id as string | undefined;

  if (schemaId) {
    const { error } = await supabase
      .from("result_schemas")
      .update({
        name: schemaName || "Default schema",
        description: schemaDescription || null,
        is_active: true,
      })
      .eq("id", schemaId);

    if (error) {
      throw new Error(withTemplateSchemaGuidance(error.message));
    }
  } else {
    const { data, error } = await supabase
      .from("result_schemas")
      .insert({
        template_id: persistedTemplateId,
        name: schemaName || "Default schema",
        description: schemaDescription || null,
        is_active: true,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(withTemplateSchemaGuidance(error?.message || "Failed to create result schema."));
    }

    schemaId = data.id as string;
  }

  if (existingSchemas && existingSchemas.length > 1) {
    const inactiveSchemaIds = existingSchemas
      .slice(1)
      .map((schema) => schema.id)
      .filter((id): id is string => typeof id === "string");

    if (inactiveSchemaIds.length > 0) {
      const { error } = await supabase
        .from("result_schemas")
        .update({ is_active: false })
        .in("id", inactiveSchemaIds);

      if (error) {
        throw new Error(withTemplateSchemaGuidance(error.message));
      }
    }
  }

  const { error: deleteColumnsError } = await supabase.from("result_schema_columns").delete().eq("schema_id", schemaId);
  if (deleteColumnsError) {
    throw new Error(withTemplateSchemaGuidance(deleteColumnsError.message));
  }

  if (columnInputs.length > 0) {
    const { error } = await supabase.from("result_schema_columns").insert(
      columnInputs.map((item) => ({
        schema_id: schemaId,
        key: item.key,
        label: item.label,
        column_type: item.columnType,
        required: item.required,
        default_value: item.defaultValue,
        options: item.options,
        unit: item.unit,
        help_text: item.helpText,
        group_key: item.groupKey,
        sort_order: item.sortOrder,
        is_system_default: item.isSystemDefault,
        is_enabled: item.isEnabled,
      })),
    );

    if (error) {
      throw new Error(withTemplateSchemaGuidance(error.message));
    }
  }

  const protocolIds = protocolInputs.map((item) => item.protocolId);
  const { data: linkedProtocols } = protocolIds.length
    ? await supabase
        .from("protocols")
        .select("id,title")
        .in("id", protocolIds)
    : { data: [] as Array<{ id: string; title: string }> };
  const protocolTitleById = new Map((linkedProtocols || []).map((item) => [String(item.id), String(item.title || "Untitled protocol")]));

  revalidatePath("/experiments");
  revalidatePath("/tasks");
  await createTemplateAiWorkflowSuggestion({
    supabase,
    userId: user.id,
    templateId: persistedTemplateId,
    title,
    description: description || null,
    protocols: protocolInputs.map((item) => ({
      title: protocolTitleById.get(item.protocolId) || item.protocolId,
      notes: item.notes,
    })),
    columns: columnInputs.map((item) => ({
      label: item.label,
      columnType: item.columnType,
      required: item.required,
      isEnabled: item.isEnabled,
    })),
  });
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function deleteExperimentTemplate(templateId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { error } = await supabase
    .from("experiment_templates")
    .delete()
    .eq("id", templateId)
    .eq("owner_type", "user")
    .eq("owner_user_id", user.id);

  if (error) {
    throw new Error(withTemplateSchemaGuidance(error.message));
  }

  revalidatePath("/experiments");
}
