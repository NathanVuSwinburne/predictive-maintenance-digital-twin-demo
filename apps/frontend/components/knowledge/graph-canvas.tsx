"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type { GraphNode, KnowledgeGraph } from "@/lib/demo-knowledge/types";
import { cn } from "@/lib/utils";

type PositionedNode = SimulationNodeDatum & {
  id: string;
  node: GraphNode;
};

type PositionedLink = SimulationLinkDatum<PositionedNode> & {
  type: string;
};

/**
 * Namespace colours come from the app's own chart tokens rather than literal hex, so the graph
 * follows the theme instead of fighting it.
 */
const NAMESPACE_COLOR: Record<string, string> = {
  domain: "var(--chart-1)",
  concepts: "var(--chart-2)",
  fleet: "var(--chart-3)",
  sources: "var(--chart-4)",
  agent: "var(--chart-5)",
  raw: "var(--status-offline)",
  root: "var(--muted-foreground)",
  tag: "var(--muted-foreground)",
  wanted: "var(--muted-foreground)",
};

export function namespaceColor(namespace: string | null | undefined) {
  const head = String(namespace ?? "").split("/")[0];
  return NAMESPACE_COLOR[head] ?? "var(--primary)";
}

/** Radius grows with inbound links, so the pages everything points at read as hubs. */
function radiusFor(node: GraphNode) {
  return 4.5 + Math.log(node.inDegree + 2) * 3.4;
}

type Props = {
  graph: KnowledgeGraph;
  selectedId: string | null;
  highlightIds?: Set<string>;
  onSelect: (node: GraphNode) => void;
  onFocus?: (node: GraphNode) => void;
  className?: string;
};

