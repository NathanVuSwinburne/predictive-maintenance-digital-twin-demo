/**
 * Training, in the browser, for real.
 *
 * The models here are small: logistic regression, a bagged CART forest, gradient-boosted
 * stumps, a one-hidden-layer network, ridge regression on lagged readings, but they are
 * genuinely fitted on the Train split and genuinely scored on rows they never saw. That
 * matters more than the size of the model: the point of this pane is that a recipe which
 * throws away the informative columns produces a model that loses to always guessing the
 * common answer, and you can only show that honestly if the number is not scripted.
 *
 * The architectures the production registry trains on a GPU worker (LSTM, GRU, TCN,
 * XGBoost) are listed and described here, and refused with a reason rather than faked.
 */

import { materialiseRows, transformedFeatureNames } from "@/lib/demo-mlops/preprocessing";
import type {
  ArchitectureOption,
  Capability,
  DemoMachine,
  PreprocessingRecipe,
  QualityStatus,
  SampleRow,
} from "@/lib/demo-mlops/types";

export const ARCHITECTURES: ArchitectureOption[] = [
  {
    id: "logistic-regression",
    label: "Logistic regression",
    capability: "predict",
    description:
      "A linear decision boundary fitted by gradient descent. Fast, and the honest floor every other model has to clear.",
    parameters: [
      { key: "learning_rate", label: "Learning rate", description: "Step size for gradient descent.", type: "number", default: 0.35, minimum: 0.01, maximum: 2 },
      { key: "epochs", label: "Epochs", description: "Full passes over the training rows.", type: "integer", default: 320, minimum: 20, maximum: 1200 },
      { key: "l2", label: "L2 penalty", description: "Shrinks the weights to keep the boundary from chasing noise.", type: "number", default: 0.002, minimum: 0, maximum: 1 },
      { key: "class_weight", label: "Balance classes", description: "Weight each outcome by its rarity, so a 3 % class is not simply ignored.", type: "boolean", default: true },
    ],
  },
  {
    id: "random-forest",
    label: "Random forest",
    capability: "predict",
    description:
      "Bagged CART trees, each grown on a bootstrap sample and a random subset of columns. Handles the products and thresholds that failure rules are made of.",
    parameters: [
      { key: "n_estimators", label: "Trees", description: "How many trees vote.", type: "integer", default: 24, minimum: 4, maximum: 80 },
      { key: "max_depth", label: "Max depth", description: "How many questions deep any one tree may go.", type: "integer", default: 7, minimum: 2, maximum: 14 },
      { key: "min_samples_leaf", label: "Min rows per leaf", description: "Refuses splits that would isolate a handful of rows.", type: "integer", default: 4, minimum: 1, maximum: 40 },
      { key: "class_weight", label: "Balance classes", description: "Weight the rare outcome up when scoring a split.", type: "boolean", default: true },
    ],
  },
  {
    id: "gradient-boosting",
    label: "Gradient boosting",
    capability: "predict",
    description:
      "Shallow trees fitted one after another on what the previous ones got wrong, under a logistic loss.",
    parameters: [
      { key: "n_estimators", label: "Boosting rounds", description: "How many corrective trees to add.", type: "integer", default: 60, minimum: 5, maximum: 250 },
      { key: "learning_rate", label: "Learning rate", description: "How much of each correction to keep.", type: "number", default: 0.18, minimum: 0.01, maximum: 1 },
      { key: "max_depth", label: "Max depth", description: "Depth of each corrective tree.", type: "integer", default: 3, minimum: 1, maximum: 6 },
    ],
  },
  {
    id: "mlp",
    label: "Small neural network",
    capability: "predict",
    description: "One hidden tanh layer trained by gradient descent. Needs scaled inputs; leave the scaler on None and watch it struggle.",
    parameters: [
      { key: "hidden_units", label: "Hidden units", description: "Width of the single hidden layer.", type: "integer", default: 12, minimum: 2, maximum: 48 },
      { key: "learning_rate", label: "Learning rate", description: "Step size for gradient descent.", type: "number", default: 0.08, minimum: 0.001, maximum: 1 },
      { key: "epochs", label: "Epochs", description: "Full passes over the training rows.", type: "integer", default: 220, minimum: 20, maximum: 800 },
    ],
  },
  {
    id: "xgboost",
    label: "XGBoost",
    capability: "predict",
    description: "The production registry's gradient-boosting implementation. Trains on the worker, not in a browser tab.",
    parameters: [],
  },
  {
    id: "ridge-lag",
    label: "Ridge regression on lagged readings",
    capability: "simulate",
    description:
      "Predicts the next reading of every selected sensor from the previous few, fitted per column with a ridge penalty. Never reads across a session boundary.",
    parameters: [
      { key: "lags", label: "Lags", description: "How many previous readings feed each prediction.", type: "integer", default: 4, minimum: 1, maximum: 12 },
      { key: "ridge", label: "Ridge penalty", description: "Keeps the normal equations well behaved when lags correlate.", type: "number", default: 0.05, minimum: 0, maximum: 5 },
    ],
  },
  {
    id: "lstm",
    label: "LSTM sequence model",
    capability: "simulate",
    description:
      "The production forecaster: 20 minutes of telemetry in, 10 minutes out, extended autoregressively. Trains on the worker with a GPU.",
    parameters: [],
  },
  {
    id: "gru",
    label: "GRU sequence model",
    capability: "simulate",
    description: "A lighter recurrent alternative evaluated against the same long-horizon criteria. Worker only.",
    parameters: [],
  },
  {
    id: "tcn",
    label: "Temporal convolutional network",
    capability: "simulate",
    description: "Dilated causal convolutions over the same windows. Worker only.",
    parameters: [],
  },
];

