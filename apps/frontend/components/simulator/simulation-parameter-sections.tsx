"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type {
  SimulationParameterDraftValue,
  SimulationParameterDraftValues,
} from "@/lib/simulation/form";
import {
  splitSimulationParameters,
  type ResolvedMachineSimulationSchema,
} from "@/lib/simulation/resolver";
import { SimulationParameterField } from "@/components/simulator/simulation-parameter-field";

type SimulationParameterSectionsProps = {
  schema: ResolvedMachineSimulationSchema;
  values: SimulationParameterDraftValues;
  errors: Record<string, string>;
  onChange: (key: string, value: SimulationParameterDraftValue) => void;
};

function renderSectionGroup(args: {
  title: string;
  description: string;
  sections: Array<{
    category: string;
    parameters: ReturnType<typeof splitSimulationParameters>[number]["basic"];
  }>;
  values: SimulationParameterDraftValues;
  errors: Record<string, string>;
  onChange: (key: string, value: SimulationParameterDraftValue) => void;
}) {
  if (args.sections.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{args.title}</CardTitle>
        <CardDescription className="text-sm">{args.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {args.sections.map((section, index) => (
          <div key={section.category} className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-medium">{section.category}</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {section.parameters.map((parameter) => (
                <SimulationParameterField
                  key={parameter.key}
                  parameter={parameter}
                  value={args.values[parameter.key]}
                  error={args.errors[parameter.key]}
                  onChange={(value) => args.onChange(parameter.key, value)}
                />
              ))}
            </div>
            {index < args.sections.length - 1 && <Separator />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SimulationParameterSections({
  schema,
  values,
  errors,
  onChange,
}: SimulationParameterSectionsProps) {
  const groupedSections = splitSimulationParameters(schema.parameters);
  const basicSections = groupedSections
    .filter((section) => section.basic.length > 0)
    .map((section) => ({
      category: section.category,
      parameters: section.basic,
    }));
  const advancedSections = groupedSections
    .filter((section) => section.advanced.length > 0)
    .map((section) => ({
      category: section.category,
      parameters: section.advanced,
    }));

  return (
    <div className="flex flex-col gap-4">
      {renderSectionGroup({
        title: "Scenario Adjustments",
        description:
          schema.description ??
          "Adjust these values only if you want to explore a specific operating condition.",
        sections: basicSections,
        values,
        errors,
        onChange,
      })}
      {renderSectionGroup({
        title: "Advanced Scenario Adjustments",
        description:
          "Optional wear and fault-condition inputs for more detailed scenario tuning.",
        sections: advancedSections,
        values,
        errors,
        onChange,
      })}
    </div>
  );
}