export function GraphCanvas({
  graph,
  selectedId,
  highlightIds,
  onSelect,
  onFocus,
  className,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simulationRef = useRef<Simulation<PositionedNode, PositionedLink> | null>(null);
  const [tick, setTick] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ width: 820, height: 560 });
  const dragRef = useRef<{ id: string | null; startX: number; startY: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

  // Rebuilt only when the graph's shape changes. Rebuilding it every render would restart the
  // simulation and the layout would jitter permanently.
  const layout = useMemo(() => {
    const nodes: PositionedNode[] = graph.nodes.map((node) => ({ id: node.id, node }));
    const byId = new Map(nodes.map((entry) => [entry.id, entry]));
    const links: PositionedLink[] = graph.edges
      .filter((edge) => byId.has(edge.source) && byId.has(edge.target))
      .map((edge) => ({
        source: byId.get(edge.source)!,
        target: byId.get(edge.target)!,
        type: edge.type,
      }));
    return { nodes, links };
  }, [graph]);

  useEffect(() => {
    const element = svgRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const simulation = forceSimulation<PositionedNode>(layout.nodes)
      .force(
        "link",
        forceLink<PositionedNode, PositionedLink>(layout.links)
          .id((entry) => entry.id)
          .distance(112)
          .strength(0.18),
      )
      // A densely cross-linked vault collapses into one ball at the charge d3 suggests, so the
      // repulsion is set well above it and the link strength well below.
      .force("charge", forceManyBody().strength(-720))
      .force("collide", forceCollide<PositionedNode>((entry) => radiusFor(entry.node) + 14))
      .force("center", forceCenter(size.width / 2, size.height / 2))
      .on("tick", () => setTick((value) => value + 1));

    simulationRef.current = simulation;

    // The simulation cools and stops on its own, and is restarted only on a data change or a
    // drag. A force layout left running is a background CPU burn on a page people keep open.
    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [layout, size.width, size.height]);

  const incident = useMemo(() => {
    const active = hoveredId ?? selectedId;
    if (!active) {
      return null;
    }
    const neighbours = new Set<string>([active]);
    for (const edge of graph.edges) {
      if (edge.source === active) neighbours.add(edge.target);
      if (edge.target === active) neighbours.add(edge.source);
    }
    return { active, neighbours };
  }, [graph.edges, hoveredId, selectedId]);

  const handlePointerDownNode = useCallback((event: React.PointerEvent, entry: PositionedNode) => {
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    dragRef.current = { id: entry.id, startX: event.clientX, startY: event.clientY };
    entry.fx = entry.x;
    entry.fy = entry.y;
    simulationRef.current?.alphaTarget(0.25).restart();
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (drag?.id) {
        // Read the nodes back out of the simulation rather than the memoized layout: d3-force
        // owns these objects and mutates them every tick, so the simulation is the honest source
        // for a pinned position.
        const entry = simulationRef.current?.nodes().find((node) => node.id === drag.id);
        const rect = svgRef.current?.getBoundingClientRect();
        if (entry && rect) {
          entry.fx = (event.clientX - rect.left - transform.x) / transform.k;
          entry.fy = (event.clientY - rect.top - transform.y) / transform.k;
        }
        return;
      }
      const pan = panRef.current;
      if (pan) {
        setTransform((current) => ({
          ...current,
          x: pan.originX + (event.clientX - pan.x),
          y: pan.originY + (event.clientY - pan.y),
        }));
      }
    },
    [transform.k, transform.x, transform.y],
  );

  const handlePointerUp = useCallback(() => {
    // Dragged nodes stay pinned, deliberately: arranging a cluster by hand is how people make
    // sense of it, and springing back undoes that work. "Reset view" unpins everything.
    dragRef.current = null;
    panRef.current = null;
    simulationRef.current?.alphaTarget(0);
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    setTransform((current) => {
      const next = Math.min(4, Math.max(0.2, current.k * (event.deltaY < 0 ? 1.12 : 0.89)));
      const ratio = next / current.k;
      return {
        k: next,
        x: pointerX - (pointerX - current.x) * ratio,
        y: pointerY - (pointerY - current.y) * ratio,
      };
    });
  }, []);

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, k: 1 });
    for (const entry of simulationRef.current?.nodes() ?? []) {
      entry.fx = null;
      entry.fy = null;
    }
    simulationRef.current?.alpha(0.6).restart();
  }, []);

  if (graph.nodes.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-sm text-muted-foreground",
          className,
        )}
      >
        No pages match these filters.
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        data-testid="knowledge-graph"
        data-tick={tick}
        aria-label="Knowledge graph"
        onPointerDown={(event) => {
          panRef.current = {
            x: event.clientX,
            y: event.clientY,
            originX: transform.x,
            originY: transform.y,
          };
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {layout.links.map((link, position) => {
            const source = link.source as PositionedNode;
            const target = link.target as PositionedNode;
            const dimmed =
              incident !== null &&
              !(incident.neighbours.has(source.id) && incident.neighbours.has(target.id));
            return (
              <line
                key={`${source.id}->${target.id}-${link.type}-${position}`}
                x1={source.x ?? 0}
                y1={source.y ?? 0}
                x2={target.x ?? 0}
                y2={target.y ?? 0}
                stroke="var(--border)"
                strokeWidth={link.type === "link" ? 1 : 1.5}
                // A typed frontmatter relation is drawn dashed, so the two kinds of edge are
                // distinguishable without a legend.
                strokeDasharray={link.type === "link" ? undefined : "4 3"}
                opacity={dimmed ? 0.1 : 0.55}
              />
            );
          })}

          {layout.nodes.map((entry) => {
            const { node } = entry;
            const radius = radiusFor(node);
            const dimmed = incident !== null && !incident.neighbours.has(entry.id);
            const searchDimmed = highlightIds !== undefined && !highlightIds.has(entry.id);
            const isSelected = selectedId === entry.id;
            return (
              <g
                key={entry.id}
                transform={`translate(${entry.x ?? 0},${entry.y ?? 0})`}
                opacity={dimmed || searchDimmed ? 0.18 : 1}
                className="cursor-pointer"
                onPointerDown={(event) => handlePointerDownNode(event, entry)}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(node);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onFocus?.(node);
                }}
                onPointerEnter={() => setHoveredId(entry.id)}
                onPointerLeave={() => setHoveredId(null)}
              >
                <circle
                  r={radius}
                  // A page that does not exist yet is drawn hollow and dashed. Wanted pages are
                  // the worklist, not an error state.
                  fill={node.exists ? namespaceColor(node.namespace) : "transparent"}
                  stroke={
                    isSelected
                      ? "var(--foreground)"
                      : node.exists
                        ? "var(--card)"
                        : namespaceColor(node.namespace)
                  }
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  strokeDasharray={node.exists ? undefined : "3 2"}
                  opacity={node.exists && node.inDegree === 0 ? 0.5 : 1}
                />
                <title>
                  {node.title}
                  {node.exists ? "" : " (not written yet)"}
                </title>
                {/*
                  Labelling every node at once is unreadable at this density, so by default only
                  the hubs are named and everything else is named on hover, on selection, or once
                  the reader has zoomed in far enough to have room for it.
                */}
                {(isSelected ||
                  hoveredId === entry.id ||
                  transform.k > 1.5 ||
                  node.inDegree >= 11) && (
                  <text
                    x={radius + 5}
                    y={4}
                    className="pointer-events-none fill-foreground text-[10px]"
                    style={{ paintOrder: "stroke", stroke: "var(--card)", strokeWidth: 3 }}
                  >
                    {node.title.length > 34 ? `${node.title.slice(0, 33)}…` : node.title}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute right-3 bottom-3 flex items-center gap-2 text-xs text-muted-foreground">
        {graph.truncated > 0 && (
          <span className="rounded-md border bg-card/90 px-2 py-1 shadow-sm">
            {graph.truncated} more pages not drawn — narrow the filter
          </span>
        )}
        <button
          type="button"
          onClick={resetView}
          className="rounded-md border bg-card/90 px-2 py-1 shadow-sm transition-colors hover:bg-muted"
        >
          Reset view
        </button>
      </div>
    </div>
  );
}
