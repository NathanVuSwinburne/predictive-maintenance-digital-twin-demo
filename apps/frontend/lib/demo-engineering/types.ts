import type { MachineStatus, MachineTypeId, PredictionInputField } from "@/lib/domain/types";

export type DemoSensorDefinition = {
  key: string; label: string; unit: string; min: number; typical: number; max: number;
  warningLow?: number; warningHigh: number;
};

export type DemoPredictionField = PredictionInputField;

export type DemoAssetProfile = {
  id: string; name: string; line: string; model: string; machineType: MachineTypeId;
  status: MachineStatus; healthScore: number; riskScore: number; uptimePercent: number;
  lastServiceDate: string; nextServiceDate: string; sensors: DemoSensorDefinition[];
  predictionFields: DemoPredictionField[]; failureModes: string[]; operatingHours: number;
  location: string; notes: string; phase: number;
};
