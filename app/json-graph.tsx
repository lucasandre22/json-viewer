"use client";

import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  getSmoothStepPath,
  MarkerType,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronDown, ChevronRight, LayoutPanelLeft, Minus, Plus } from "lucide-react";
import { type TreeNode, prunePositions } from "@/lib/json-tree";

type JsonNodeData = {
  label: string;
  tooltip: string;
  kind: TreeNode["kind"];
  collapsed: boolean;
  descendantCount: number;
  onToggleCollapse: (nodeId: string) => void;
  onAddChild: (nodeId: string) => void;
  onDeleteClick: (nodeId: string) => void;
  onSpanSelect: (start: number, end: number, value: string) => void;
  sourceStart: number;
  sourceEnd: number;
};

type JsonFlowNode = Node<JsonNodeData, "jsonNode">;
type RoutedEdgeData = { points: XYPosition[] };
type RoutedEdge = Edge<RoutedEdgeData, "jsonEdge">;
type LayoutResult = { nodes: JsonFlowNode[]; edges: RoutedEdge[] };

const NODE_WIDTH = 220;
const NODE_HEIGHT = 48;
const EMPTY_GRAPH: LayoutResult = { nodes: [], edges: [] };
let elk: InstanceType<typeof ELK> | null = null;

function getElk(): InstanceType<typeof ELK> {
  if (!elk) {
    elk = new ELK({
      workerFactory: () =>
        new Worker(new URL("../node_modules/elkjs/lib/elk-worker.min.js", import.meta.url)),
    });
  }
  return elk;
}

function countDescendants(node: TreeNode): number {
  return node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);
}

function flattenVisibleTree(root: TreeNode, collapsed: Set<string>) {
  const nodes: TreeNode[] = [];
  const edges: Array<{ id: string; source: string; target: string }> = [];
  const visit = (node: TreeNode) => {
    nodes.push(node);
    if (collapsed.has(node.id)) return;
    node.children.forEach((child) => {
      edges.push({ id: `edge_${node.id}_${child.id}`, source: node.id, target: child.id });
      visit(child);
    });
  };
  visit(root);
  return { nodes, edges };
}

