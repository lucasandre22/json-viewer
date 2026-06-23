"use client";

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  type Edge,
  type NodeChange,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
  type XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Copy, Minus, Plus } from 'lucide-react';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type TreeNode = {
  id: string;
  key: string;
  kind: 'object' | 'array' | 'value';
  value: JsonValue;
  tooltip: string;
  children: TreeNode[];
};

type JsonNodeData = {
  label: string;
  tooltip: string;
  kind: TreeNode['kind'];
  isPendingDelete: boolean;
  canAddChild: boolean;
  onAddChild: (nodeId: string) => void;
  onDeleteClick: (nodeId: string) => void;
};

type JsonFlowNode = Node<JsonNodeData, 'jsonNode'>;

const NODE_WIDTH = 220;
const NODE_HEIGHT = 44;
const HORIZONTAL_GAP = 240;
const VERTICAL_GAP = 92;

function formatValue(value: JsonValue): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2) ?? 'null';
}

function buildTree(
  value: JsonValue,
  key: string,
  nextId: { current: number },
): TreeNode {
  const id = `node_${nextId.current++}`;
  const tooltip = formatValue(value);
  const kind: TreeNode['kind'] =
    Array.isArray(value) ? 'array' : value !== null && typeof value === 'object' ? 'object' : 'value';

  return {
    id,
    key,
    kind,
    value,
    tooltip,
    children:
      value !== null && typeof value === 'object'
        ? (Array.isArray(value)
            ? value.map((entry, index) => [String(index), entry] as const)
            : Object.entries(value)
          ).map(([childKey, entry]) => buildTree(entry, childKey, nextId))
        : [],
  };
}

function serializeTree(node: TreeNode): JsonValue {
  if (node.kind === 'array') {
    return node.children.map((child) => serializeTree(child));
  }

  if (node.kind === 'object') {
    return node.children.reduce<Record<string, JsonValue>>((acc, child) => {
      acc[child.key] = serializeTree(child);
      return acc;
    }, {});
  }

  return node.value;
}

function normalizeTree(node: TreeNode): TreeNode {
  const children = node.children.map((child, index) => {
    const normalizedChild = normalizeTree(child);
    return node.kind === 'array' ? { ...normalizedChild, key: String(index) } : normalizedChild;
  });

  return {
    ...node,
    children,
  };
}

function prunePositions(
  positions: Record<string, XYPosition>,
  node: TreeNode | null,
): Record<string, XYPosition> {
  if (!node) return {};

  const validIds = new Set<string>();
  const stack = [node];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    validIds.add(current.id);
    stack.push(...current.children);
  }

  return Object.fromEntries(
    Object.entries(positions).filter(([id]) => validIds.has(id)),
  );
}

function layoutTree(
  root: TreeNode,
  pendingDeleteId: string | null,
  positions: Record<string, XYPosition>,
  onAddChild: (nodeId: string) => void,
  onDeleteClick: (nodeId: string) => void,
) {
  const nodes: JsonFlowNode[] = [];
  const edges: Edge[] = [];
  let leafRow = 0;

  const placeNode = (node: TreeNode, depth: number): number => {
    const childCenters = node.children.map((child) => placeNode(child, depth + 1));

    const centerY =
      childCenters.length > 0
        ? (Math.min(...childCenters) + Math.max(...childCenters)) / 2
        : leafRow++ * VERTICAL_GAP;

    nodes.push({
      id: node.id,
      data: {
        label: node.key,
        tooltip: node.tooltip,
        kind: node.kind,
        isPendingDelete: pendingDeleteId === node.id,
        canAddChild: node.kind !== 'value',
        onAddChild,
        onDeleteClick,
      },
      position: {
        x: positions[node.id]?.x ?? depth * HORIZONTAL_GAP,
        y: positions[node.id]?.y ?? centerY - NODE_HEIGHT / 2,
      },
      style: {
        background: 'transparent',
        border: 'none',
        width: NODE_WIDTH,
        padding: 0,
      },
      type: 'jsonNode',
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    });

    node.children.forEach((child) => {
      edges.push({
        id: `edge_${node.id}_${child.id}`,
        source: node.id,
        target: child.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#475569' },
        type: 'smoothstep',
      });
    });

    return centerY;
  };

  placeNode(root, 0);

  return { nodes, edges };
}

