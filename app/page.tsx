"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { JsonGraph } from "@/app/json-graph";
import {
  MAX_JSON_BYTES,
  MAX_RENDERED_NODES,
  addChild,
  copyTreeSpans,
  getUtf8ByteLength,
  normalizeTree,
  parseJsonTree,
  prunePositions,
  removeNode,
  serializeTree,
  type TreeNode,
} from "@/lib/json-tree";
import type { XYPosition } from "@xyflow/react";

const PARSE_DEBOUNCE_MS = 200;

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1024)} KiB`;
}

export default function JsonViewer() {
  const [rawJson, setRawJson] = useState("");
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [parseMessage, setParseMessage] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, XYPosition>>({});
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const nextIdRef = useRef(0);
  const isGraphEditRef = useRef(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (isGraphEditRef.current) {
        isGraphEditRef.current = false;
        return;
      }
      setPendingDeleteId(null);
      if (!rawJson.trim()) {
        nextIdRef.current = 0;
        setTree(null);
        setPositions({});
        setParseMessage(null);
        return;
      }

      const byteLength = getUtf8ByteLength(rawJson);
      if (byteLength > MAX_JSON_BYTES) {
        setTree(null);
        setPositions({});
        setParseMessage(
          `Graph rendering is limited to ${formatBytes(MAX_JSON_BYTES)}. This input is ${formatBytes(byteLength)}.`,
        );
        return;
      }

      const tracker = { current: 0 };
      const parsed = parseJsonTree(rawJson, tracker);
      if (!parsed) {
        setTree(null);
        setPositions({});
        setParseMessage("Invalid JSON. Fix the input to render its graph.");
        return;
      }

      nextIdRef.current = tracker.current;
      setTree(normalizeTree(parsed));
      setPositions({});
      setParseMessage(null);
    }, PARSE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [rawJson]);

  const selectNodeValue = useCallback((start: number, end: number, value: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(start, end);
    }
    void navigator.clipboard
      .writeText(value)
      .catch((error: unknown) => console.error("Failed to copy node value", error));
  }, []);

  const handleAddChild = useCallback((nodeId: string) => {
    setTree((current) => {
      if (!current) return current;
      const next = addChild(current, nodeId, nextIdRef.current++);
      const serialized = JSON.stringify(serializeTree(next), null, 2);
      const spanTree = parseJsonTree(serialized);
      const withSpans = spanTree ? copyTreeSpans(spanTree, next) : next;
      isGraphEditRef.current = true;
      setRawJson(serialized);
      return withSpans;
    });
    setPendingDeleteId(null);
  }, []);

  const handleDelete = useCallback(
    (nodeId: string) => {
      if (pendingDeleteId !== nodeId) {
        setPendingDeleteId(nodeId);
        return;
      }

      setTree((current) => {
        if (!current) return current;
        const next = removeNode(current, nodeId);
        if (!next) {
          isGraphEditRef.current = true;
          setRawJson("");
          setPositions({});
          return null;
        }
        const serialized = JSON.stringify(serializeTree(next), null, 2);
        const spanTree = parseJsonTree(serialized);
        isGraphEditRef.current = true;
        setRawJson(serialized);
        setPositions((currentPositions) => prunePositions(currentPositions, next));
        return spanTree ? copyTreeSpans(spanTree, next) : next;
      });
      setPendingDeleteId(null);
    },
    [pendingDeleteId],
  );

  const copyJson = useCallback(() => {
    void navigator.clipboard
      .writeText(rawJson)
      .catch((error: unknown) => console.error("Failed to copy JSON", error));
  }, [rawJson]);

  return (
    <main className="flex h-screen w-full overflow-hidden bg-slate-950 text-white">
      <section className="flex w-1/3 min-w-80 flex-col border-r border-slate-800 p-4">
        <h1 className="mb-4 text-xl font-bold">JSON Input</h1>
        <textarea
          ref={textareaRef}
          className="flex-1 rounded border border-slate-700 bg-slate-900 p-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
          value={rawJson}
          onChange={(event) => setRawJson(event.target.value)}
          placeholder='Paste your JSON here...'
          spellCheck={false}
        />
        <p className={`mt-2 text-sm ${parseMessage ? "text-rose-300" : "text-slate-400"}`}>
          {parseMessage ?? `Graph limit: ${MAX_RENDERED_NODES.toLocaleString()} visible nodes.`}
        </p>
        <button
          type="button"
          onClick={copyJson}
          className="mt-3 flex items-center justify-center gap-2 rounded bg-blue-600 p-2 transition hover:bg-blue-700"
        >
          <Copy size={16} /> Copy JSON
        </button>
      </section>

      <section className="relative w-2/3">
        <div className="absolute left-4 top-4 z-10 rounded border border-slate-700 bg-slate-900/80 p-2">
          <h2 className="text-xl font-bold">Graph View</h2>
        </div>
        <JsonGraph
          tree={tree}
          positions={positions}
          pendingDeleteId={pendingDeleteId}
          onPositionsChange={setPositions}
          onLayoutPositionsChange={setPositions}
          onAddChild={handleAddChild}
          onDeleteClick={handleDelete}
          onSpanSelect={selectNodeValue}
          maxNodes={MAX_RENDERED_NODES}
        />
      </section>
    </main>
  );
}
