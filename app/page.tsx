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
  sourceStart: number;
  sourceEnd: number;
  children: TreeNode[];
};

type JsonNodeData = {
  label: string;
  tooltip: string;
  sourceStart: number;
  sourceEnd: number;
  kind: TreeNode['kind'];
  isPendingDelete: boolean;
  canAddChild: boolean;
  onAddChild: (nodeId: string) => void;
  onDeleteClick: (nodeId: string) => void;
  onSpanHover: (start: number, end: number) => void;
  onSpanLeave: () => void;
  onSpanSelect: (start: number, end: number) => void;
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

function parseJsonTree(text: string, nextId: { current: number } = { current: 0 }): TreeNode | null {
  const length = text.length;
  let index = 0;

  const fail = (message: string): never => {
    throw new Error(`${message} at position ${index}`);
  };

  const skipWhitespace = () => {
    while (index < length && /\s/.test(text[index])) {
      index += 1;
    }
  };

  const parseString = (): string => {
    if (text[index] !== '"') fail('Expected string');

    const start = index;
    index += 1;
    let escaped = false;

    while (index < length) {
      const char = text[index];
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        const raw = text.slice(start, index + 1);
        index += 1;
        return JSON.parse(raw) as string;
      }

      index += 1;
    }

    fail('Unterminated string');
    return '';
  };

  const parseNumber = (): number => {
    const start = index;
    const numberPattern = /[0-9eE+\-\.]/;
    while (index < length && numberPattern.test(text[index])) {
      index += 1;
    }

    return JSON.parse(text.slice(start, index)) as number;
  };

  const parseValue = (key: string): TreeNode => {
    skipWhitespace();
    if (index >= length) fail('Unexpected end of input');

    const start = index;
    const char = text[index];

    if (char === '{') {
      index += 1;
      skipWhitespace();

      const children: TreeNode[] = [];
      const objectValue: Record<string, JsonValue> = {};

      if (text[index] === '}') {
        index += 1;
      } else {
        while (index < length) {
          skipWhitespace();
          const childKey = parseString();
          skipWhitespace();
          if (text[index] !== ':') fail('Expected colon after object key');
          index += 1;
          const child = parseValue(childKey);
          children.push(child);
          objectValue[childKey] = child.value;
          skipWhitespace();

          if (text[index] === ',') {
            index += 1;
            continue;
          }

          if (text[index] === '}') {
            index += 1;
            break;
          }

          fail('Expected comma or closing brace');
        }
      }

      return {
        id: `node_${nextId.current++}`,
        key,
        kind: 'object',
        value: objectValue,
        tooltip: formatValue(objectValue),
        sourceStart: start,
        sourceEnd: index,
        children,
      };
    }

    if (char === '[') {
      index += 1;
      skipWhitespace();

      const children: TreeNode[] = [];
      const arrayValue: JsonValue[] = [];

      if (text[index] === ']') {
        index += 1;
      } else {
        while (index < length) {
          const child = parseValue(String(children.length));
          children.push(child);
          arrayValue.push(child.value);
          skipWhitespace();

          if (text[index] === ',') {
            index += 1;
            continue;
          }

          if (text[index] === ']') {
            index += 1;
            break;
          }

          fail('Expected comma or closing bracket');
        }
      }

      return {
        id: `node_${nextId.current++}`,
        key,
        kind: 'array',
        value: arrayValue,
        tooltip: formatValue(arrayValue),
        sourceStart: start,
        sourceEnd: index,
        children,
      };
    }

    if (char === '"') {
      const value = parseString();
      return {
        id: `node_${nextId.current++}`,
        key,
        kind: 'value',
        value,
        tooltip: formatValue(value),
        sourceStart: start,
        sourceEnd: index,
        children: [],
      };
    }

    if (char === 't' && text.slice(index, index + 4) === 'true') {
      index += 4;
      return {
        id: `node_${nextId.current++}`,
        key,
        kind: 'value',
        value: true,
        tooltip: formatValue(true),
        sourceStart: start,
        sourceEnd: index,
        children: [],
      };
    }

    if (char === 'f' && text.slice(index, index + 5) === 'false') {
      index += 5;
      return {
        id: `node_${nextId.current++}`,
        key,
        kind: 'value',
        value: false,
        tooltip: formatValue(false),
        sourceStart: start,
        sourceEnd: index,
        children: [],
      };
    }

    if (char === 'n' && text.slice(index, index + 4) === 'null') {
      index += 4;
      return {
        id: `node_${nextId.current++}`,
        key,
        kind: 'value',
        value: null,
        tooltip: formatValue(null),
        sourceStart: start,
        sourceEnd: index,
        children: [],
      };
    }

    if (char === '-' || /\d/.test(char)) {
      const value = parseNumber();
      return {
        id: `node_${nextId.current++}`,
        key,
        kind: 'value',
        value,
        tooltip: formatValue(value),
        sourceStart: start,
        sourceEnd: index,
        children: [],
      };
    }

    return fail('Unsupported JSON token');
  };

  try {
    skipWhitespace();
    const tree = parseValue('root');
    skipWhitespace();

    if (index !== length) {
      fail('Unexpected trailing characters');
    }

    return tree;
  } catch (error) {
    console.error('Invalid JSON', error);
    return null;
  }
}

