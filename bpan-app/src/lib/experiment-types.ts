import type { ExperimentType } from "@/types";

export const VALID_EXPERIMENT_TYPES: ExperimentType[] = [
  "y_maze",
  "ldb",
  "marble",
  "nesting",
  "social_interaction",
  "catwalk",
  "rotarod_hab",
  "rotarod_test1",
  "rotarod_test2",
  "rotarod",
  "stamina",
  "blood_draw",
  "data_collection",
  "core_acclimation",
  "eeg_implant",
  "eeg_recording",
  "handling",
];

export function normalizeExperimentType(value: string | null | undefined): ExperimentType | null {
  const normalized = String(value || "").trim().toLowerCase();
  return VALID_EXPERIMENT_TYPES.includes(normalized as ExperimentType) ? (normalized as ExperimentType) : null;
}

export function inferExperimentTypeFromTitle(title: string | null | undefined): ExperimentType | null {
  const slug = String(title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const aliases: Record<string, ExperimentType> = {
    y_maze: "y_maze",
    ymmaze: "y_maze",
    light_dark_box: "ldb",
    ldb: "ldb",
    marble_burying: "marble",
    nesting: "nesting",
    si: "social_interaction",
    social_interaction: "social_interaction",
    catwalk: "catwalk",
    rr_hab: "rotarod_hab",
    rotarod_hab: "rotarod_hab",
    rotarod_habituation: "rotarod_hab",
    rr_1: "rotarod_test1",
    rotarod_test_1: "rotarod_test1",
    rotarod_test1: "rotarod_test1",
    rr_2: "rotarod_test2",
    rotarod_test_2: "rotarod_test2",
    rotarod_test2: "rotarod_test2",
    rr_stamina: "stamina",
    rotarod: "rotarod",
    stamina: "stamina",
    blood_draw: "blood_draw",
    plasma: "blood_draw",
    plasma_collection: "blood_draw",
    eeg_implant: "eeg_implant",
    eeg_surgery: "eeg_implant",
    eeg_recording: "eeg_recording",
    handling: "handling",
    transport: "data_collection",
    rest_day: "core_acclimation",
    data_collection: "data_collection",
    core_acclimation: "core_acclimation",
  };

  return aliases[slug] || normalizeExperimentType(slug);
}