/** Architectures the browser can actually fit. The rest are described, then refused. */
export const BROWSER_ARCHITECTURES = new Set([
  "logistic-regression",
  "random-forest",
  "gradient-boosting",
  "mlp",
  "ridge-lag",
]);

export function defaultsForArchitecture(architecture: ArchitectureOption) {
  return Object.fromEntries(architecture.parameters.map((parameter) => [parameter.key, parameter.default]));
}

export function findArchitecture(id: string): ArchitectureOption | undefined {
  return ARCHITECTURES.find((architecture) => architecture.id === id);
}

// --- shared plumbing ----------------------------------------------------------------

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * fraction;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

type Matrix = number[][];

type Prepared = {
  featureNames: string[];
  trainX: Matrix;
  trainY: number[];
  testX: Matrix;
  testY: number[];
  classes: string[];
};

function splitForTraining(rows: SampleRow[], recipe: PreprocessingRecipe): { train: SampleRow[]; test: SampleRow[] } {
  if (recipe.splitStrategy === "none" || rows.length < 8) return { train: rows, test: [] };
  const testCount = Math.max(1, Math.round(rows.length * recipe.testFraction));
  if (recipe.splitStrategy === "chronological") {
    const ordered = [...rows].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    return { train: ordered.slice(0, rows.length - testCount), test: ordered.slice(rows.length - testCount) };
  }
  if (recipe.splitStrategy === "random") {
    const random = seededRandom(recipe.seed);
    const shuffled = rows
      .map((row) => ({ row, key: random() }))
      .sort((left, right) => left.key - right.key)
      .map((entry) => entry.row);
    return { train: shuffled.slice(testCount), test: shuffled.slice(0, testCount) };
  }
  const column = recipe.target?.column;
  if (!column) return { train: rows.slice(testCount), test: rows.slice(0, testCount) };
  const random = seededRandom(recipe.seed);
  const groups = new Map<string, SampleRow[]>();
  for (const row of rows) {
    const key = String(row.values[column] ?? "missing");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const train: SampleRow[] = [];
  const test: SampleRow[] = [];
  for (const group of groups.values()) {
    const shuffled = group
      .map((row) => ({ row, key: random() }))
      .sort((left, right) => left.key - right.key)
      .map((entry) => entry.row);
    const take = Math.max(1, Math.round(shuffled.length * recipe.testFraction));
    test.push(...shuffled.slice(0, take));
    train.push(...shuffled.slice(take));
  }
  return { train, test };
}

/**
 * Turn the recipe into the numeric design matrix a learner can eat. Every statistic used
 * here (imputation, clipping bounds, scaling, category vocabulary) is fitted on Train
 * and then applied unchanged to Test, exactly as the preview claims.
 */
function prepareMatrices(machine: DemoMachine, recipe: PreprocessingRecipe): Prepared {
  const { rows } = materialiseRows(machine, recipe);
  const { train, test } = splitForTraining(rows, recipe);

  const statistics: Record<string, { mean: number; median: number; std: number; q1: number; q3: number; min: number; max: number }> = {};
  for (const name of recipe.featureNames) {
    const values = train
      .map((row) => Number(row.values[name]))
      .filter((value) => Number.isFinite(value));
    const sorted = [...values].sort((left, right) => left - right);
    const mean = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length || 1);
    statistics[name] = {
      mean,
      median: quantile(sorted, 0.5),
      std: Math.sqrt(variance),
      q1: quantile(sorted, 0.25),
      q3: quantile(sorted, 0.75),
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
    };
  }
  const vocabulary: Record<string, string[]> = {};
  const frequency: Record<string, Record<string, number>> = {};
  for (const feature of recipe.categoricalFeatures) {
    const counts: Record<string, number> = {};
    for (const row of train) {
      const raw = row.values[feature.name];
      if (raw === null || raw === undefined || raw === "") continue;
      const key = String(raw);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    vocabulary[feature.name] = Object.keys(counts).sort();
    frequency[feature.name] = counts;
  }

  function encode(row: SampleRow): number[] {
    const vector: number[] = [];
    for (const name of recipe.featureNames) {
      const summary = statistics[name];
      let value = Number(row.values[name]);
      if (!Number.isFinite(value)) {
        value =
          recipe.missingStrategy === "mean"
            ? summary.mean
            : recipe.missingStrategy === "median"
              ? summary.median
              : 0;
      }
      if (recipe.outlierClipping) {
        const spread = summary.q3 - summary.q1;
        value = Math.min(Math.max(value, summary.q1 - recipe.iqrMultiplier * spread), summary.q3 + recipe.iqrMultiplier * spread);
      }
      if (recipe.scaler === "standard") value = summary.std === 0 ? 0 : (value - summary.mean) / summary.std;
      else if (recipe.scaler === "robust") {
        const spread = summary.q3 - summary.q1;
        value = spread === 0 ? 0 : (value - summary.median) / spread;
      } else if (recipe.scaler === "minmax") {
        const span = summary.max - summary.min;
        value = span === 0 ? 0 : (value - summary.min) / span;
      }
      vector.push(value);
    }
    for (const feature of recipe.categoricalFeatures) {
      const known = vocabulary[feature.name] ?? [];
      const raw = row.values[feature.name];
      const key = raw === null || raw === undefined || raw === "" ? null : String(raw);
      if (feature.encoding === "one_hot") {
        for (const category of known) vector.push(key === category ? 1 : 0);
        if (recipe.unknownCategoryPolicy === "unknown_bucket") {
          vector.push(key !== null && !known.includes(key) ? 1 : 0);
        }
      } else if (feature.encoding === "frequency") {
        const counts = frequency[feature.name] ?? {};
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        vector.push(total === 0 || key === null ? 0 : (counts[key] ?? 0) / total);
      } else {
        const order = feature.ordinalOrder.length > 0 ? feature.ordinalOrder : known;
        vector.push(key === null ? -1 : order.indexOf(key));
      }
    }
    return vector;
  }

  const classes = recipe.target?.classes ?? [];
  const labelOf = (row: SampleRow) =>
    recipe.target ? classes.indexOf(String(row.values[recipe.target.column] ?? "")) : -1;

  return {
    featureNames: transformedFeatureNames(recipe, {
      categorical: Object.fromEntries(
        Object.entries(vocabulary).map(([name, categories]) => [
          name,
          { categories, frequencies: {}, mode: null, missing: 0 },
        ]),
      ),
    }),
    trainX: train.map(encode),
    trainY: train.map(labelOf),
    testX: test.map(encode),
    testY: test.map(labelOf),
    classes,
  };
}

// --- learners -----------------------------------------------------------------------

function standardise(matrix: Matrix) {
  const width = matrix[0]?.length ?? 0;
  const means = Array.from({ length: width }, (_, column) =>
    matrix.reduce((sum, row) => sum + row[column], 0) / (matrix.length || 1),
  );
  const deviations = Array.from({ length: width }, (_, column) => {
    const variance =
      matrix.reduce((sum, row) => sum + (row[column] - means[column]) ** 2, 0) / (matrix.length || 1);
    return Math.sqrt(variance) || 1;
  });
  return {
    apply: (rows: Matrix) => rows.map((row) => row.map((value, column) => (value - means[column]) / deviations[column])),
  };
}

function fitLogistic(x: Matrix, y: number[], options: { learningRate: number; epochs: number; l2: number; balanced: boolean }) {
  const width = x[0]?.length ?? 0;
  const weights = new Array<number>(width).fill(0);
  let bias = 0;
  const positives = y.filter((label) => label === 1).length || 1;
  const negatives = y.length - positives || 1;
  const positiveWeight = options.balanced ? y.length / (2 * positives) : 1;
  const negativeWeight = options.balanced ? y.length / (2 * negatives) : 1;

  for (let epoch = 0; epoch < options.epochs; epoch += 1) {
    const gradients = new Array<number>(width).fill(0);
    let biasGradient = 0;
    for (let index = 0; index < x.length; index += 1) {
      let z = bias;
      for (let column = 0; column < width; column += 1) z += weights[column] * x[index][column];
      const probability = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
      const weight = y[index] === 1 ? positiveWeight : negativeWeight;
      const error = (probability - y[index]) * weight;
      for (let column = 0; column < width; column += 1) gradients[column] += error * x[index][column];
      biasGradient += error;
    }
    const scale = options.learningRate / (x.length || 1);
    for (let column = 0; column < width; column += 1) {
      weights[column] -= scale * (gradients[column] + options.l2 * weights[column]);
    }
    bias -= scale * biasGradient;
  }

  return (row: number[]) => {
    let z = bias;
    for (let column = 0; column < row.length; column += 1) z += weights[column] * row[column];
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  };
}

type TreeNode =
  | { kind: "leaf"; value: number }
  | { kind: "split"; column: number; threshold: number; left: TreeNode; right: TreeNode };

function growTree(
  x: Matrix,
  y: number[],
  weights: number[],
  indices: number[],
  depth: number,
  options: { maxDepth: number; minLeaf: number; featureSample: number; random: () => number; criterion: "gini" | "variance" },
): TreeNode {
  const totalWeight = indices.reduce((sum, index) => sum + weights[index], 0);
  const mean = totalWeight === 0 ? 0 : indices.reduce((sum, index) => sum + weights[index] * y[index], 0) / totalWeight;
  if (depth >= options.maxDepth || indices.length <= options.minLeaf * 2) {
    return { kind: "leaf", value: mean };
  }
  const width = x[0]?.length ?? 0;
  const columns: number[] = [];
  for (let column = 0; column < width; column += 1) columns.push(column);
  const candidates = columns
    .map((column) => ({ column, key: options.random() }))
    .sort((left, right) => left.key - right.key)
    .slice(0, Math.max(1, Math.round(width * options.featureSample)))
    .map((entry) => entry.column);

  let best: { column: number; threshold: number; score: number; left: number[]; right: number[] } | null = null;
  const impurity = (weightSum: number, valueSum: number, squareSum: number) => {
    if (weightSum === 0) return 0;
    const average = valueSum / weightSum;
    return options.criterion === "gini"
      ? weightSum * 2 * average * (1 - average)
      : squareSum - (valueSum * valueSum) / weightSum;
  };

  for (const column of candidates) {
    const ordered = [...indices].sort((left, right) => x[left][column] - x[right][column]);
    let leftWeight = 0;
    let leftValue = 0;
    let leftSquare = 0;
    let rightWeight = totalWeight;
    let rightValue = indices.reduce((sum, index) => sum + weights[index] * y[index], 0);
    let rightSquare = indices.reduce((sum, index) => sum + weights[index] * y[index] * y[index], 0);
    for (let position = 0; position < ordered.length - 1; position += 1) {
      const index = ordered[position];
      leftWeight += weights[index];
      leftValue += weights[index] * y[index];
      leftSquare += weights[index] * y[index] * y[index];
      rightWeight -= weights[index];
      rightValue -= weights[index] * y[index];
      rightSquare -= weights[index] * y[index] * y[index];
      if (position + 1 < options.minLeaf || ordered.length - position - 1 < options.minLeaf) continue;
      const current = x[index][column];
      const next = x[ordered[position + 1]][column];
      if (current === next) continue;
      const score = impurity(leftWeight, leftValue, leftSquare) + impurity(rightWeight, rightValue, rightSquare);
      if (!best || score < best.score) {
        best = {
          column,
          threshold: (current + next) / 2,
          score,
          left: ordered.slice(0, position + 1),
          right: ordered.slice(position + 1),
        };
      }
    }
  }

  if (!best) return { kind: "leaf", value: mean };
  return {
    kind: "split",
    column: best.column,
    threshold: best.threshold,
    left: growTree(x, y, weights, best.left, depth + 1, options),
    right: growTree(x, y, weights, best.right, depth + 1, options),
  };
}

function predictTree(node: TreeNode, row: number[]): number {
  let current = node;
  while (current.kind === "split") {
    current = row[current.column] <= current.threshold ? current.left : current.right;
  }
  return current.value;
}

function fitForest(x: Matrix, y: number[], options: { trees: number; maxDepth: number; minLeaf: number; balanced: boolean; seed: number }) {
  const random = seededRandom(options.seed);
  const positives = y.filter((label) => label === 1).length || 1;
  const negatives = y.length - positives || 1;
  const weights = y.map((label) =>
    options.balanced ? (label === 1 ? y.length / (2 * positives) : y.length / (2 * negatives)) : 1,
  );
  const trees: TreeNode[] = [];
  for (let index = 0; index < options.trees; index += 1) {
    const bag: number[] = [];
    for (let draw = 0; draw < y.length; draw += 1) bag.push(Math.floor(random() * y.length));
    trees.push(
      growTree(x, y, weights, bag, 0, {
        maxDepth: options.maxDepth,
        minLeaf: options.minLeaf,
        featureSample: 0.7,
        random,
        criterion: "gini",
      }),
    );
  }
  return (row: number[]) => trees.reduce((sum, tree) => sum + predictTree(tree, row), 0) / (trees.length || 1);
}

function fitBoosting(x: Matrix, y: number[], options: { rounds: number; learningRate: number; maxDepth: number; seed: number }) {
  const random = seededRandom(options.seed);
  const indices = y.map((_, index) => index);
  const weights = y.map(() => 1);
  const positiveRate = Math.min(0.999, Math.max(0.001, y.reduce((sum, label) => sum + label, 0) / (y.length || 1)));
  const initial = Math.log(positiveRate / (1 - positiveRate));
  const scores = y.map(() => initial);
  const trees: TreeNode[] = [];
  for (let round = 0; round < options.rounds; round += 1) {
    const residuals = y.map((label, index) => label - 1 / (1 + Math.exp(-scores[index])));
    const tree = growTree(x, residuals, weights, indices, 0, {
      maxDepth: options.maxDepth,
      minLeaf: 2,
      featureSample: 1,
      random,
      criterion: "variance",
    });
    trees.push(tree);
    for (let index = 0; index < scores.length; index += 1) {
      scores[index] += options.learningRate * predictTree(tree, x[index]);
    }
  }
  return (row: number[]) => {
    let score = initial;
    for (const tree of trees) score += options.learningRate * predictTree(tree, row);
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, score))));
  };
}

