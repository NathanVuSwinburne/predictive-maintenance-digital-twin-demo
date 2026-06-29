import type { ManualPredictionResult, PredictionConfig } from "@/lib/domain/types";
import { getDemoAsset } from "./assets";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function createPredictionConfig(machineId: string): PredictionConfig {
  const asset = getDemoAsset(machineId);
  return { machineId, machineType: asset.machineType, title: `${asset.name} manual prediction`, description: "Evaluate a deterministic engineering demo scenario against the asset operating envelope.", failureThreshold: 0.5, warnings: ["Deterministic demo engineering score; not production inference."], fields: asset.predictionFields.map((field) => structuredClone(field)) };
}

export function scorePrediction(machineId: string, values: Record<string, number | string>): ManualPredictionResult {
  const asset = getDemoAsset(machineId);
  const breachedFields = asset.predictionFields.filter((field) => field.range && typeof values[field.key] === "number" && (Number(values[field.key]) < field.range.recommendedMin || Number(values[field.key]) > field.range.recommendedMax)).map((field) => field.key);
  const stress = (key: string) => {
    const range = asset.predictionFields.find((field) => field.key === key)?.range;
    if (!range) return 0;
    return clamp(Math.abs(Number(values[key] ?? range.typicalValue) - range.typicalValue) / (Math.max(0.001, range.observedMax - range.observedMin) * 0.42));
  };
  let score: number;
  if (asset.machineType === "ai4i") {
    const thermal = clamp(Math.abs(Number(values.processTempK ?? 309) - Number(values.airTempK ?? 299) - 10) / 12);
    score = thermal * 0.35 + (stress("torque") * 0.65 + stress("rotationalSpeed") * 0.35) * 0.35 + stress("toolWear") * 0.3;
  } else if (asset.machineType === "sensor") {
    score = stress("temperature") * 0.3 + stress("vibration") * 0.35 + stress("pressure") * 0.15 + stress("humidity") * 0.08 + stress("power") * 0.12;
  } else {
    const axes = ["vibrationX", "vibrationY", "vibrationZ"].map((key) => Number(values[key] ?? 0.3));
    const magnitude = Math.sqrt(axes.reduce((sum, value) => sum + value ** 2, 0));
    const imbalance = (Math.max(...axes) - Math.min(...axes)) / Math.max(0.01, magnitude);
    score = clamp(magnitude / 1.45) * 0.55 + clamp(imbalance / 0.65) * 0.25 + stress("temperature") * 0.2;
  }
  const probability = clamp(0.08 + score * 0.84 + breachedFields.length * 0.035, 0.02, 0.98);
  const severity = probability > 0.75 ? "high" : probability > 0.45 ? "medium" : "low";
  return { machineId, machineType: asset.machineType, predictedLabel: probability >= 0.5 ? "Elevated risk" : "Normal", failureProbability: probability, confidence: 0.88, severity, failureType: asset.failureModes[0], thresholdTriggered: probability >= 0.5, warnings: ["Deterministic demo engineering score; not production inference."], breachedFields, generatedAt: "2026-06-28T08:00:00.000Z" };
}
