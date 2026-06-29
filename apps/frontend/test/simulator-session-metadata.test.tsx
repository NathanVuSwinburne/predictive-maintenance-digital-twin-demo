import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SimulationSessionMetadata } from "@/components/simulator/simulation-session-metadata";

describe("SimulationSessionMetadata", () => {
  it("shows collection timing and provenance", () => {
    render(<SimulationSessionMetadata session={{ sessionId: 78, start: "2026-06-05T00:15:00.000Z", end: "2026-06-05T03:57:00.000Z", totalRows: 26640, realRows: 26640, syntheticRows: 0, durationMinutes: 222, usesSyntheticContinuation: false, sampleIntervalMs: 500, gapFromPreviousMinutes: 17280, provenance: "curated-observed-fixture", label: "Session 78" }} />);
    expect(screen.getByText("Session 78")).toBeInTheDocument();
    expect(screen.getByText(/2026-06-05T00:15.*2026-06-05T03:57/)).toBeInTheDocument();
    expect(screen.getByText("3 h 42 min")).toBeInTheDocument();
    expect(screen.getByText("500 ms source cadence")).toBeInTheDocument();
    expect(screen.getByText("12 day gap")).toBeInTheDocument();
    expect(screen.getByText("Observed client-derived fixture")).toBeInTheDocument();
  });
});
