import assert from "node:assert/strict";
import { defaultStatsDraft } from "../src/lib/colony-analysis/config";
import { derivePowerPlannerContext, runPowerAnalysis, type PowerPlannerInput } from "../src/lib/colony-analysis/power";
import type { FlatRow, PowerConfig } from "../src/lib/colony-analysis/types";

const basePowerConfig = {
  ...defaultStatsDraft().powerConfig,
  simulationMeta: {
    ...defaultStatsDraft().powerConfig.simulationMeta,
    iterations: 40,
  },
};

function makeIndependentRows(perGroup = 16): FlatRow[] {
  const rows: FlatRow[] = [];
  const groups = ["Control", "Treatment"] as const;
  groups.forEach((group, groupIndex) => {
    for (let i = 0; i < perGroup; i++) {
      const dose = i / 4;
      const baseline = 1 + i * 0.07 + groupIndex * 0.15;
      const averageSpeed = 2 + baseline * 0.25 + groupIndex * 0.45 + ((i % 3) - 1) * 0.08;
      const scoreSignal = 0.6 + averageSpeed * 0.4 + ((i % 4) - 1.5) * 0.05;
      const response = 0.8 + dose * (group === "Treatment" ? 0.55 : 0.3) + ((i % 3) - 1) * 0.06;
      const eventObserved = i < perGroup * (group === "Treatment" ? 0.65 : 0.35) ? "Positive" : "Censored";
      const timeToEvent = 8 + i * 0.7 - groupIndex * 1.6 + (eventObserved === "Positive" ? 0 : 2.5);
      rows.push({
        animal_id: `${group}-${i}`,
        identifier: `${group}-${i}`,
        sex: groupIndex === 0 ? "Female" : "Male",
        genotype: groupIndex === 0 ? "WT" : "Hemi",
        group,
        cohort: "BPAN Power",
        timepoint: 0,
        experiment: "power",
        average_speed: averageSpeed,
        score_signal: scoreSignal,
        baseline,
        dose,
        response,
        event_observed: eventObserved,
        time_to_event: timeToEvent,
      });
    }
  });
  return rows;
}

function makeFactorialRows(perCell = 10): FlatRow[] {
  const rows: FlatRow[] = [];
  const sexes = ["Female", "Male"] as const;
  const genotypes = ["WT", "Hemi"] as const;
  sexes.forEach((sex, sexIndex) => {
    genotypes.forEach((genotype, genotypeIndex) => {
      for (let i = 0; i < perCell; i++) {
        const group = `${genotype} ${sex}`;
        const baseline = 1.2 + i * 0.05 + sexIndex * 0.12;
        const interactionBoost = sex === "Male" && genotype === "Hemi" ? 0.35 : 0;
        const averageSpeed = 1.8 + sexIndex * 0.25 + genotypeIndex * 0.32 + interactionBoost + ((i % 4) - 1.5) * 0.07;
        rows.push({
          animal_id: `${group}-${i}`,
          identifier: `${group}-${i}`,
          sex,
          genotype,
          group,
          cohort: "BPAN Factorial",
          timepoint: 0,
          experiment: "power",
          average_speed: averageSpeed,
          score_signal: averageSpeed * 0.55 + 0.3,
          baseline,
          dose: i / 3,
          response: averageSpeed * 0.4 + baseline * 0.2,
          event_observed: i < perCell * (0.28 + genotypeIndex * 0.18 + sexIndex * 0.05) ? "Positive" : "Censored",
          time_to_event: 10 + i * 0.4 - genotypeIndex * 1.1 - sexIndex * 0.5,
        });
      }
    });
  });
  return rows;
}