function fitNetwork(x: Matrix, y: number[], options: { hidden: number; learningRate: number; epochs: number; seed: number }) {
  const random = seededRandom(options.seed);
  const width = x[0]?.length ?? 0;
  const hiddenWeights = Array.from({ length: options.hidden }, () =>
    Array.from({ length: width }, () => (random() - 0.5) * 0.8),
  );
  const hiddenBias = new Array<number>(options.hidden).fill(0);
  const outputWeights = Array.from({ length: options.hidden }, () => (random() - 0.5) * 0.8);
  let outputBias = 0;
  const positives = y.filter((label) => label === 1).length || 1;
  const negatives = y.length - positives || 1;

  const forward = (row: number[]) => {
    const hidden = hiddenWeights.map((weights, unit) => {
      let sum = hiddenBias[unit];
      for (let column = 0; column < width; column += 1) sum += weights[column] * row[column];
      return Math.tanh(sum);
    });
    let output = outputBias;
    for (let unit = 0; unit < options.hidden; unit += 1) output += outputWeights[unit] * hidden[unit];
    return { hidden, probability: 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, output)))) };
  };

  for (let epoch = 0; epoch < options.epochs; epoch += 1) {
    for (let index = 0; index < x.length; index += 1) {
      const { hidden, probability } = forward(x[index]);
      const weight = y[index] === 1 ? y.length / (2 * positives) : y.length / (2 * negatives);
      const error = (probability - y[index]) * weight;
      for (let unit = 0; unit < options.hidden; unit += 1) {
        const gradient = error * outputWeights[unit] * (1 - hidden[unit] ** 2);
        for (let column = 0; column < width; column += 1) {
          hiddenWeights[unit][column] -= options.learningRate * gradient * x[index][column];
        }
        hiddenBias[unit] -= options.learningRate * gradient;
        outputWeights[unit] -= options.learningRate * error * hidden[unit];
      }
      outputBias -= options.learningRate * error;
    }
  }
  return (row: number[]) => forward(row).probability;
}

