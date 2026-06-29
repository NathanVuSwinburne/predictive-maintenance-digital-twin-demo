import type { SimulationGeneratedReading, TelemetryPoint } from "@/lib/domain/types";
import { getDemoAsset } from "./assets";

const END = "2026-06-28T08:00:00.000Z";
const round = (value: number, places = 3) => Number(value.toFixed(places));

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function createSeededRandom(seedText: string) {
  let seed = hashString(seedText);
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDriveReadings(machineId: string, count: number, start: string, intervalMs = 30_000): SimulationGeneratedReading[] {
  const asset = getDemoAsset(machineId);
  const random = createSeededRandom(`${machineId}:${start}:${count}:${intervalMs}`);
  let temperature = 48 + asset.riskScore * 0.16;
  const transientAt = count > 240 ? Math.floor(random() * (count - 20)) + 10 : -1;
  return Array.from({ length: count }, (_, i) => {
    const load = 0.58 + 0.16 * Math.sin(i / 97 + asset.phase) + 0.08 * Math.sin(i / 251 + 1.3);
    const rotational = Math.sin(i * 0.47 + asset.phase) + 0.42 * Math.sin(i * 0.731 + 0.4);
    const impulse = random() > 0.986 ? (random() - 0.5) * 0.65 : 0;
    const broadband = (random() - 0.5) * 0.22;
    const amplitude = 0.18 + asset.riskScore / 260 + load * 0.11;
    const x = amplitude * (0.7 + rotational * 0.27) + broadband + impulse;
    const y = amplitude * (0.63 + Math.sin(i * 0.47 + asset.phase + 1.15) * 0.23) + broadband * 0.6;
    const z = amplitude * (0.78 + Math.sin(i * 0.731 + 2.1) * 0.28) + broadband * 0.42 + impulse * 0.7;
    const equilibrium = 43 + load * 31 + asset.riskScore * 0.1;
    temperature += (equilibrium - temperature) * 0.006 + (random() - 0.5) * 0.012;
    const transient = i >= transientAt && i < transientAt + 4 ? (4 - (i - transientAt)) * 0.35 : 0;
    return {
      timestamp: new Date(Date.parse(start) + i * intervalMs).toISOString(),
      values: { vibrationX: round(Math.max(0.005, x)), vibrationY: round(Math.max(0.005, y)), vibrationZ: round(Math.max(0.005, z)), temperature: round(temperature + transient, 2) },
      synthetic: false,
    };
  });
}

export function generateTelemetry(machineId: string, count = 288): TelemetryPoint[] {
  const asset = getDemoAsset(machineId);
  const intervalMs = 5 * 60_000;
  const start = new Date(Date.parse(END) - (count - 1) * intervalMs).toISOString();
  const drive = generateDriveReadings(machineId, count, start, intervalMs);
  return drive.map((point, i) => {
    const magnitude = Math.sqrt(point.values.vibrationX ** 2 + point.values.vibrationY ** 2 + point.values.vibrationZ ** 2);
    const load = 0.62 + 0.13 * Math.sin(i / 31 + asset.phase);
    return { timestamp: point.timestamp, temperature: point.values.temperature, vibration: round(magnitude), pressure: round(4.3 + load * 1.5 + Math.sin(i / 17) * 0.18, 2), power: round(28 + load * 54 + asset.riskScore * 0.12, 2) };
  });
}