function makeLongitudinalRows(perGroup = 8, missing = false): FlatRow[] {
  const rows: FlatRow[] = [];
  const groups = ["Control", "Treatment"] as const;
  const timepoints = [0, 7, 14];
  groups.forEach((group, groupIndex) => {
    for (let animal = 0; animal < perGroup; animal++) {
      timepoints.forEach((timepoint, timeIndex) => {
        if (missing && group === "Treatment" && animal % 3 === 0 && timepoint === 14) return;
        const base = 1.5 + groupIndex * 0.25 + animal * 0.04;
        const trend = timeIndex * (group === "Treatment" ? 0.35 : 0.16);
        rows.push({
          animal_id: `${group}-${animal}`,
          identifier: `${group}-${animal}`,
          sex: groupIndex === 0 ? "Female" : "Male",
          genotype: groupIndex === 0 ? "WT" : "Hemi",
          group,
          cohort: "BPAN Longitudinal",
          timepoint,
          experiment: "power",
          average_speed: base + trend + ((animal + timeIndex) % 2) * 0.05,
          score_signal: base * 0.4 + trend * 0.8,
          baseline: base,
          dose: timeIndex,
          response: base + trend * 1.1,
          event_observed: trend > 0.5 ? "Positive" : "Censored",
          time_to_event: 12 - trend * 2 + animal * 0.15,
        });
      });
    }
  });
  return rows;
}

function buildInput(rows: FlatRow[], overrides: Partial<PowerPlannerInput> = {}): PowerPlannerInput {
  const defaults = defaultStatsDraft();
  const groups = Array.from(new Set(rows.map((row) => row.group)));
  const mergedPowerConfig: PowerConfig = {
    ...defaults.powerConfig,
    baseTest: "t_test",
    objective: "sample_size",
    targetEffect: "primary",
    effectMetric: "d",
    effectValue: 0.5,
    plannedSample: {
      mode: "per_group" as const,
      value: 12,
    },
    engine: "analytic" as const,
    ...(overrides.powerConfig || {}),
  };
  return {
    flatData: rows,
    numericKeys: ["average_speed", "score_signal", "baseline", "dose", "response", "time_to_event"],
    measureLabels: {
      average_speed: "Average Speed",
      score_signal: "Score Signal",
      baseline: "Baseline",
      dose: "Dose",
      response: "Response",
      time_to_event: "Time To Event",
      event_observed: "Event Observed",
    },
    measureKey: "average_speed",
    measureKey2: "score_signal",
    timeToEventMeasureKey: "time_to_event",
    eventMeasureKey: "event_observed",
    predictorMeasureKey: "dose",
    scoreMeasureKey: "score_signal",
    groupingFactor: "group",
    factorA: "sex",
    factorB: "genotype",
    group1: groups[0] || "Control",
    group2: groups[1] || groups[0] || "Treatment",
    controlGroup: groups[0] || "Control",
    binaryGroupA: groups[0] || "Control",
    binaryGroupB: groups[1] || groups[0] || "Treatment",
    positiveClass: "Positive",
    betweenSubjectFactor: "group",
    covariateMeasureKey: "baseline",
    regressionModelFamily: "linear",
    pAdjustMethod: "none",
    alpha: 0.05,
    targetPower: 0.8,
    powerConfig: mergedPowerConfig,
    includedCount: rows.length,
    excludedCount: 0,
    ...overrides,
  };
}

function expectPowerResult(result: ReturnType<typeof runPowerAnalysis>) {
  assert.ok(!("error" in result), "expected power analysis to succeed");
  return result as Record<string, unknown>;
}