function JsonNode({ id, data }: NodeProps<JsonFlowNode>) {
  const isArray = data.kind === 'array';
  const containerClass = isArray
    ? 'border-amber-400/70 bg-amber-500/10 hover:border-amber-300 hover:bg-amber-500/20'
    : data.kind === 'object'
      ? 'border-sky-400/60 bg-sky-500/10 hover:border-sky-300 hover:bg-sky-500/20'
      : 'border-slate-600 bg-slate-800 hover:border-sky-400 hover:bg-slate-700';

  const handleDeleteClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    data.onDeleteClick(id);
  };

  const handleAddClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    data.onAddChild(id);
  };

  return (
    <div className="group relative">
      <Handle type="target" position={Position.Left} />
      <div
        title={data.tooltip}
        className={`min-h-11 w-[220px] rounded-md border px-3 py-2 text-center text-sm font-medium text-white shadow-sm transition-colors duration-150 ${containerClass}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isArray ? 'bg-amber-300/20 text-amber-200' : 'bg-slate-700 text-slate-200'
            }`}
          >
            {isArray ? 'array' : data.kind}
          </span>
          <span className="flex-1 truncate text-center">{data.label}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleAddClick}
              disabled={!data.canAddChild}
              className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] transition ${
                data.canAddChild
                  ? 'border-slate-500/70 bg-slate-900/40 text-slate-100 hover:border-emerald-300 hover:text-emerald-200'
                  : 'cursor-not-allowed border-slate-700 bg-slate-900/20 text-slate-500'
              }`}
              aria-label={`Add child to ${data.label}`}
              title={data.canAddChild ? 'Add child' : 'Leaf value cannot accept children'}
            >
              <Plus size={11} />
            </button>
            <button
              type="button"
              onClick={handleDeleteClick}
              className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] transition ${
                data.isPendingDelete
                  ? 'border-rose-300 bg-rose-500/30 text-rose-100'
                  : 'border-slate-500/70 bg-slate-900/40 text-slate-100 hover:border-rose-300 hover:text-rose-200'
              }`}
              aria-label={
                data.isPendingDelete ? `Confirm delete ${data.label}` : `Delete ${data.label}`
              }
              title={data.isPendingDelete ? 'Click again to delete' : 'Delete subtree'}
            >
              {data.isPendingDelete ? <Minus size={11} /> : <Minus size={11} />}
            </button>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-0 z-20 hidden max-w-[320px] -translate-x-1/2 -translate-y-full whitespace-pre-wrap rounded border border-slate-700 bg-slate-900 px-3 py-2 text-left text-xs text-slate-100 shadow-lg group-hover:block">
        {data.tooltip}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default function JsonViewer() {
  const [rawJson, setRawJson] = useState('');
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, XYPosition>>({});
  const nextIdRef = useRef(0);
  const nodeTypes = useMemo(() => ({ jsonNode: JsonNode }), []);

  const updateJson = useCallback((value: string) => {
    setRawJson(value);
    setPendingDeleteId(null);

    if (!value.trim()) {
      nextIdRef.current = 0;
      setTree(null);
      setPositions({});
      return;
    }

    try {
      nextIdRef.current = 0;
      const parsed = JSON.parse(value) as JsonValue;
      const nextTree = buildTree(parsed, 'root', nextIdRef);
      setTree(normalizeTree(nextTree));
      setPositions({});
    } catch (error) {
      console.error('Invalid JSON', error);
      setTree(null);
      setPositions({});
    }
  }, []);

  const handleNodeClick = async (_: React.MouseEvent, node: JsonFlowNode) => {
    try {
      await navigator.clipboard.writeText(node.data.tooltip);
    } catch (error) {
      console.error('Failed to copy node value', error);
    }
  };

  const addChild = useCallback((nodeId: string) => {
    setTree((current) => {
      if (!current) return current;

      const appendChild = (node: TreeNode): TreeNode => {
        if (node.id === nodeId) {
          const isArray = node.kind === 'array';
          const childKeyBase = isArray ? String(node.children.length) : 'new_key';
          const childKey = isArray
            ? childKeyBase
            : (() => {
                const existing = new Set(node.children.map((child) => child.key));
                let suffix = 1;
                let candidate = childKeyBase;
                while (existing.has(candidate)) {
                  suffix += 1;
                  candidate = `${childKeyBase}_${suffix}`;
                }
                return candidate;
              })();

          return normalizeTree({
            ...node,
            children: [
              ...node.children,
              {
                id: `node_${nextIdRef.current++}`,
                key: childKey,
                kind: 'value',
                value: null,
                tooltip: 'null',
                children: [],
              },
            ],
          });
        }

        return {
          ...node,
          children: node.children.map(appendChild),
        };
      };

      const nextTree = normalizeTree(appendChild(current));
      setRawJson(JSON.stringify(serializeTree(nextTree), null, 2));
      setPositions((currentPositions) => prunePositions(currentPositions, nextTree));
      return nextTree;
    });
    setPendingDeleteId(null);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    if (pendingDeleteId !== nodeId) {
      setPendingDeleteId(nodeId);
      return;
    }

    setTree((current) => {
      if (!current) return current;

      const removeNode = (node: TreeNode): TreeNode | null => {
        if (node.id === nodeId) return null;

        return {
          ...node,
          children: node.children
            .map(removeNode)
            .filter((child): child is TreeNode => child !== null),
        };
      };

      setPendingDeleteId(null);
      const nextTree = removeNode(current);
      const normalized = nextTree ? normalizeTree(nextTree) : null;
      setRawJson(normalized ? JSON.stringify(serializeTree(normalized), null, 2) : '');
      setPositions((currentPositions) => prunePositions(currentPositions, normalized));
      return normalized;
    });
  }, [pendingDeleteId]);

  const { nodes, edges } = useMemo(() => {
    if (!tree) return { nodes: [], edges: [] };
    return layoutTree(tree, pendingDeleteId, positions, addChild, deleteNode);
  }, [tree, pendingDeleteId, positions, addChild, deleteNode]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setPositions((current) => {
      let next = current;

      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          next = { ...next, [change.id]: change.position };
        }
      }

      return next;
    });
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(rawJson);
    alert('Copied!');
  };

  return (
    <main className="flex h-screen w-full bg-slate-950 text-white overflow-hidden">
      <div className="w-1/3 border-r border-slate-800 flex flex-col p-4">
        <h1 className="text-xl font-bold mb-4">JSON Input</h1>
        <textarea
          className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 font-mono text-sm focus:outline-none focus:border-blue-500"
          value={rawJson}
          onChange={(e) => updateJson(e.target.value)}
          placeholder='Paste your JSON here...'
        />
        <button 
          onClick={copyToClipboard}
          className="mt-4 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 p-2 rounded transition"
        >
          <Copy size={16} /> Copy JSON
        </button>
      </div>
      
      <div className="w-2/3 relative">
        <div className="absolute top-4 left-4 z-10 bg-slate-900/80 p-2 rounded border border-slate-700">
          <h1 className="text-xl font-bold">Graph View</h1>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-slate-950"
        >
          <Background color="#334155" />
          <Controls />
        </ReactFlow>
      </div>
    </main>
  );
}