// --- scoring ------------------------------------------------------------------------

export type TrainingOutcome = {
  metrics: Record<string, number>;
  outputContract: {
    labels?: string[];
    confusionMatrix?: number[][];
    baselineLabel?: string;
    qualityStatus: QualityStatus;
    qualityNote: string;
  };
};

function scoreClassifier(prepared: Prepared, predict: (row: number[]) => number): TrainingOutcome {
  const { testX, testY, trainX, trainY, classes } = prepared;
  const labels = classes.length === 2 ? classes : classes;
  const present = new Set(testY.filter((label) => label >= 0));

  if (testY.length === 0 || present.size < 2) {
    return {
      metrics: {},
      outputContract: {
        labels,
        qualityStatus: "incompatible",
        qualityNote:
          "The held-out rows contain fewer than two outcomes, so accuracy on them means nothing. Change the split before reading any number here.",
      },
    };
  }

  const size = labels.length;
  const matrix = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (let index = 0; index < testY.length; index += 1) {
    const actual = testY[index];
    if (actual < 0) continue;
    const predicted = predict(testX[index]) >= 0.5 ? 1 : 0;
    matrix[actual][predicted] += 1;
  }
  const total = matrix.flat().reduce((sum, value) => sum + value, 0) || 1;
  const correct = matrix.reduce((sum, row, index) => sum + row[index], 0);
  const accuracy = correct / total;

  const recalls: number[] = [];
  const metrics: Record<string, number> = {};
  for (let index = 0; index < size; index += 1) {
    const support = matrix[index].reduce((sum, value) => sum + value, 0);
    const predictedCount = matrix.reduce((sum, row) => sum + row[index], 0);
    const recall = support === 0 ? 0 : matrix[index][index] / support;
    const precision = predictedCount === 0 ? 0 : matrix[index][index] / predictedCount;
    if (support > 0) recalls.push(recall);
    metrics[`test_recall_class_${index}`] = recall;
    metrics[`test_precision_class_${index}`] = precision;
    metrics[`test_support_class_${index}`] = support;
    metrics[`test_f1_class_${index}`] = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  }
  const balanced = recalls.reduce((sum, value) => sum + value, 0) / (recalls.length || 1);

  const counts = new Array<number>(size).fill(0);
  for (const label of trainY) if (label >= 0) counts[label] += 1;
  const majority = counts.indexOf(Math.max(...counts));
  const baselineCorrect = matrix[majority]?.reduce((sum, value) => sum + value, 0) ?? 0;
  const baselineAccuracy = baselineCorrect / total;

  let trainCorrect = 0;
  for (let index = 0; index < trainX.length; index += 1) {
    const predicted = predict(trainX[index]) >= 0.5 ? 1 : 0;
    if (predicted === trainY[index]) trainCorrect += 1;
  }

  metrics.test_accuracy = accuracy;
  metrics.test_balanced_accuracy = balanced;
  metrics.majority_class_baseline_accuracy = baselineAccuracy;
  metrics.test_accuracy_lift = accuracy - baselineAccuracy;
  metrics.train_accuracy = trainCorrect / (trainX.length || 1);
  metrics.train_test_gap = metrics.train_accuracy - accuracy;
  metrics.test_f1_macro =
    Array.from({ length: size }, (_, index) => metrics[`test_f1_class_${index}`]).reduce((sum, value) => sum + value, 0) / size;

  const minorityRecall = Math.min(...recalls);
  let qualityStatus: QualityStatus = "recommended";
  let qualityNote = "Beats the trivial answer on held-out rows, and finds the rare outcome often enough to be worth serving.";
  if (balanced <= 0.5 + 1e-9) {
    qualityStatus = "not_recommended";
    qualityNote = `This model does not beat the trivial answer. Always guessing "${labels[majority]}" would be at least as informative on the same held-out rows.`;
  } else if (accuracy <= baselineAccuracy + 1e-9) {
    // A class-balanced model routinely loses plain accuracy to catch the rare outcome.
    // That is a trade, not a failure, but it has to be made deliberately, so it is
    // spelled out here rather than hidden behind a green tick or a red cross.
    qualityStatus = "borderline";
    qualityNote = `It finds the rare outcome far more often than the trivial answer and pays for it in plain accuracy, ${(accuracy * 100).toFixed(1)} % against ${(baselineAccuracy * 100).toFixed(1)} %. That is the right trade only where a missed ${labels[1 - majority] ?? "event"} costs more than a false alarm.`;
  } else if (minorityRecall < 0.25 || metrics.test_accuracy_lift < 0.01) {
    qualityStatus = "borderline";
    qualityNote =
      "It clears the baseline, but only just, or it clears it by being right about the common outcome and wrong about the one that matters. Read the per-outcome table before promoting it.";
  } else if (metrics.train_test_gap > 0.2) {
    qualityStatus = "borderline";
    qualityNote = "The gap between Train and Test accuracy is wide enough to suggest the model has memorised its training rows.";
  }

  return {
    metrics,
    outputContract: {
      labels,
      confusionMatrix: matrix,
      baselineLabel: labels[majority],
      qualityStatus,
      qualityNote,
    },
  };
}

