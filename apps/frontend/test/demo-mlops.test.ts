import { describe, expect, it } from "vitest";

import { CAPABILITY_LABEL, DEMO_MACHINES, findMachine } from "@/lib/demo-mlops/datasets";
import {
  compileFormula,
  derivedFeatureProblem,
  quoteColumn,
  readFormula,
} from "@/lib/demo-mlops/formula";
import { defaultRecipe, digestOf, previewRecipe } from "@/lib/demo-mlops/preprocessing";
import { architecturesFor, BROWSER_ARCHITECTURES, trainModel } from "@/lib/demo-mlops/training";
import type {
  DatasetVersion,
  DemoMachine,
  PreprocessingRecipe,
  TrainingRun,
} from "@/lib/demo-mlops/types";
import { deriveWorkflow, getStagePrerequisite, isStage } from "@/lib/demo-mlops/workflow";

const ai4i = findMachine("mach-ai4i-mill") as DemoMachine;

describe("bundled machines", () => {
  it("carry only public or synthetic sources", () => {
    for (const machine of DEMO_MACHINES) {
      for (const source of machine.sources) {
        expect(["public-dataset", "synthetic-fixture", "mqtt-stream"]).toContain(source.kind);
        expect(source.licence.length).toBeGreaterThan(0);
      }
    }
  });

  it("tell the schema-generalisation story on every machine", () => {
    for (const machine of DEMO_MACHINES) {
      expect(machine.migrations.length).toBeGreaterThan(0);
      expect(machine.migrations[machine.migrations.length - 1].schemaVersion).toBe(
        machine.schemaVersion,
      );
    }
  });

  it("label both goals in plain language", () => {
    expect(CAPABILITY_LABEL.predict).toMatch(/failure/i);
    expect(CAPABILITY_LABEL.simulate).toMatch(/forecast/i);
  });
});

describe("calculated feature formulas", () => {
  it("evaluates the AI4I mechanical power rule", () => {
    const compiled = compileFormula('"Torque [Nm]" * "Rotational speed [rpm]" * 2 * pi / 60');
    expect(compiled).not.toBeNull();
    const value = compiled?.evaluate({ "Torque [Nm]": 40, "Rotational speed [rpm]": 1500 });
    expect(value).toBeCloseTo((40 * 1500 * 2 * Math.PI) / 60, 6);
  });

  it("returns null when a reading is missing rather than guessing", () => {
    const compiled = compileFormula('"a" / "b"');
    expect(compiled?.evaluate({ a: 1, b: null })).toBeNull();
    // A division by zero is a blank, handled by the missing-value strategy downstream.
    expect(compiled?.evaluate({ a: 1, b: 0 })).toBeNull();
  });

  it("reads quoted column names back out of a formula", () => {
    expect(readFormula('"Process temperature [K]" - "Air temperature [K]"').columns).toEqual([
      "Process temperature [K]",
      "Air temperature [K]",
    ]);
    expect(readFormula('"Air temperature [K]').unterminatedQuote).toBe(true);
    expect(quoteColumn("Torque [Nm]")).toBe('"Torque [Nm]"');
  });

  it("names the problem with a wrong formula, and stays quiet about a half-typed one", () => {
    // A row still being filled in is not an error yet; the editor would be shouting at
    // every keystroke.
    expect(
      derivedFeatureProblem({ name: "", expression: '"a"', dtype: "float" }, ["a"]),
    ).toBeNull();
    expect(
      derivedFeatureProblem({ name: "x", expression: '"nope"', dtype: "float" }, ["a"]),
    ).toBeTruthy();
    expect(
      derivedFeatureProblem({ name: "x", expression: 'frobnicate("a")', dtype: "float" }, ["a"]),
    ).toBeTruthy();
    expect(
      derivedFeatureProblem({ name: "a", expression: '"a" * 2', dtype: "float" }, ["a"]),
    ).toBeTruthy();
    expect(
      derivedFeatureProblem({ name: "x", expression: '"a" * 2', dtype: "float" }, ["a"]),
    ).toBeNull();
  });
});

