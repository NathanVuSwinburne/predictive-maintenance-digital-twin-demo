"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { badgeVariantForMachineLabel } from "@/lib/domain/presentation";
import {
  DEFAULT_CAMERA,
  clampCamera,
  describeVector,
  formatComponent,
  magnitude,
  AXIS_RANGE_STEPS,
  clampToScale,
  nearestRangeStep,
  nextAxisScale,
  project,
  vibrationPoints,
  type AxisScale,
  type Camera,
  type VibrationPoint,
} from "@/lib/domain/vibration-3d";
import type { EntityLiveObservation } from "@/lib/domain/types";

type Props = {
  observations: EntityLiveObservation[];
  unit: string;
  /** Latest predicted state, when the model has one. */
  predictedLabel?: string | null;
  /** What the predicted label means, e.g. "Predicted vibration level" for Machine C / CMTK. */
  predictedLabelHeading?: string;
  /** False when readings are stale or our own poll is failing; the view says so. */
  isLive: boolean;
};

const ROTATE_STEP = 15;
const ZOOM_STEP = 1.25;
const AUTO_ROTATE_DEG_PER_SECOND = 6;

function axisColour(axis: "x" | "y" | "z") {
  return axis === "x" ? "var(--chart-1)" : axis === "y" ? "var(--chart-2)" : "var(--chart-4)";
}

function cssVar(element: HTMLElement, name: string, fallback: string) {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value || fallback;
}

type DrawArgs = {
  canvas: HTMLCanvasElement;
  points: VibrationPoint[];
  scale: AxisScale;
  camera: Camera;
  unit: string;
  isLive: boolean;
};

