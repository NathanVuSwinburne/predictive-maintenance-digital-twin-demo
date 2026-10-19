import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Vibration3DView } from "@/components/monitor/vibration-3d-view";
import {
  DEFAULT_CAMERA,
  clampCamera,
  describeVector,
  hasVibrationVector,
  magnitude,
  AXIS_RANGE_STEPS,
  clampToScale,
  nearestRangeStep,
  nextAxisScale,
  niceCeil,
  niceStepDown,
  project,
  vibrationPoints,
} from "@/lib/domain/vibration-3d";
import type { EntityLiveObservation } from "@/lib/domain/types";

function observation(index: number, values: Record<string, number | string>): EntityLiveObservation {
  const iso = new Date(Date.UTC(2026, 9, 6, 10, 0, index)).toISOString();
  return { timestamp: iso, sessionId: "s", values, receivedAt: iso };
}

const readings = [
  observation(0, { VibrationX: 0.1, VibrationY: 0.2, VibrationZ: 0.3, Temperature: 26 }),
  observation(1, { VibrationX: 0.2, VibrationY: 0.2, VibrationZ: 0.4, Temperature: 26 }),
  observation(2, { VibrationX: 0.3, VibrationY: 0.4, VibrationZ: 0.5, Temperature: 26 }),
];

describe("vibration-3d geometry", () => {
  it("detects a full X/Y/Z vector and picks only complete readings", () => {
    expect(hasVibrationVector(["Temperature", "VibrationX", "VibrationY", "VibrationZ"])).toBe(true);
    expect(hasVibrationVector(["VibrationX", "Temperature"])).toBe(false);
    const points = vibrationPoints([
      ...readings,
      observation(3, { VibrationX: 1, VibrationY: 1, Temperature: 1 }),
      observation(4, { VibrationX: "n/a", VibrationY: 1, VibrationZ: 1 }),
    ]);
    expect(points).toHaveLength(3);
    expect(points.map((point) => point.recency)).toEqual([0, 0.5, 1]);
    expect(magnitude({ x: 3, y: 4, z: 12 })).toBe(13);
  });

  it("rounds limits to fine nice tiers so the box hugs the data", () => {
    expect(niceCeil(0.63 * 1.1)).toBe(0.8);
    expect(niceCeil(0.31)).toBe(0.4);
    expect(niceCeil(0.21)).toBe(0.25);
    expect(niceCeil(2.2)).toBe(2.5);
    expect(niceCeil(7)).toBe(8);
    expect(niceCeil(0.95)).toBe(1);
    expect(niceCeil(0)).toBe(1);
    expect(niceStepDown(1)).toBe(0.8);
    expect(niceStepDown(0.25)).toBe(0.2);
    expect(niceStepDown(2.5)).toBe(2);
  });

  it("fits the typical readings, pins rare spikes, grows at once and shrinks after 10 s", () => {
    const steady = (value: number, count = 60, start = 0) =>
      Array.from({ length: count }, (_, index) =>
        observation(start + index, { VibrationX: value, VibrationY: value, VibrationZ: value }),
      );
    // Typical level ~0.2 with one 2 mm/s spike: the box fits the typical readings.
    const withSpike = [...steady(0.2), observation(60, { VibrationX: 2, VibrationY: 0.2, VibrationZ: 0.2 })];
    const first = nextAxisScale(null, vibrationPoints(withSpike));
    expect(first).toEqual({ limit: 0.25, symmetric: false, belowHalfSince: null });
    expect(clampToScale({ x: 2, y: 0.2, z: 0.2 }, first)).toEqual({ x: 0.25, y: 0.2, z: 0.2, clipped: true });
    expect(clampToScale({ x: 0.1, y: 0.2, z: 0.2 }, first).clipped).toBe(false);

    // A sustained higher level grows the box immediately.
    const grown = nextAxisScale(first, vibrationPoints(steady(2)));
    expect(grown.limit).toBe(2.5);
    // Back to small readings: the clock starts on the data timestamp, one tier down after 10 s.
    const small = steady(0.1, 60, 100);
    const lastStamp = Date.parse(small.at(-1)!.timestamp);
    const waiting = nextAxisScale(grown, vibrationPoints(small));
    expect(waiting.belowHalfSince).toBe(lastStamp);
    expect(nextAxisScale(waiting, vibrationPoints(small), lastStamp + 5_000).limit).toBe(2.5);
    expect(nextAxisScale(waiting, vibrationPoints(small), lastStamp + 10_000).limit).toBe(2);
    // Typical data back above half the limit cancels the clock.
    expect(nextAxisScale(waiting, vibrationPoints(steady(2))).belowHalfSince).toBeNull();

    // A negative value switches to a symmetric box and stays symmetric afterwards.
    const symmetric = nextAxisScale(grown, vibrationPoints([...steady(2), observation(61, { VibrationX: -1, VibrationY: 0, VibrationZ: 0 })]));
    expect(symmetric.symmetric).toBe(true);
    expect(nextAxisScale(symmetric, vibrationPoints(steady(2))).symmetric).toBe(true);
  });

  it("projects the origin to the centre and the Z axis straight up with no tilt", () => {
    const scale = { limit: 1, symmetric: true };
    const flat = { yaw: 0, pitch: 0, zoom: 1 };
    expect(project({ x: 0, y: 0, z: 0 }, scale, flat)).toEqual({ sx: 0, sy: 0, depth: 0 });
    expect(project({ x: 0, y: 0, z: 1 }, scale, flat)).toMatchObject({ sx: 0, sy: 1 });
    expect(project({ x: 1, y: 0, z: 0 }, scale, flat)).toMatchObject({ sx: 1, sy: 0 });
    // Non-symmetric scale maps [0, limit] onto [-1, 1].
    expect(project({ x: 0, y: 0, z: 0 }, { limit: 2, symmetric: false }, flat)).toMatchObject({ sx: -1, sy: -1 });
    // Zoom scales the screen position only.
    expect(project({ x: 1, y: 0, z: 0 }, scale, { ...flat, zoom: 2 }).sx).toBe(2);
    expect(clampCamera({ yaw: 370, pitch: 120, zoom: 10 })).toEqual({ yaw: 10, pitch: 89, zoom: 4 });
  });

  it("describes the newest vector in words with units", () => {
    const points = vibrationPoints(readings);
    expect(describeVector(points.at(-1)!, "mm/s", points.length)).toBe(
      "Newest vibration vector: X 0.3 mm/s, Y 0.4 mm/s, Z 0.5 mm/s; magnitude 0.707 mm/s. 3 recent readings plotted, newest emphasised.",
    );
    expect(describeVector(null, "mm/s", 0)).toBe("No vibration readings yet.");
  });
});