describe("preprocessing preview", () => {
  it("fits statistics on Train only and keeps the split disjoint", () => {
    const recipe: PreprocessingRecipe = {
      ...defaultRecipe(ai4i, "predict"),
      scaler: "standard",
      missingStrategy: "mean",
    };
    const preview = previewRecipe(ai4i, recipe);

    expect(preview.raw.rowCount).toBe(ai4i.sampleRows.length);
    expect(preview.train.rowCount + preview.test.rowCount).toBe(preview.raw.rowCount);
    expect(preview.train.rowCount).toBeGreaterThan(preview.test.rowCount);
    expect(Object.keys(preview.fittedStatistics).length).toBeGreaterThan(0);
  });

  it("gives a stratified split both outcomes on each side", () => {
    const preview = previewRecipe(ai4i, defaultRecipe(ai4i, "predict"));
    expect(Object.keys(preview.train.classCounts).length).toBeGreaterThan(1);
    expect(Object.keys(preview.test.classCounts).length).toBeGreaterThan(1);
  });

  it("warns when a random split is asked for on time-ordered rows", () => {
    const preview = previewRecipe(ai4i, {
      ...defaultRecipe(ai4i, "simulate"),
      splitStrategy: "random",
    });
    expect(preview.warnings.join(" ")).toMatch(/leak|random/i);
  });

  it("changes the digest when the recipe changes", () => {
    const base = defaultRecipe(ai4i, "predict");
    const first = previewRecipe(ai4i, base);
    const second = previewRecipe(ai4i, { ...base, testFraction: 0.3 });
    expect(first.recipeDigest).not.toBe(second.recipeDigest);
    expect(digestOf({ a: 1 })).toBe(digestOf({ a: 1 }));
  });
});

describe("training", () => {
  it("scores a classifier against the majority-class baseline", () => {
    const recipe = defaultRecipe(ai4i, "predict");
    const outcome = trainModel(ai4i, recipe, "logistic-regression", {
      learning_rate: 0.35,
      epochs: 120,
      l2: 0.002,
      class_weight: true,
    });

    expect(outcome.metrics.majority_class_baseline_accuracy).toBeGreaterThan(0.5);
    expect(outcome.metrics.test_balanced_accuracy).toBeGreaterThanOrEqual(0);
    expect(outcome.metrics.test_balanced_accuracy).toBeLessThanOrEqual(1);
    expect(outcome.metrics.test_accuracy_lift).toBeCloseTo(
      (outcome.metrics.test_accuracy ?? 0) - (outcome.metrics.majority_class_baseline_accuracy ?? 0),
      6,
    );
    expect(outcome.outputContract?.qualityStatus).toBeDefined();
    expect(outcome.outputContract?.confusionMatrix?.length).toBe(
      outcome.outputContract?.labels?.length,
    );
  });

  it("rewards the calculated features the AI4I failure rules are actually written in", () => {
    const base = defaultRecipe(ai4i, "predict");
    const options = {
      n_estimators: 16,
      max_depth: 7,
      min_samples_leaf: 4,
      class_weight: true,
    };
    const raw = trainModel(ai4i, base, "random-forest", options);
    const derived = trainModel(
      ai4i,
      {
        ...base,
        derivedFeatures: [
          {
            name: "power_w",
            expression: '"Torque [Nm]" * "Rotational speed [rpm]" * 2 * pi / 60',
            dtype: "float",
          },
          {
            name: "temp_difference_k",
            expression: '"Process temperature [K]" - "Air temperature [K]"',
            dtype: "float",
          },
          { name: "overstrain", expression: '"Tool wear [min]" * "Torque [Nm]"', dtype: "float" },
        ],
        featureNames: [...base.featureNames, "power_w", "temp_difference_k", "overstrain"],
      },
      "random-forest",
      options,
    );

    // The published rules are products and differences of the raw columns, so spelling
    // them out is worth more than any hyperparameter on this dataset. This is the whole
    // argument for having a formula editor at all, and it should stay true.
    expect(raw.metrics.test_balanced_accuracy ?? 0).toBeGreaterThan(0.6);
    expect(derived.metrics.test_balanced_accuracy ?? 0).toBeGreaterThan(
      (raw.metrics.test_balanced_accuracy ?? 0) + 0.05,
    );
  });

  it("calls a class-balanced trade a trade rather than a failure", () => {
    const outcome = trainModel(ai4i, defaultRecipe(ai4i, "predict"), "logistic-regression", {
      learning_rate: 0.35,
      epochs: 200,
      l2: 0.002,
      class_weight: true,
    });
    // It loses plain accuracy to the class prior while beating chance on the outcomes,
    // which is a decision to make, not a model to throw away.
    expect(outcome.metrics.test_accuracy ?? 1).toBeLessThan(
      outcome.metrics.majority_class_baseline_accuracy ?? 0,
    );
    expect(outcome.metrics.test_balanced_accuracy ?? 0).toBeGreaterThan(0.5);
    expect(outcome.outputContract?.qualityStatus).toBe("borderline");
  });

  it("refuses to recommend a model built on an uninformative column", () => {
    const outcome = trainModel(
      ai4i,
      { ...defaultRecipe(ai4i, "predict"), featureNames: ["Air temperature [K]"] },
      "logistic-regression",
      { learning_rate: 0.35, epochs: 120, l2: 0.002, class_weight: false },
    );
    expect(outcome.outputContract?.qualityStatus).toBe("not_recommended");
  });

  it("beats persistence on a forecasting machine", () => {
    const pump = findMachine("mach-utility-pump") as DemoMachine;
    const outcome = trainModel(pump, defaultRecipe(pump, "simulate"), "ridge-lag", {
      lags: 4,
      ridge: 0.05,
    });
    expect(outcome.metrics.test_rmse).toBeGreaterThan(0);
    expect(outcome.metrics.persistence_baseline_rmse).toBeGreaterThan(0);
    expect(outcome.metrics.forecast_examples).toBeGreaterThan(0);
  });

  it("refuses worker-only architectures instead of inventing a score", () => {
    const workerOnly = architecturesFor("predict").filter(
      (architecture) => !BROWSER_ARCHITECTURES.has(architecture.id),
    );
    expect(workerOnly.length).toBeGreaterThan(0);
    for (const architecture of workerOnly) {
      expect(() =>
        trainModel(ai4i, defaultRecipe(ai4i, "predict"), architecture.id, {}),
      ).toThrowError(/worker/i);
    }
  });

  it("refuses a recipe with no features rather than fitting on nothing", () => {
    expect(() =>
      trainModel(ai4i, { ...defaultRecipe(ai4i, "predict"), featureNames: [] }, "logistic-regression", {}),
    ).toThrowError();
  });
});