/**
 * One-step-ahead forecasting, scored against persistence.
 *
 * Lags never reach across a session boundary: a window that spanned the four-day gap
 * between two runs would average two unrelated episodes into a row that never happened.
 */
function trainForecaster(
  machine: DemoMachine,
  recipe: PreprocessingRecipe,
  hyperparameters: Record<string, string | number | boolean>,
): TrainingOutcome {
  const { rows } = materialiseRows(machine, recipe);
  const lags = Math.max(1, Number(hyperparameters.lags ?? 4));
  const ridge = Math.max(0, Number(hyperparameters.ridge ?? 0.05));
  const columns = recipe.featureNames;

  const bySession = new Map<string, SampleRow[]>();
  for (const row of [...rows].sort((left, right) => left.timestamp.localeCompare(right.timestamp))) {
    const group = bySession.get(row.sessionId) ?? [];
    group.push(row);
    bySession.set(row.sessionId, group);
  }

  type Example = { features: number[]; targets: number[]; previous: number[]; timestamp: string };
  const examples: Example[] = [];
  for (const group of bySession.values()) {
    for (let index = lags; index < group.length; index += 1) {
      const features: number[] = [];
      let usable = true;
      for (let step = 1; step <= lags; step += 1) {
        for (const column of columns) {
          const value = Number(group[index - step].values[column]);
          if (!Number.isFinite(value)) usable = false;
          features.push(Number.isFinite(value) ? value : 0);
        }
      }
      const targets = columns.map((column) => Number(group[index].values[column]));
      if (!usable || targets.some((value) => !Number.isFinite(value))) continue;
      examples.push({
        features,
        targets,
        previous: columns.map((column) => Number(group[index - 1].values[column])),
        timestamp: group[index].timestamp,
      });
    }
  }

  if (examples.length < 20) {
    return {
      metrics: {},
      outputContract: {
        qualityStatus: "incompatible",
        qualityNote: "There are not enough consecutive readings inside a single session to build a forecasting example.",
      },
    };
  }

  const ordered =
    recipe.splitStrategy === "random"
      ? (() => {
          const random = seededRandom(recipe.seed);
          return examples
            .map((example) => ({ example, key: random() }))
            .sort((left, right) => left.key - right.key)
            .map((entry) => entry.example);
        })()
      : [...examples].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const testCount = recipe.splitStrategy === "none" ? 0 : Math.max(1, Math.round(ordered.length * recipe.testFraction));
  const train = ordered.slice(0, ordered.length - testCount);
  const test = testCount === 0 ? ordered : ordered.slice(ordered.length - testCount);

  // Per-column scaling fitted on Train, so a temperature in °C does not swamp a 0.4 g axis.
  const width = train[0].features.length;
  const means = Array.from({ length: width }, (_, column) => train.reduce((sum, example) => sum + example.features[column], 0) / train.length);
  const deviations = Array.from({ length: width }, (_, column) => {
    const variance = train.reduce((sum, example) => sum + (example.features[column] - means[column]) ** 2, 0) / train.length;
    return Math.sqrt(variance) || 1;
  });
  const design = (example: Example) => [1, ...example.features.map((value, column) => (value - means[column]) / deviations[column])];

  const squaredErrors: number[] = [];
  const absoluteErrors: number[] = [];
  const baselineSquared: number[] = [];
  const trainSquared: number[] = [];

  for (let target = 0; target < columns.length; target += 1) {
    const size = width + 1;
    const normal = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    const rightHand = new Array<number>(size).fill(0);
    for (const example of train) {
      const row = design(example);
      const value = example.targets[target];
      for (let i = 0; i < size; i += 1) {
        rightHand[i] += row[i] * value;
        for (let j = 0; j < size; j += 1) normal[i][j] += row[i] * row[j];
      }
    }
    for (let i = 1; i < size; i += 1) normal[i][i] += ridge * train.length;
    const weights = solve(normal, rightHand);
    if (!weights) continue;
    const predict = (example: Example) => design(example).reduce((sum, value, index) => sum + value * weights[index], 0);
    for (const example of train) trainSquared.push((predict(example) - example.targets[target]) ** 2);
    for (const example of test) {
      const error = predict(example) - example.targets[target];
      squaredErrors.push(error ** 2);
      absoluteErrors.push(Math.abs(error));
      baselineSquared.push((example.previous[target] - example.targets[target]) ** 2);
    }
  }

  const rmse = Math.sqrt(squaredErrors.reduce((sum, value) => sum + value, 0) / (squaredErrors.length || 1));
  const baseline = Math.sqrt(baselineSquared.reduce((sum, value) => sum + value, 0) / (baselineSquared.length || 1));
  const trainRmse = Math.sqrt(trainSquared.reduce((sum, value) => sum + value, 0) / (trainSquared.length || 1));
  const mae = absoluteErrors.reduce((sum, value) => sum + value, 0) / (absoluteErrors.length || 1);

  const improvement = baseline > 0 ? (baseline - rmse) / baseline : 0;
  let qualityStatus: QualityStatus = "recommended";
  let qualityNote = "Beats simply repeating the last reading on held-out rows.";
  if (rmse >= baseline) {
    qualityStatus = "not_recommended";
    qualityNote = "This forecast does not beat simply repeating the last reading, which costs nothing to compute.";
  } else if (improvement < 0.05) {
    qualityStatus = "borderline";
    qualityNote = "It beats persistence by under five percent. That is real, but it is not much to hang a maintenance decision on.";
  }
  if (recipe.splitStrategy === "random") {
    qualityNote += " The split was random, so neighbouring readings sit on both sides of it; read this score as optimistic.";
    if (qualityStatus === "recommended") qualityStatus = "borderline";
  }

  return {
    metrics: {
      test_rmse: rmse,
      test_mae: mae,
      persistence_baseline_rmse: baseline,
      train_rmse: trainRmse,
      forecast_examples: test.length,
      horizon_steps: 1,
    },
    outputContract: { qualityStatus, qualityNote },
  };
}