describe("Vibration3DView", () => {
  beforeEach(() => {
    // jsdom has no canvas; the view must still render its text, controls, and summary.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it("shows the magnitude, components, predicted state, and an accessible summary", () => {
    render(<Vibration3DView observations={readings} unit="mm/s" predictedLabel="high" isLive />);
    expect(screen.getByTestId("vibration-magnitude")).toHaveTextContent("0.707mm/s");
    expect(screen.getByRole("img", { name: /Newest vibration vector: X 0.3 mm\/s/ })).toBeInTheDocument();
    expect(screen.getByText("high")).toHaveAttribute("data-variant");
    expect(screen.queryByText("Showing last-known values")).not.toBeInTheDocument();
    expect(screen.getByTestId("vibration-3d")).toHaveAttribute("data-yaw", String(DEFAULT_CAMERA.yaw + 360));
  });

  it("rotates and zooms from the keyboard-accessible controls and resets", async () => {
    render(<Vibration3DView observations={readings} unit="mm/s" isLive />);
    const view = screen.getByTestId("vibration-3d");
    await userEvent.click(screen.getByRole("button", { name: "Rotate right" }));
    expect(view).toHaveAttribute("data-yaw", String(DEFAULT_CAMERA.yaw + 15 + 360));
    await userEvent.click(screen.getByRole("button", { name: "Tilt up" }));
    expect(view).toHaveAttribute("data-pitch", String(DEFAULT_CAMERA.pitch + 15));
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(view).toHaveAttribute("data-zoom", "1.25");
    await userEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(view).toHaveAttribute("data-yaw", String(DEFAULT_CAMERA.yaw + 360));
    expect(view).toHaveAttribute("data-pitch", String(DEFAULT_CAMERA.pitch));
    expect(view).toHaveAttribute("data-zoom", "1.00");
  });

  it("rotates with a pointer drag", () => {
    render(<Vibration3DView observations={readings} unit="mm/s" isLive />);
    const canvas = screen.getByRole("img");
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    const view = screen.getByTestId("vibration-3d");
    expect(view).toHaveAttribute("data-yaw", String(DEFAULT_CAMERA.yaw + 30 + 360));
    expect(view).toHaveAttribute("data-pitch", String(DEFAULT_CAMERA.pitch - 10));
  });

  it("is honest when readings are not live and when there are none", () => {
    const { rerender } = render(<Vibration3DView observations={readings} unit="mm/s" isLive={false} />);
    expect(screen.getByText("Showing last-known values")).toBeInTheDocument();
    rerender(<Vibration3DView observations={[]} unit="mm/s" isLive />);
    expect(screen.getAllByText("No vibration readings yet.").length).toBeGreaterThan(0);
    expect(screen.getByTestId("vibration-magnitude")).toHaveTextContent("—");
  });
  it("lets the operator set the axis range and return to automatic", () => {
    render(<Vibration3DView observations={readings} unit="mm/s" isLive />);
    const slider = screen.getByRole("slider", { name: "Axis range" });
    expect(slider).toHaveAttribute("aria-valuetext", expect.stringMatching(/^Automatic, /));
    fireEvent.change(slider, { target: { value: String(AXIS_RANGE_STEPS.indexOf(2)) } });
    expect(slider).toHaveAttribute("aria-valuetext", "2 mm/s");
    expect(screen.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    expect(slider).toHaveAttribute("aria-valuetext", expect.stringMatching(/^Automatic, /));
    expect(nearestRangeStep(0.62)).toBe(AXIS_RANGE_STEPS.indexOf(0.6));
  });
});
