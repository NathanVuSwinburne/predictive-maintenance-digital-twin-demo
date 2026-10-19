import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  LiveDataHealthContent,
  LivePredictionBar,
  shownLiveState,
} from "@/components/dashboard/live-data-health";
import type {
  CanonicalMachine,
  EntityLiveHealth,
  FleetLiveHealth,
} from "@/lib/domain/types";
import { toUserFacingError } from "@/lib/errors/user-facing-error";
import { liveInference, liveServerTime } from "./fixtures/live-status";

const lastCheckedAt = new Date("2026-10-06T10:00:10.500Z");
const vibrationFeatures = ["Temperature", "VibrationX", "VibrationY", "VibrationZ"];

function machine(id: string, name: string) {
  return { id, name } as CanonicalMachine;
}

function health(overrides: Partial<EntityLiveHealth> & Pick<EntityLiveHealth, "entityId">): EntityLiveHealth {
  return {
    entityName: overrides.entityId,
    state: "live",
    source: {
      id: `source-${overrides.entityId}`,
      name: "CMTK master 1",
      status: "connected",
      lastMessageAt: "2026-10-06T10:00:08.000Z",
      lastError: null,
      acceptedRows: 1240,
      rejectedRows: 0,
    },
    features: vibrationFeatures,
    inference: {
      enabled: true,
      status: "ok",
      message: null,
      lastAttemptAt: "2026-10-06T10:00:09.000Z",
      latest: liveInference,
      recent: [],
    },
    ...overrides,
  };
}

function fleet(machines: EntityLiveHealth[]): FleetLiveHealth {
  return { serverTime: liveServerTime, freshnessSeconds: 15, subscriberEnabled: true, machines };
}

const noSource = health({
  entityId: "machine-b",
  state: "no-source",
  source: null,
  features: ["temperature"],
  inference: { enabled: true, status: "unavailable", message: null, lastAttemptAt: null, latest: null, recent: [] },
});

describe("LivePredictionBar", () => {
  it("shows the predicted vibration level as a stacked probability bar, not as a failure risk", () => {
    render(<LivePredictionBar health={health({ entityId: "machine-x" })} serverTime={liveServerTime} />);

    const bar = screen.getByTestId("live-prediction-bar");
    expect(within(bar).getByText("Vibration level")).toBeInTheDocument();
    expect(within(bar).getByText(liveInference.predictedLabel!)).toBeInTheDocument();
    const stacked = within(bar).getByRole("img");
    expect(stacked).toHaveAccessibleName(/^Vibration level probabilities: low \d+%, medium \d+%, high \d+%$/);
    expect(bar).not.toHaveTextContent(/risk/i);
  });

  it("uses neutral wording for machines whose labels are not vibration levels", () => {
    render(
      <LivePredictionBar
        health={health({ entityId: "machine-y", features: ["pressure"], inference: {
          enabled: true, status: "ok", message: null, lastAttemptAt: null, recent: [],
          latest: { ...liveInference, predictedLabel: "bearing-wear", probabilities: { "bearing-wear": 0.8, normal: 0.2 } },
        } })}
        serverTime={liveServerTime}
      />,
    );
    expect(screen.getByText("Predicted status")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("says Not assessed with the reason when there is no live prediction", () => {
    render(<LivePredictionBar health={noSource} serverTime={liveServerTime} />);
    expect(screen.getByText("Not assessed")).toBeInTheDocument();
    expect(screen.getByText("This machine has no live data connection.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("marks a prediction that came before the feed stopped", () => {
    render(<LivePredictionBar health={health({ entityId: "machine-x", state: "stale" })} serverTime={liveServerTime} />);
    expect(screen.getByText(/Last prediction before the feed stopped/)).toBeInTheDocument();
  });
});

describe("LiveDataHealthContent", () => {
  it("lists feed problems first with state, last reading, row counts and source issue", () => {
    render(
      <LiveDataHealthContent
        machines={[machine("machine-a", "Live machine"), machine("machine-b", "No feed"), machine("machine-c", "Stale machine")]}
        fleet={fleet([
          health({ entityId: "machine-a" }),
          noSource,
          health({
            entityId: "machine-c",
            state: "stale",
            source: {
              id: "source-c", name: "CMTK", status: "connected",
              lastMessageAt: "2026-10-06T09:58:10.000Z", lastError: "Payload missing Slot1",
              acceptedRows: 10, rejectedRows: 3,
            },
          }),
        ])}
        isLoading={false}
        error={null}
        lastCheckedAt={lastCheckedAt}
      />,
    );

    const rows = within(screen.getByRole("list", { name: "Live Data Health" })).getAllByRole("listitem");
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      "live-health-machine-c",
      "live-health-machine-a",
      "live-health-machine-b",
    ]);
    expect(within(rows[0]).getByText("Stale")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("Last reading 2 min ago");
    expect(rows[0]).toHaveTextContent("10 rows accepted · 3 rejected");
    expect(rows[0]).toHaveTextContent("Last source issue: Payload missing Slot1");
    expect(within(rows[1]).getByText("Live")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("Last reading 2 s ago");
    expect(within(rows[1]).getByRole("link", { name: "Live machine" })).toHaveAttribute("href", "/monitor/machine-a");
    expect(within(rows[2]).getByRole("link", { name: "No feed" })).toHaveAttribute("href", "/machines/machine-b");
    expect(within(rows[2]).getByText("Not assessed")).toBeInTheDocument();

    const summary = screen.getByLabelText("Live feed summary");
    expect(summary).toHaveTextContent("1 Stale");
    expect(summary).toHaveTextContent("1 Live");
    expect(summary).toHaveTextContent("1 No live source");
    expect(screen.getByText(/It is not a failure risk\./)).toBeInTheDocument();
  });

  it("never shows Live when the last refresh failed", () => {
    render(
      <LiveDataHealthContent
        machines={[machine("machine-a", "Live machine")]}
        fleet={fleet([health({ entityId: "machine-a" })])}
        isLoading={false}
        error={toUserFacingError(new Error("offline"), "data.refresh", { message: "We’ll try again automatically." })}
        lastCheckedAt={lastCheckedAt}
      />,
    );
    expect(screen.queryByText("Live", { exact: true })).not.toBeInTheDocument();
    expect(screen.getAllByText("Reconnecting").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("The live status could not be refreshed.");
    expect(shownLiveState("stale", true)).toBe("stale");
  });

  it("shows a checking message before the first response", () => {
    render(
      <LiveDataHealthContent
        machines={[machine("machine-a", "Live machine")]}
        fleet={null}
        isLoading
        error={null}
        lastCheckedAt={null}
      />,
    );
    expect(screen.getByText("Checking live data…")).toBeInTheDocument();
  });
});