/** Gaussian elimination with partial pivoting. Small systems only, which is all we build. */
function solve(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column] / augmented[column][column];
      for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row, index) => row[size] / row[index]);
}

export function trainModel(
  machine: DemoMachine,
  recipe: PreprocessingRecipe,
  architectureId: string,
  hyperparameters: Record<string, string | number | boolean>,
): TrainingOutcome {
  const architecture = findArchitecture(architectureId);
  if (!architecture) throw new Error("Unknown model.");
  if (!BROWSER_ARCHITECTURES.has(architectureId)) {
    throw new Error(
      `${architecture.label} trains on the production worker, not in a browser tab. This demo refuses to invent a score for it.`,
    );
  }
  if (architecture.capability === "simulate") {
    return trainForecaster(machine, recipe, hyperparameters);
  }

  const prepared = prepareMatrices(machine, recipe);
  if (prepared.trainX.length === 0 || (prepared.trainX[0]?.length ?? 0) === 0) {
    throw new Error("Select at least one model feature before training.");
  }

  let predict: (row: number[]) => number;
  if (architectureId === "logistic-regression") {
    const scaler = standardise(prepared.trainX);
    const trainX = scaler.apply(prepared.trainX);
    const fitted = fitLogistic(trainX, prepared.trainY, {
      learningRate: Number(hyperparameters.learning_rate ?? 0.35),
      epochs: Number(hyperparameters.epochs ?? 320),
      l2: Number(hyperparameters.l2 ?? 0.002),
      balanced: hyperparameters.class_weight !== false,
    });
    predict = (row) => fitted(scaler.apply([row])[0]);
  } else if (architectureId === "random-forest") {
    predict = fitForest(prepared.trainX, prepared.trainY, {
      trees: Number(hyperparameters.n_estimators ?? 24),
      maxDepth: Number(hyperparameters.max_depth ?? 7),
      minLeaf: Number(hyperparameters.min_samples_leaf ?? 4),
      balanced: hyperparameters.class_weight !== false,
      seed: recipe.seed,
    });
  } else if (architectureId === "gradient-boosting") {
    predict = fitBoosting(prepared.trainX, prepared.trainY, {
      rounds: Number(hyperparameters.n_estimators ?? 60),
      learningRate: Number(hyperparameters.learning_rate ?? 0.18),
      maxDepth: Number(hyperparameters.max_depth ?? 3),
      seed: recipe.seed,
    });
  } else {
    const scaler = standardise(prepared.trainX);
    const trainX = scaler.apply(prepared.trainX);
    const fitted = fitNetwork(trainX, prepared.trainY, {
      hidden: Number(hyperparameters.hidden_units ?? 12),
      learningRate: Number(hyperparameters.learning_rate ?? 0.08),
      epochs: Number(hyperparameters.epochs ?? 220),
      seed: recipe.seed,
    });
    predict = (row) => fitted(scaler.apply([row])[0]);
  }

  return scoreClassifier(prepared, predict);
}

export function architecturesFor(capability: Capability): ArchitectureOption[] {
  return ARCHITECTURES.filter((architecture) => architecture.capability === capability);
}
