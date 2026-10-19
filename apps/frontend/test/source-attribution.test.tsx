import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  mergeInformationProvenance,
  SourceAttribution,
} from "@/components/provenance/source-attribution";
import type { InformationProvenance } from "@/lib/domain/types";

const allSources: InformationProvenance = {
  outputSources: [
    "live-machine-data",
    "historical-machine-data",
    "ml-prediction",
    "simulated-data",
    "knowledge-base",
    "ai-interpretation",
  ],
  basisSources: ["live-machine-data", "knowledge-base"],
  evidence: [
    {
      source: "ml-prediction",
      label: "Bearing model version 7",
      reference: "bearing-model:7",
      timestamp: "2026-08-25T10:30:00Z",
      detail: "Production model inference",
    },
  ],
};

describe("SourceAttribution", () => {
  it("renders the six restrained, text-labelled source badges", () => {
    render(<SourceAttribution provenance={allSources} />);

    for (const label of [
      "Live Machine Data",
      "Historical Machine Data",
      "ML Prediction",
      "Simulated Data",
      "Knowledge Base",
      "AI Interpretation",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Live Machine Data")).toHaveClass("bg-emerald-500/10");
    expect(screen.getByText("Live Machine Data")).toHaveClass("dark:text-emerald-300");
    expect(screen.getByText("Historical Machine Data")).toHaveClass("bg-slate-500/10");
    expect(screen.getByText("Historical Machine Data")).toHaveClass("dark:text-slate-300");
    expect(screen.getByText("Historical Machine Data")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("These readings are not live"),
    );
    expect(screen.getByText("ML Prediction")).toHaveClass("bg-blue-500/10");
    expect(screen.getByText("ML Prediction")).toHaveClass("dark:text-blue-300");
    expect(screen.getByText("Simulated Data")).toHaveClass("bg-violet-500/10");
    expect(screen.getByText("Simulated Data")).toHaveClass("dark:text-violet-300");
    expect(screen.getByText("Knowledge Base")).toHaveClass("bg-amber-500/10");
    expect(screen.getByText("Knowledge Base")).toHaveClass("dark:text-amber-300");
    expect(screen.getByText("AI Interpretation")).toHaveClass("bg-cyan-500/10");
    expect(screen.getByText("AI Interpretation")).toHaveClass("dark:text-cyan-300");
  });

  it("exposes basis and evidence through a keyboard-focusable description", () => {
    render(<SourceAttribution provenance={allSources} />);

    const prediction = screen.getByText("ML Prediction");
    expect(prediction).toHaveAttribute("tabindex", "0");
    expect(prediction).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Based on Live Machine Data and Knowledge Base"),
    );
    expect(prediction).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Bearing model version 7"),
    );
  });

  it("renders nothing for absent or unsupported provenance", () => {
    const { container, rerender } = render(<SourceAttribution />);
    expect(container).toBeEmptyDOMElement();

    rerender(
      <SourceAttribution
        provenance={{ outputSources: [], basisSources: [], evidence: [] }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("merges only the provenance represented by a combined output", () => {
    expect(
      mergeInformationProvenance([
        {
          outputSources: ["simulated-data"],
          basisSources: ["historical-machine-data"],
          evidence: [{ source: "simulated-data", label: "Run 1" }],
        },
        {
          outputSources: ["ml-prediction"],
          basisSources: ["live-machine-data"],
          evidence: [
            { source: "ml-prediction", label: "Run 2" },
            { source: "simulated-data", label: "Run 1" },
          ],
        },
      ]),
    ).toEqual({
      outputSources: ["simulated-data", "ml-prediction"],
      basisSources: ["historical-machine-data", "live-machine-data"],
      evidence: [
        { source: "simulated-data", label: "Run 1" },
        { source: "ml-prediction", label: "Run 2" },
      ],
    });
  });
});