function run() {
  const independentRows = makeIndependentRows();
  const factorialRows = makeFactorialRows();
  const repeatedRows = makeLongitudinalRows();
  const mixedRows = makeLongitudinalRows(8, true);

  const plannerContext = derivePowerPlannerContext(buildInput(independentRows));
  assert.equal(plannerContext.eligible, true);

  const smallEffect = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    powerConfig: {
      ...basePowerConfig,
      baseTest: "t_test",
      objective: "sample_size",
      effectMetric: "d",
      effectValue: 0.3,
      plannedSample: { mode: "per_group", value: 12 },
      engine: "analytic",
    },
  })));
  const largeEffect = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    powerConfig: {
      ...basePowerConfig,
      baseTest: "t_test",
      objective: "sample_size",
      effectMetric: "d",
      effectValue: 0.7,
      plannedSample: { mode: "per_group", value: 12 },
      engine: "analytic",
    },
  })));
  assert.ok(Number(smallEffect.recommended_n_per_group) > Number(largeEffect.recommended_n_per_group));

  const strictAlpha = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    alpha: 0.01,
    powerConfig: {
      ...basePowerConfig,
      baseTest: "t_test",
      objective: "sample_size",
      effectMetric: "d",
      effectValue: 0.5,
      plannedSample: { mode: "per_group", value: 12 },
      engine: "analytic",
    },
  })));
  const relaxedAlpha = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    alpha: 0.05,
    powerConfig: {
      ...basePowerConfig,
      baseTest: "t_test",
      objective: "sample_size",
      effectMetric: "d",
      effectValue: 0.5,
      plannedSample: { mode: "per_group", value: 12 },
      engine: "analytic",
    },
  })));
  assert.ok(Number(strictAlpha.recommended_n_per_group) >= Number(relaxedAlpha.recommended_n_per_group));

  const smallNPower = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    powerConfig: {
      ...basePowerConfig,
      baseTest: "t_test",
      objective: "achieved_power",
      effectMetric: "d",
      effectValue: 0.5,
      plannedSample: { mode: "per_group", value: 8 },
      engine: "analytic",
    },
  })));
  const largeNPower = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    powerConfig: {
      ...basePowerConfig,
      baseTest: "t_test",
      objective: "achieved_power",
      effectMetric: "d",
      effectValue: 0.5,
      plannedSample: { mode: "per_group", value: 24 },
      engine: "analytic",
    },
  })));
  assert.ok(Number(largeNPower.achieved_power) > Number(smallNPower.achieved_power));

  const uncorrectedPairwise = expectPowerResult(runPowerAnalysis(buildInput(factorialRows, {
    pAdjustMethod: "none",
    group1: "WT Female",
    group2: "Hemi Female",
    controlGroup: "WT Female",
    powerConfig: {
      ...basePowerConfig,
      baseTest: "multi_compare",
      objective: "sample_size",
      targetEffect: "contrast",
      effectMetric: "d",
      effectValue: 0.45,
      contrastSelection: { group1: "WT Female", group2: "Hemi Female", label: "WT Female vs Hemi Female" },
      plannedSample: { mode: "per_group", value: 10 },
      engine: "analytic",
    },
  })));
  const bonferroniPairwise = expectPowerResult(runPowerAnalysis(buildInput(factorialRows, {
    pAdjustMethod: "bonferroni",
    group1: "WT Female",
    group2: "Hemi Female",
    controlGroup: "WT Female",
    powerConfig: {
      ...basePowerConfig,
      baseTest: "multi_compare",
      objective: "sample_size",
      targetEffect: "contrast",
      effectMetric: "d",
      effectValue: 0.45,
      contrastSelection: { group1: "WT Female", group2: "Hemi Female", label: "WT Female vs Hemi Female" },
      plannedSample: { mode: "per_group", value: 10 },
      engine: "analytic",
    },
  })));
  assert.ok(Number(bonferroniPairwise.recommended_n_per_group) >= Number(uncorrectedPairwise.recommended_n_per_group));

  const twoWay = expectPowerResult(runPowerAnalysis(buildInput(factorialRows, {
    powerConfig: {
      ...basePowerConfig,
      baseTest: "two_way_anova",
      objective: "achieved_power",
      targetEffect: "interaction",
      effectMetric: "f",
      effectValue: 0.28,
      plannedSample: { mode: "per_cell", value: 8 },
      engine: "simulation",
    },
  })));
  assert.equal(twoWay.engine, "simulation");
  assert.ok(typeof twoWay.achieved_power === "number");

  const ancova = expectPowerResult(runPowerAnalysis(buildInput(factorialRows, {
    powerConfig: {
      ...basePowerConfig,
      baseTest: "ancova",
      objective: "achieved_power",
      targetEffect: "adjusted_factor",
      effectMetric: "f",
      effectValue: 0.25,
      plannedSample: { mode: "per_group", value: 12 },
      engine: "simulation",
    },
  })));
  assert.ok(typeof ancova.achieved_power === "number");

  const repeated = expectPowerResult(runPowerAnalysis(buildInput(repeatedRows, {
    group1: "Control",
    group2: "Treatment",
    powerConfig: {
      ...basePowerConfig,
      baseTest: "repeated_measures_anova",
      objective: "achieved_power",
      targetEffect: "time",
      effectMetric: "f",
      effectValue: 0.3,
      plannedSample: { mode: "subjects_per_group", value: 8 },
      engine: "simulation",
    },
  })));
  assert.ok(typeof repeated.achieved_power === "number");

  const mixed = expectPowerResult(runPowerAnalysis(buildInput(mixedRows, {
    group1: "Control",
    group2: "Treatment",
    powerConfig: {
      ...basePowerConfig,
      baseTest: "mixed_effects",
      objective: "achieved_power",
      targetEffect: "interaction",
      effectMetric: "f",
      effectValue: 0.25,
      plannedSample: { mode: "subjects_per_group", value: 8 },
      engine: "simulation",
    },
  })));
  assert.ok(typeof mixed.achieved_power === "number");

  const chiSquare = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    binaryGroupA: "Control",
    binaryGroupB: "Treatment",
    powerConfig: {
      ...basePowerConfig,
      baseTest: "chi_square",
      objective: "sample_size",
      effectMetric: "event_rates",
      effectValue: { group1: 0.3, group2: 0.6 },
      plannedSample: { mode: "per_group", value: 12 },
      engine: "analytic",
    },
  })));
  assert.ok(typeof chiSquare.recommended_n_per_group === "number");

  const fisher = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    binaryGroupA: "Control",
    binaryGroupB: "Treatment",
    powerConfig: {
      ...basePowerConfig,
      baseTest: "fisher_exact",
      objective: "achieved_power",
      effectMetric: "event_rates",
      effectValue: { group1: 0.3, group2: 0.6 },
      plannedSample: { mode: "per_group", value: 14 },
      engine: "simulation",
    },
  })));
  assert.ok(typeof fisher.achieved_power === "number");

  const pearson = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    powerConfig: {
      ...basePowerConfig,
      baseTest: "pearson",
      objective: "sample_size",
      targetEffect: "association",
      effectMetric: "r",
      effectValue: 0.35,
      plannedSample: { mode: "total", value: 20 },
      engine: "analytic",
    },
  })));
  assert.ok(typeof pearson.recommended_total_n === "number");

  const spearman = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    powerConfig: {
      ...basePowerConfig,
      baseTest: "spearman",
      objective: "achieved_power",
      targetEffect: "association",
      effectMetric: "r",
      effectValue: 0.35,
      plannedSample: { mode: "total", value: 24 },
      engine: "simulation",
    },
  })));
  assert.ok(typeof spearman.achieved_power === "number");

  const logRank = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    group1: "Control",
    group2: "Treatment",
    powerConfig: {
      ...basePowerConfig,
      baseTest: "log_rank",
      objective: "achieved_power",
      targetEffect: "survival",
      effectMetric: "hazard_ratio",
      effectValue: 1.6,
      plannedSample: { mode: "subjects_total", value: 40 },
      engine: "simulation",
    },
  })));
  assert.ok(typeof logRank.achieved_power === "number");

  const roc = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    binaryGroupA: "Control",
    binaryGroupB: "Treatment",
    powerConfig: {
      ...basePowerConfig,
      baseTest: "roc_curve",
      objective: "achieved_power",
      targetEffect: "discrimination",
      effectMetric: "auc",
      effectValue: 0.72,
      plannedSample: { mode: "total", value: 32 },
      engine: "simulation",
    },
  })));
  assert.ok(typeof roc.achieved_power === "number");

  const nonlinear = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    measureKey: "response",
    predictorMeasureKey: "dose",
    regressionModelFamily: "linear",
    powerConfig: {
      ...basePowerConfig,
      baseTest: "nonlinear_regression",
      objective: "achieved_power",
      targetEffect: "model_fit",
      effectMetric: "r2",
      effectValue: 0.25,
      plannedSample: { mode: "total", value: 28 },
      engine: "simulation",
    },
  })));
  assert.ok(typeof nonlinear.achieved_power === "number");

  const doseResponse = expectPowerResult(runPowerAnalysis(buildInput(independentRows, {
    measureKey: "response",
    predictorMeasureKey: "dose",
    powerConfig: {
      ...basePowerConfig,
      baseTest: "dose_response",
      objective: "achieved_power",
      targetEffect: "model_fit",
      effectMetric: "r2",
      effectValue: 0.22,
      plannedSample: { mode: "total", value: 28 },
      engine: "simulation",
    },
  })));
  assert.ok(typeof doseResponse.achieved_power === "number");

  console.log("colony_analysis_power_regression: ok");
}

run();