function copyTreeSpans(source: TreeNode, target: TreeNode): TreeNode {
  return {
    ...target,
    sourceStart: source.sourceStart,
    sourceEnd: source.sourceEnd,
    tooltip: source.tooltip,
    children: target.children.map((child, index) =>
      copyTreeSpans(source.children[index] ?? child, child),
    ),
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
  onSpanHover: (start: number, end: number) => void,
  onSpanLeave: () => void,
  onSpanSelect: (start: number, end: number) => void,
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
        onSpanHover,
        onSpanLeave,
        onSpanSelect,
        sourceStart: node.sourceStart,
        sourceEnd: node.sourceEnd,
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

  const handleMouseEnter = () => {
    data.onSpanHover(data.sourceStart, data.sourceEnd);
  };

  const handleMouseLeave = () => {
    data.onSpanLeave();
  };

  const handleSelect = () => {
    data.onSpanSelect(data.sourceStart, data.sourceEnd);
  };

  return (
    <div className="group relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <Handle type="target" position={Position.Left} />
      <div
        title={data.tooltip}
        className={`min-h-11 w-[220px] rounded-md border px-3 py-2 text-center text-sm font-medium text-white shadow-sm transition-colors duration-150 ${containerClass}`}
        onClick={handleSelect}
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
  const [hoveredSpan, setHoveredSpan] = useState<{ start: number; end: number } | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<{ start: number; end: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const nextIdRef = useRef(0);
  const nodeTypes = useMemo(() => ({ jsonNode: JsonNode }), []);

  const updateJson = useCallback((value: string) => {
    setRawJson(value);
    setPendingDeleteId(null);
    setHoveredSpan(null);
    setSelectedSpan(null);

    if (!value.trim()) {
      nextIdRef.current = 0;
      setTree(null);
      setPositions({});
      return;
    }

    try {
      nextIdRef.current = 0;
      const parseIdTracker = { current: 0 };
      const parsedTree = parseJsonTree(value, parseIdTracker);
      nextIdRef.current = parseIdTracker.current;
      setTree(parsedTree ? normalizeTree(parsedTree) : null);
      setPositions({});
    } catch (error) {
      console.error('Invalid JSON', error);
      setTree(null);
      setPositions({});
    }
  }, []);

  const activeSpan = hoveredSpan ?? selectedSpan;

  React.useEffect(() => {
    if (!activeSpan || !textareaRef.current) return;

    const textarea = textareaRef.current;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(activeSpan.start, activeSpan.end);
  }, [activeSpan]);

  const handleNodeClick = async (_: React.MouseEvent, node: JsonFlowNode) => {
    try {
      setSelectedSpan({ start: node.data.sourceStart, end: node.data.sourceEnd });
      setHoveredSpan(null);
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
                sourceStart: 0,
                sourceEnd: 0,
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
      const serialized = JSON.stringify(serializeTree(nextTree), null, 2);
      const spanTree = parseJsonTree(serialized);
      const nextTreeWithSpans = spanTree ? copyTreeSpans(spanTree, nextTree) : nextTree;

      setRawJson(serialized);
      setPositions((currentPositions) => prunePositions(currentPositions, nextTree));
      setHoveredSpan(null);
      setSelectedSpan(null);
      return nextTreeWithSpans;
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
      if (!normalized) {
        setRawJson('');
        setPositions({});
        setHoveredSpan(null);
        setSelectedSpan(null);
        return null;
      }

      const serialized = JSON.stringify(serializeTree(normalized), null, 2);
      const spanTree = parseJsonTree(serialized);
      const normalizedWithSpans = spanTree ? copyTreeSpans(spanTree, normalized) : normalized;

      setRawJson(serialized);
      setPositions((currentPositions) => prunePositions(currentPositions, normalizedWithSpans));
      setHoveredSpan(null);
      setSelectedSpan(null);
      return normalizedWithSpans;
    });
  }, [pendingDeleteId]);

  const { nodes, edges } = useMemo(() => {
    if (!tree) return { nodes: [], edges: [] };
    return layoutTree(
      tree,
      pendingDeleteId,
      positions,
      addChild,
      deleteNode,
      (start, end) => setHoveredSpan({ start, end }),
      () => setHoveredSpan(null),
      (start, end) => {
        setSelectedSpan({ start, end });
        setHoveredSpan(null);
      },
    );
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
          ref={textareaRef}
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