async function layoutVisibleTree(
  root: TreeNode,
  collapsed: Set<string>,
  positions: Record<string, XYPosition>,
  data: Omit<JsonNodeData, "label" | "tooltip" | "kind" | "collapsed" | "descendantCount" | "sourceStart" | "sourceEnd">,
): Promise<LayoutResult> {
  const visible = flattenVisibleTree(root, collapsed);
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "72",
      "elk.spacing.nodeNode": "28",
      "elk.padding": "[top=48,left=32,bottom=32,right=32]",
    },
    children: visible.nodes.map((node) => ({ id: node.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: visible.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };
  const result = await getElk().layout(graph);
  const positioned = new Map((result.children ?? []).map((node) => [node.id, node]));
  const routed = new Map((result.edges ?? []).map((edge) => [edge.id, edge]));

  return {
    nodes: visible.nodes.map((node) => {
      const positionedNode = positioned.get(node.id);
      return {
        id: node.id,
        type: "jsonNode",
        position: positions[node.id] ?? { x: positionedNode?.x ?? 0, y: positionedNode?.y ?? 0 },
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
        handles: [
          {
            id: "target",
            type: "target",
            position: Position.Left,
            x: 0,
            y: NODE_HEIGHT / 2,
          },
          {
            id: "source",
            type: "source",
            position: Position.Right,
            x: NODE_WIDTH,
            y: NODE_HEIGHT / 2,
          },
        ],
        data: {
          label: node.key,
          tooltip: node.tooltip,
          kind: node.kind,
          collapsed: collapsed.has(node.id),
          descendantCount: countDescendants(node),
          sourceStart: node.sourceStart,
          sourceEnd: node.sourceEnd,
          ...data,
        },
        style: { padding: 0, border: "none", background: "transparent" },
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
      };
    }),
    edges: visible.edges.map((edge) => {
      const section = routed.get(edge.id)?.sections?.[0];
      return {
        ...edge,
        type: "jsonEdge",
        sourceHandle: "source",
        targetHandle: "target",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b" },
        data: {
          points: section
            ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
            : [],
        },
      };
    }),
  };
}

const JsonNode = memo(function JsonNode({ id, data }: NodeProps<JsonFlowNode>) {
  const isContainer = data.kind !== "value";
  const tone =
    data.kind === "array"
      ? "border-amber-400/70 bg-amber-500/10"
      : data.kind === "object"
        ? "border-sky-400/60 bg-sky-500/10"
        : "border-slate-600 bg-slate-800";

  return (
    <div className="group relative">
      <Handle id="target" type="target" position={Position.Left} />
      <div
        title={data.tooltip}
        className={`min-h-12 w-[220px] rounded-md border px-3 py-2 text-sm font-medium text-white shadow-sm ${tone}`}
        onClick={() => data.onSpanSelect(data.sourceStart, data.sourceEnd, data.tooltip)}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!isContainer}
            onClick={(event) => {
              event.stopPropagation();
              data.onToggleCollapse(id);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-200 disabled:invisible"
            aria-label={data.collapsed ? `Expand ${data.label}` : `Collapse ${data.label}`}
          >
            {data.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
          <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200">
            {data.kind}
          </span>
          <span className="min-w-0 flex-1 truncate text-center">{data.label}</span>
          <button
            type="button"
            disabled={!isContainer}
            onClick={(event) => {
              event.stopPropagation();
              data.onAddChild(id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded border border-slate-500/70 text-slate-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
            aria-label={`Add child to ${data.label}`}
          >
            <Plus size={11} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              data.onDeleteClick(id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded border border-slate-500/70 text-slate-100"
            aria-label={`Delete ${data.label}`}
          >
            <Minus size={11} />
          </button>
        </div>
        {data.collapsed && (
          <span className="mt-1 block text-center text-[10px] text-slate-300">
            {data.descendantCount} hidden descendant{data.descendantCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-0 z-20 hidden max-w-[320px] -translate-x-1/2 -translate-y-full whitespace-pre-wrap rounded border border-slate-700 bg-slate-900 px-3 py-2 text-left text-xs text-slate-100 shadow-lg group-hover:block">
        {data.tooltip}
      </div>
      <Handle id="source" type="source" position={Position.Right} />
    </div>
  );
});

const JsonEdge = memo(function JsonEdge({
  id,
  data,
  markerEnd,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<RoutedEdge>) {
  if (!data?.points.length) return null;
  const [start, ...rest] = data.points;
  const end = rest.at(-1)!;
  const endpointsMoved =
    Math.abs(sourceX - start.x) > 0.5 ||
    Math.abs(sourceY - start.y) > 0.5 ||
    Math.abs(targetX - end.x) > 0.5 ||
    Math.abs(targetY - end.y) > 0.5;
  const [path] = endpointsMoved
    ? getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
    : [
        rest.reduce(
          (result, point) => `${result} L ${point.x} ${point.y}`,
          `M ${start.x} ${start.y}`,
        ),
      ];
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: "#64748b", strokeWidth: 1.5 }} />;
});

const nodeTypes = { jsonNode: JsonNode };
const edgeTypes = { jsonEdge: JsonEdge };

type JsonGraphProps = {
  tree: TreeNode | null;
  positions: Record<string, XYPosition>;
  pendingDeleteId: string | null;
  onPositionsChange: (positions: Record<string, XYPosition>) => void;
  onLayoutPositionsChange: (positions: Record<string, XYPosition>) => void;
  onAddChild: (nodeId: string) => void;
  onDeleteClick: (nodeId: string) => void;
  onSpanSelect: (start: number, end: number, value: string) => void;
  maxNodes: number;
};

export function JsonGraph({
  tree,
  positions,
  pendingDeleteId,
  onPositionsChange,
  onLayoutPositionsChange,
  onAddChild,
  onDeleteClick,
  onSpanSelect,
  maxNodes,
}: JsonGraphProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [graph, setGraph] = useState<LayoutResult>(EMPTY_GRAPH);
  const layoutVersion = useRef(0);
  const positionsRef = useRef(positions);
  const [layoutRevision, setLayoutRevision] = useState(0);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!tree) {
      return;
    }
    const visible = flattenVisibleTree(tree, collapsed);
    if (visible.nodes.length > maxNodes) {
      return;
    }
    const version = ++layoutVersion.current;
    void layoutVisibleTree(tree, collapsed, positionsRef.current, {
      onToggleCollapse: toggleCollapse,
      onAddChild,
      onDeleteClick,
      onSpanSelect,
    })
      .then((nextGraph) => {
        if (version === layoutVersion.current) {
          setGraph(nextGraph);
          onLayoutPositionsChange(
            Object.fromEntries(nextGraph.nodes.map((node) => [node.id, node.position])),
          );
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to calculate graph layout", error);
      });
  }, [
    tree,
    collapsed,
    maxNodes,
    layoutRevision,
    toggleCollapse,
    onAddChild,
    onDeleteClick,
    onSpanSelect,
    onLayoutPositionsChange,
  ]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = { ...positions };
      for (const change of changes) {
        if (change.type === "position" && change.position) next[change.id] = change.position;
      }
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) => ({
          ...node,
          position: next[node.id] ?? node.position,
        })),
      }));
      onPositionsChange(prunePositions(next, tree));
    },
    [onPositionsChange, positions, tree],
  );

  const resetLayout = useCallback(() => {
    onPositionsChange({});
    setLayoutRevision((current) => current + 1);
  }, [onPositionsChange]);

  const visibleCount = tree ? flattenVisibleTree(tree, collapsed).nodes.length : 0;
  const displayedGraph = tree && visibleCount <= maxNodes ? graph : EMPTY_GRAPH;
  if (tree && visibleCount > maxNodes) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-slate-300">
        Expand fewer branches before rendering. This view is limited to {maxNodes.toLocaleString()} nodes.
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={resetLayout}
        className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-100"
      >
        <LayoutPanelLeft size={16} /> Auto layout
      </button>
      <ReactFlow
        nodes={displayedGraph.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            // Keep the current confirmation state out of the tree model.
            label: pendingDeleteId === node.id ? `${node.data.label} (confirm delete)` : node.data.label,
          },
        }))}
        edges={displayedGraph.edges}
        onNodesChange={handleNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick
        className="bg-slate-950"
      >
        <Background color="#334155" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