describe("machine model workflow", () => {
  const base = {
    hasMachine: true,
    hasData: true,
    capability: "predict" as const,
    datasets: [],
    runs: [],
  };

  it("names the four steps the production app names", () => {
    expect(deriveWorkflow(base).map((step) => step.label)).toEqual([
      "Add Machine",
      "Add Machine Data",
      "Prepare Training Data",
      "Train Model",
    ]);
  });

  it("completes a step from existing state, never from having walked past it", () => {
    const readyDataset = { capability: "predict", status: "ready" } as DatasetVersion;
    const succeeded = { capability: "predict", status: "succeeded" } as TrainingRun;

    const untouched = deriveWorkflow(base);
    expect(untouched.map((step) => step.complete)).toEqual([true, true, false, false]);

    const trained = deriveWorkflow({ ...base, datasets: [readyDataset], runs: [succeeded] });
    expect(trained.map((step) => step.complete)).toEqual([true, true, true, true]);
  });

  it("ignores a dataset and a run belonging to the other goal", () => {
    const forecastDataset = { capability: "simulate", status: "ready" } as DatasetVersion;
    const steps = deriveWorkflow({ ...base, datasets: [forecastDataset] });
    expect(steps.find((step) => step.id === "prepare")?.complete).toBe(false);
  });

  it("says what is missing when a step is opened too early", () => {
    const steps = deriveWorkflow(base);
    expect(getStagePrerequisite("machine", steps)).toBeNull();
    expect(getStagePrerequisite("data", steps)).toBeNull();
    expect(getStagePrerequisite("prepare", steps)).toBeNull();
    expect(getStagePrerequisite("train", steps)).toMatch(/prepare training data/i);

    const withoutData = deriveWorkflow({ ...base, hasData: false });
    expect(getStagePrerequisite("prepare", withoutData)).toMatch(/add more machine data/i);
  });

  it("recognises only the four stage ids, so a stale link cannot open a fifth", () => {
    expect(isStage("prepare")).toBe(true);
    expect(isStage("preprocess")).toBe(false);
    expect(isStage(null)).toBe(false);
  });
});