/** Draws axes, a faint bounding box, the fading trajectory, and the emphasised newest point. */
export function drawVibrationScene({ canvas, points, scale, camera, unit, isLive }: DrawArgs) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 320;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const foreground = cssVar(canvas, "--foreground", "#111");
  const muted = cssVar(canvas, "--muted-foreground", "#777");
  const border = cssVar(canvas, "--border", "#ccc");
  const primary = cssVar(canvas, "--primary", "#2563eb");
  const colours = {
    x: cssVar(canvas, "--chart-1", "#2563eb"),
    y: cssVar(canvas, "--chart-2", "#0d9488"),
    z: cssVar(canvas, "--chart-4", "#d97706"),
  };
  const half = Math.min(width, height) * 0.36;
  const centre = { x: width / 2, y: height / 2 };
  const toScreen = (point: { x: number; y: number; z: number }) => {
    const p = project(point, scale, camera);
    return { x: centre.x + p.sx * half, y: centre.y - p.sy * half, depth: p.depth };
  };

  const lo = scale.symmetric ? -scale.limit : 0;
  const hi = scale.limit;
  const corners = [
    [lo, lo, lo], [hi, lo, lo], [hi, hi, lo], [lo, hi, lo],
    [lo, lo, hi], [hi, lo, hi], [hi, hi, hi], [lo, hi, hi],
  ].map(([x, y, z]) => toScreen({ x, y, z }));
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  context.lineWidth = 1;
  context.strokeStyle = border;
  context.globalAlpha = 0.9;
  for (const [a, b] of edges) {
    context.beginPath();
    context.moveTo(corners[a].x, corners[a].y);
    context.lineTo(corners[b].x, corners[b].y);
    context.stroke();
  }

  // Axes from the origin corner, each in its own colour, labelled with the unit.
  const origin = toScreen({ x: lo, y: lo, z: lo });
  const axisEnds: Array<["x" | "y" | "z", { x: number; y: number }]> = [
    ["x", toScreen({ x: hi, y: lo, z: lo })],
    ["y", toScreen({ x: lo, y: hi, z: lo })],
    ["z", toScreen({ x: lo, y: lo, z: hi })],
  ];
  context.globalAlpha = 1;
  context.font = "12px ui-sans-serif, system-ui, sans-serif";
  for (const [axis, end] of axisEnds) {
    context.strokeStyle = colours[axis];
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    context.fillStyle = foreground;
    const label = `${axis.toUpperCase()} ${formatComponent(hi)}${unit ? ` ${unit}` : ""}`;
    const dx = end.x - origin.x;
    const dy = end.y - origin.y;
    const length = Math.hypot(dx, dy) || 1;
    context.fillText(label, end.x + (dx / length) * 6 + 2, end.y + (dy / length) * 6 + 4);
  }
  context.fillStyle = muted;
  context.fillText(scale.symmetric ? `−${formatComponent(hi)}` : "0", origin.x - 10, origin.y + 14);

  if (points.length === 0) return;

  // Trajectory, oldest to newest, fading in; thinner when older.
  const screen = points.map((point) => {
    const pinned = clampToScale(point, scale);
    return { ...toScreen(pinned), recency: point.recency, clipped: pinned.clipped };
  });
  for (let index = 1; index < screen.length; index += 1) {
    const from = screen[index - 1];
    const to = screen[index];
    context.globalAlpha = 0.15 + to.recency * 0.6;
    context.lineWidth = 0.75 + to.recency * 1.25;
    context.strokeStyle = isLive ? primary : muted;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  // Points: size and opacity grow with recency (time is never colour-only).
  for (const point of screen) {
    const radius = 1 + point.recency * 2.5;
    context.globalAlpha = 0.2 + point.recency * 0.7;
    if (point.clipped) {
      // Off-scale spike pinned to the box edge: hollow square, not a dot.
      const size = radius + 2;
      context.strokeStyle = isLive ? colours.z : muted;
      context.lineWidth = 1.5;
      context.strokeRect(point.x - size, point.y - size, size * 2, size * 2);
      continue;
    }
    context.fillStyle = isLive ? primary : muted;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  }
  // Newest point: large filled dot with a ring and a drop line to the floor.
  const newest = screen[screen.length - 1];
  const newestPinned = clampToScale(points[points.length - 1], scale);
  const floor = toScreen({ x: newestPinned.x, y: newestPinned.y, z: lo });
  context.globalAlpha = 0.5;
  context.setLineDash([3, 3]);
  context.strokeStyle = muted;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(newest.x, newest.y);
  context.lineTo(floor.x, floor.y);
  context.stroke();
  context.setLineDash([]);
  context.globalAlpha = 1;
  context.fillStyle = isLive ? primary : muted;
  context.beginPath();
  context.arc(newest.x, newest.y, 6, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = foreground;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(newest.x, newest.y, 9, 0, Math.PI * 2);
  context.stroke();
}

/**
 * Canvas 3D view of the recent vibration vector. Drag to rotate, scroll/pinch to
 * zoom, arrow buttons for keyboard users, and a text summary for screen readers.
 */
export function Vibration3DView({
  observations,
  unit,
  predictedLabel,
  predictedLabelHeading = "Predicted state",
  isLive,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [interacted, setInteracted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pinchRef = useRef<number | null>(null);

  const points = useMemo(() => vibrationPoints(observations), [observations]);
  const newest = points.at(-1) ?? null;
  // The scale only grows, so the box never shrinks between polls. Derived from the
  // previous render's scale (React's "adjust state during render" pattern).
  const [scale, setScale] = useState<AxisScale | null>(null);
  const autoScale = nextAxisScale(scale, points);
  if (
    !scale ||
    autoScale.limit !== scale.limit ||
    autoScale.symmetric !== scale.symmetric ||
    (autoScale.belowHalfSince ?? null) !== (scale.belowHalfSince ?? null)
  ) {
    setScale(autoScale);
  }
  // Operator-chosen box size from the "Axis range" slider; null = Auto.
  const [manualStep, setManualStep] = useState<number | null>(null);
  const effectiveScale: AxisScale = useMemo(
    () => ({
      limit: manualStep === null ? autoScale.limit : AXIS_RANGE_STEPS[manualStep],
      symmetric: autoScale.symmetric,
    }),
    [autoScale.limit, autoScale.symmetric, manualStep],
  );
  const rangeStep = manualStep ?? nearestRangeStep(autoScale.limit);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener?.("change", apply);
    return () => query.removeEventListener?.("change", apply);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawVibrationScene({ canvas, points, scale: effectiveScale, camera, unit, isLive });
  }, [camera, effectiveScale, isLive, points, unit]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  // Gentle auto-rotation until the operator takes control; never with reduced motion.
  useEffect(() => {
    if (reducedMotion || interacted || points.length === 0) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;
      setCamera((current) => clampCamera({ ...current, yaw: current.yaw + AUTO_ROTATE_DEG_PER_SECOND * elapsed }));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [interacted, points.length, reducedMotion]);

  function nudge(delta: Partial<Camera>) {
    setInteracted(true);
    setCamera((current) =>
      clampCamera({
        yaw: current.yaw + (delta.yaw ?? 0),
        pitch: current.pitch + (delta.pitch ?? 0),
        zoom: current.zoom * (delta.zoom ?? 1),
      }),
    );
  }

  function resetView() {
    setInteracted(false);
    setCamera(DEFAULT_CAMERA);
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, yaw: camera.yaw, pitch: camera.pitch };
    setInteracted(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    setCamera((current) => clampCamera({ ...current, yaw: drag.yaw + dx * 0.5, pitch: drag.pitch + dy * 0.5 }));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function onWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    nudge({ zoom: event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP });
  }

  function onTouchMove(event: React.TouchEvent<HTMLCanvasElement>) {
    if (event.touches.length !== 2) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (pinchRef.current !== null) {
      const ratio = distance / pinchRef.current;
      if (Math.abs(ratio - 1) > 0.02) {
        nudge({ zoom: ratio });
        pinchRef.current = distance;
      }
    } else {
      pinchRef.current = distance;
    }
  }

  function onTouchEnd() {
    pinchRef.current = null;
  }

  const description = describeVector(newest, unit, points.length);
  const currentMagnitude = newest ? magnitude(newest) : null;

  return (
    <div
      className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]"
      data-testid="vibration-3d"
      data-yaw={Math.round(((camera.yaw % 360) + 360) % 360)}
      data-pitch={Math.round(camera.pitch)}
      data-zoom={camera.zoom.toFixed(2)}
    >
      <div className="relative border border-border bg-card">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={description}
          className="block h-72 w-full cursor-grab touch-none select-none active:cursor-grabbing sm:h-80"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
        {!isLive ? (
          <Badge variant="warning" className="absolute top-2 left-2">
            Showing last-known values
          </Badge>
        ) : null}
        {points.length === 0 ? (
          <p className="absolute inset-x-0 bottom-3 text-center text-sm text-muted-foreground">
            No vibration readings yet.
          </p>
        ) : null}
        <p className="absolute right-2 bottom-2 text-xs text-muted-foreground">
          Drag to rotate · scroll or pinch to zoom
        </p>
      </div>

      <div className="flex flex-col gap-3 text-sm">
        <div className="border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Vibration magnitude |v|</p>
          <p className="text-2xl font-semibold tabular-nums" data-testid="vibration-magnitude">
            {currentMagnitude !== null ? formatComponent(currentMagnitude) : "—"}
            {unit && currentMagnitude !== null ? <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span> : null}
          </p>
          {newest ? (
            <dl className="mt-2 grid grid-cols-3 gap-1 text-xs tabular-nums">
              {(["x", "y", "z"] as const).map((axis) => (
                <div key={axis}>
                  <dt className="flex items-center gap-1 text-muted-foreground">
                    <span aria-hidden="true" className="inline-block size-2" style={{ backgroundColor: axisColour(axis) }} />
                    {axis.toUpperCase()}
                  </dt>
                  <dd className="font-medium">{formatComponent(newest[axis])}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {predictedLabel ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {predictedLabelHeading}
              <Badge variant={badgeVariantForMachineLabel(predictedLabel)} className="uppercase">
                {predictedLabel}
              </Badge>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2" role="group" aria-label="Rotate and zoom the 3D view">
          <div className="grid grid-cols-3 gap-1">
            <span />
            <Button type="button" variant="outline" size="icon-sm" aria-label="Tilt up" onClick={() => nudge({ pitch: ROTATE_STEP })}>
              <CaretUpIcon aria-hidden="true" />
            </Button>
            <span />
            <Button type="button" variant="outline" size="icon-sm" aria-label="Rotate left" onClick={() => nudge({ yaw: -ROTATE_STEP })}>
              <CaretLeftIcon aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Tilt down" onClick={() => nudge({ pitch: -ROTATE_STEP })}>
              <CaretDownIcon aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Rotate right" onClick={() => nudge({ yaw: ROTATE_STEP })}>
              <CaretRightIcon aria-hidden="true" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Zoom in" onClick={() => nudge({ zoom: ZOOM_STEP })}>
              <MagnifyingGlassPlusIcon aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Zoom out" onClick={() => nudge({ zoom: 1 / ZOOM_STEP })}>
              <MagnifyingGlassMinusIcon aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={resetView}>
              <ArrowClockwiseIcon data-icon="inline-start" aria-hidden="true" />
              Reset view
            </Button>
          </div>
          <div className="flex flex-col gap-1.5 border border-border p-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <label htmlFor="vibration-axis-range" className="font-medium">
                Axis range
              </label>
              <span className="tabular-nums text-muted-foreground" aria-hidden="true">
                {manualStep === null ? "Auto · " : ""}
                {formatComponent(effectiveScale.limit)}
                {unit ? ` ${unit}` : ""}
              </span>
            </div>
            <input
              id="vibration-axis-range"
              type="range"
              min={0}
              max={AXIS_RANGE_STEPS.length - 1}
              step={1}
              value={rangeStep}
              onChange={(event) => setManualStep(Number(event.target.value))}
              aria-valuetext={`${manualStep === null ? "Automatic, " : ""}${formatComponent(effectiveScale.limit)}${unit ? ` ${unit}` : ""}`}
              className="w-full accent-[var(--primary)]"
            />
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Readings beyond the range are pinned to the box edge.</span>
              <Button
                type="button"
                variant={manualStep === null ? "secondary" : "outline"}
                size="sm"
                aria-pressed={manualStep === null}
                onClick={() => setManualStep(null)}
              >
                Auto
              </Button>
            </div>
          </div>
        </div>

        <ul className="flex flex-col gap-1 text-xs text-muted-foreground" aria-label="Legend">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block size-3 rounded-full border-2 border-foreground bg-primary" />
            Newest reading (ring)
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block size-2 rounded-full bg-primary/40" />
            Older readings: smaller and fainter
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-0.5 w-4 bg-primary/60" />
            Path through the last {points.length} readings
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block size-2.5 border-[1.5px] border-chart-4" />
            Rare spikes beyond the box, pinned to its edge
          </li>
        </ul>
        <p className="sr-only" aria-live="polite">
          {description}
        </p>
      </div>
    </div>
  );
}
