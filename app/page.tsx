"use client";

import React, { useEffect, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  type Edge,
  Position,
  ReactFlow,
  type Node,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Copy } from 'lucide-react';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type TreeNode = {
  id: string;
  label: string;
  children: TreeNode[];
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 44;
const HORIZONTAL_GAP = 240;
const VERTICAL_GAP = 92;

function getNodeLabel(value: JsonValue): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '[...]';
  if (typeof value === 'object') return '{...}';
  return String(value);
}

function buildTree(value: JsonValue, nextId: { current: number }): TreeNode {
  const id = `node_${nextId.current++}`;

  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value) ? value : Object.values(value);
    return {
      id,
      label: getNodeLabel(value),
      children: entries.map((entry) => buildTree(entry, nextId)),
    };
  }

  return {
    id,
    label: getNodeLabel(value),
    children: [],
  };
}

function layoutTree(root: TreeNode) {
  const nodes: Node<{ label: string }>[] = [];
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
      data: { label: node.label },
      position: {
        x: depth * HORIZONTAL_GAP,
        y: centerY - NODE_HEIGHT / 2,
      },
      style: {
        background: '#1e293b',
        color: '#fff',
        padding: '5px 12px',
        borderRadius: '6px',
        border: '1px solid #334155',
        fontSize: '12px',
        width: NODE_WIDTH,
        minWidth: '60px',
        textAlign: 'center',
      },
      type: 'default',
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

export default function JsonViewer() {
  const [rawJson, setRawJson] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!rawJson) {
      setNodes([]);
      setEdges([]);
      return;
    }

    try {
      const parsed = JSON.parse(rawJson) as JsonValue;
      const tree = buildTree(parsed, { current: 0 });
      const layout = layoutTree(tree);

      setNodes(layout.nodes);
      setEdges(layout.edges);
    } catch (e) {
      console.error("Invalid JSON", e);
      setNodes([]);
      setEdges([]);
    }
  }, [rawJson, setNodes, setEdges]);

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
          onChange={(e) => setRawJson(e.target.value)}
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
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
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
