"use client";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { SimulationParameterDraftValue } from "@/lib/simulation/form";
import type { ResolvedSimulationParameterDefinition } from "@/lib/simulation/resolver";

const EMPTY_SELECT_VALUE = "__empty__";

type SimulationParameterFieldProps = {
  parameter: ResolvedSimulationParameterDefinition;
  value: SimulationParameterDraftValue | undefined;
  error?: string;
  onChange: (value: SimulationParameterDraftValue) => void;
};

export function SimulationParameterField({
  parameter,
  value,
  error,
  onChange,
}: SimulationParameterFieldProps) {
  const descriptionParts = [
    parameter.description,
    parameter.type === "number" && parameter.min !== undefined && parameter.max !== undefined
      ? `Range ${parameter.min}-${parameter.max}${parameter.unit ? ` ${parameter.unit}` : ""}.`
      : null,
  ].filter(Boolean);

  if (parameter.type === "boolean") {
    return (
      <Field
        orientation="responsive"
        data-invalid={error ? true : undefined}
        className="rounded-lg border border-border/70 bg-muted/20 p-3"
      >
        <FieldLabel htmlFor={parameter.key}>{parameter.label}</FieldLabel>
        <FieldContent>
          <Switch
            id={parameter.key}
            checked={typeof value === "boolean" ? value : false}
            aria-invalid={error ? true : undefined}
            onCheckedChange={onChange}
          />
          {descriptionParts.length > 0 && (
            <FieldDescription>{descriptionParts.join(" ")}</FieldDescription>
          )}
          <FieldError>{error}</FieldError>
        </FieldContent>
      </Field>
    );
  }

  if (parameter.type === "select") {
    const selectValue = typeof value === "string" && value !== "" ? value : EMPTY_SELECT_VALUE;

    return (
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={parameter.key}>{parameter.label}</FieldLabel>
        <Select
          value={selectValue}
          onValueChange={(nextValue) =>
            onChange(nextValue === EMPTY_SELECT_VALUE ? "" : nextValue)
          }
        >
          <SelectTrigger
            id={parameter.key}
            className="w-full text-sm"
            aria-invalid={error ? true : undefined}
          >
            <SelectValue placeholder={parameter.placeholder ?? `Select ${parameter.label}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {!parameter.required && (
                <SelectItem value={EMPTY_SELECT_VALUE}>Not set</SelectItem>
              )}
              {parameter.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {descriptionParts.length > 0 && (
          <FieldDescription>{descriptionParts.join(" ")}</FieldDescription>
        )}
        <FieldError>{error}</FieldError>
      </Field>
    );
  }

  const inputValue = typeof value === "string" ? value : "";

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={parameter.key}>{parameter.label}</FieldLabel>
      {parameter.type === "number" && parameter.unit ? (
        <InputGroup>
          <InputGroupInput
            id={parameter.key}
            type="number"
            min={parameter.min}
            max={parameter.max}
            step={parameter.step}
            value={inputValue}
            aria-invalid={error ? true : undefined}
            placeholder={parameter.placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{parameter.unit}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Input
          id={parameter.key}
          className="text-sm"
          type={parameter.type === "number" ? "number" : "text"}
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          value={inputValue}
          aria-invalid={error ? true : undefined}
          placeholder={parameter.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {descriptionParts.length > 0 && (
        <FieldDescription>{descriptionParts.join(" ")}</FieldDescription>
      )}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
