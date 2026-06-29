import type { DemoAssetProfile, DemoPredictionField, DemoSensorDefinition } from "./types";

export const SENSOR_KEYS_BY_TYPE = {
  ai4i: ["airTempK", "processTempK", "rotationalSpeed", "torque", "toolWear", "power"],
  sensor: ["temperature", "vibration", "pressure", "humidity", "power"],
  "real-sensor": ["vibrationX", "vibrationY", "vibrationZ", "temperature"],
} as const;

const sensorCatalog: Record<string, Omit<DemoSensorDefinition, "key">> = {
  airTempK: { label: "Air temperature", unit: "K", min: 294, typical: 299, max: 305, warningHigh: 303 },
  processTempK: { label: "Process temperature", unit: "K", min: 302, typical: 309, max: 320, warningHigh: 316 },
  rotationalSpeed: { label: "Rotational speed", unit: "rpm", min: 900, typical: 1500, max: 2600, warningHigh: 2300 },
  torque: { label: "Torque", unit: "Nm", min: 8, typical: 42, max: 78, warningHigh: 66 },
  toolWear: { label: "Tool wear", unit: "min", min: 0, typical: 110, max: 260, warningHigh: 210 },
  temperature: { label: "Bearing temperature", unit: "°C", min: 25, typical: 57, max: 100, warningHigh: 78 },
  vibration: { label: "Vibration RMS", unit: "mm/s", min: 0.2, typical: 3.2, max: 14, warningHigh: 7.1 },
  pressure: { label: "Pressure", unit: "bar", min: 1.5, typical: 5.2, max: 9, warningHigh: 7.5 },
  humidity: { label: "Humidity", unit: "%RH", min: 15, typical: 45, max: 85, warningHigh: 70 },
  power: { label: "Power", unit: "kW", min: 5, typical: 48, max: 130, warningHigh: 105 },
  vibrationX: { label: "Vibration X", unit: "g", min: 0.01, typical: 0.34, max: 1.5, warningHigh: 0.85 },
  vibrationY: { label: "Vibration Y", unit: "g", min: 0.01, typical: 0.29, max: 1.4, warningHigh: 0.8 },
  vibrationZ: { label: "Vibration Z", unit: "g", min: 0.01, typical: 0.39, max: 1.7, warningHigh: 0.95 },
};

function sensors(type: keyof typeof SENSOR_KEYS_BY_TYPE, shift: number): DemoSensorDefinition[] {
  return SENSOR_KEYS_BY_TYPE[type].map((key) => {
    const base = sensorCatalog[key];
    return { key, ...base, typical: Number((base.typical + (base.max - base.min) * shift).toFixed(3)) };
  });
}

function fields(type: keyof typeof SENSOR_KEYS_BY_TYPE): DemoPredictionField[] {
  const keys = type === "ai4i" ? [...SENSOR_KEYS_BY_TYPE.ai4i.slice(0, 5), "productType"] : [...SENSOR_KEYS_BY_TYPE[type]];
  return keys.map((key) => key === "productType" ? {
    key, label: "Product grade", type: "select", required: true, options: ["L", "M", "H"].map((value) => ({ label: value, value })), range: null,
  } : (() => { const s = sensorCatalog[key]; return { key, label: s.label, type: "number", unit: s.unit, required: true, step: key.includes("ibration") ? 0.01 : 0.1, range: { observedMin: s.min, observedMax: s.max, recommendedMin: s.min + (s.typical - s.min) * 0.25, recommendedMax: s.warningHigh, typicalValue: s.typical }, options: null }; })());
}

const seeds = [
  ["machine-a-01", "Hydraulic Press 01", "Assembly 1", "AI4I Press", "ai4i", "healthy", 94, 12, 99.4],
  ["machine-a-02", "Hydraulic Press 02", "Assembly 1", "AI4I Press", "ai4i", "watch", 79, 38, 97.8],
  ["machine-a-03", "CNC Spindle 03", "Machining 2", "AI4I Spindle", "ai4i", "healthy", 91, 17, 99.1],
  ["machine-a-04", "CNC Spindle 04", "Machining 2", "AI4I Spindle", "ai4i", "risk", 58, 81, 91.6],
  ["machine-b-01", "Process Pump 01", "Utilities 1", "Five-sensor Pump", "sensor", "healthy", 88, 22, 98.5],
  ["machine-b-02", "Process Pump 02", "Utilities 1", "Five-sensor Pump", "sensor", "watch", 73, 49, 95.2],
  ["machine-b-03", "Cooling Fan 03", "Utilities 2", "Five-sensor Fan", "sensor", "offline", 35, 68, 87.4],
  ["machine-c-01", "Packaging Drive 01", "Packaging 1", "3-axis Drive", "real-sensor", "risk", 61, 84, 90.8],
  ["machine-c-02", "Packaging Drive 02", "Packaging 1", "3-axis Drive", "real-sensor", "watch", 76, 45, 96.1],
  ["machine-c-03", "Conveyor Motor 03", "Dispatch 1", "3-axis Motor", "real-sensor", "healthy", 92, 15, 99.0],
] as const;

export const DEMO_ASSETS = seeds.map(([id, name, line, model, machineType, status, healthScore, riskScore, uptimePercent], index) => ({
  id, name, line, model, machineType, status, healthScore, riskScore, uptimePercent,
  lastServiceDate: `2026-05-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`,
  nextServiceDate: `2026-07-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`,
  sensors: sensors(machineType, (index - 4) * 0.006), predictionFields: fields(machineType),
  failureModes: machineType === "ai4i" ? ["Tool wear", "Thermal overstrain"] : machineType === "sensor" ? ["Cavitation", "Bearing wear"] : ["Bearing imbalance", "Misalignment"],
  operatingHours: 8420 + index * 317, location: `${line} / Bay ${index + 1}`,
  notes: "Fictional deterministic portfolio-demo asset.", phase: index * 0.71,
})) satisfies readonly DemoAssetProfile[];

export function getDemoAsset(id: string): DemoAssetProfile {
  const asset = DEMO_ASSETS.find((candidate) => candidate.id === id);
  if (!asset) throw new Error(`Unknown demo machine: ${id}`);
  return asset;
}
