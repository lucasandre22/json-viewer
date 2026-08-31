export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type TreeNode = {
  id: string;
  key: string;
  kind: "object" | "array" | "value";
  value: JsonValue;
  tooltip: string;
  sourceStart: number;
  sourceEnd: number;
  children: TreeNode[];
};

export const MAX_JSON_BYTES = 1024 * 1024;
export const MAX_RENDERED_NODES = 2_000;

export function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function formatValue(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "null";
}

export function parseJsonTree(
  text: string,
  nextId: { current: number } = { current: 0 },
): TreeNode | null {
  const length = text.length;
  let index = 0;

  const fail = (message: string): never => {
    throw new Error(`${message} at position ${index}`);
  };

  const skipWhitespace = () => {
    while (index < length && /\s/.test(text[index])) index += 1;
  };

  const parseString = (): string => {
    if (text[index] !== '"') fail("Expected string");
    const start = index++;
    let escaped = false;

    while (index < length) {
      const char = text[index];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') {
        const raw = text.slice(start, ++index);
        return JSON.parse(raw) as string;
      }
      index += 1;
    }

    return fail("Unterminated string");
  };

  const createNode = (
    key: string,
    kind: TreeNode["kind"],
    value: JsonValue,
    start: number,
    children: TreeNode[],
  ): TreeNode => ({
    id: `node_${nextId.current++}`,
    key,
    kind,
    value,
    tooltip:
      kind === "value"
        ? formatValue(value)
        : `${kind === "object" ? "Object" : "Array"} (${children.length} ${children.length === 1 ? "child" : "children"})`,
    sourceStart: start,
    sourceEnd: index,
    children,
  });

  const parseValue = (key: string): TreeNode => {
    skipWhitespace();
    if (index >= length) fail("Unexpected end of input");
    const start = index;
    const char = text[index];

    if (char === "{") {
      index += 1;
      skipWhitespace();
      const children: TreeNode[] = [];
      const value: Record<string, JsonValue> = {};
      while (text[index] !== "}") {
        const childKey = parseString();
        skipWhitespace();
        if (text[index++] !== ":") fail("Expected colon after object key");
        const child = parseValue(childKey);
        children.push(child);
        value[childKey] = child.value;
        skipWhitespace();
        if (text[index] !== ",") break;
        index += 1;
        skipWhitespace();
      }
      if (text[index++] !== "}") fail("Expected comma or closing brace");
      return createNode(key, "object", value, start, children);
    }

    if (char === "[") {
      index += 1;
      skipWhitespace();
      const children: TreeNode[] = [];
      const value: JsonValue[] = [];
      while (text[index] !== "]") {
        const child = parseValue(String(children.length));
        children.push(child);
        value.push(child.value);
        skipWhitespace();
        if (text[index] !== ",") break;
        index += 1;
        skipWhitespace();
      }
      if (text[index++] !== "]") fail("Expected comma or closing bracket");
      return createNode(key, "array", value, start, children);
    }

    if (char === '"') {
      const value = parseString();
      return createNode(key, "value", value, start, []);
    }

    for (const [literal, value] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (text.slice(index, index + literal.length) === literal) {
        index += literal.length;
        return createNode(key, "value", value, start, []);
      }
    }

    if (char === "-" || /\d/.test(char)) {
      const numberStart = index;
      while (index < length && /[0-9eE+.-]/.test(text[index])) index += 1;
      return createNode(key, "value", JSON.parse(text.slice(numberStart, index)) as number, start, []);
    }

    return fail("Unsupported JSON token");
  };

  try {
    skipWhitespace();
    const tree = parseValue("root");
    skipWhitespace();
    if (index !== length) fail("Unexpected trailing characters");
    return tree;
  } catch {
    return null;
  }
}

export function countNodes(node: TreeNode): number {
  return 1 + node.children.reduce((total, child) => total + countNodes(child), 0);
}

export function normalizeTree(node: TreeNode): TreeNode {
  return {
    ...node,
    children: node.children.map((child, index) => ({
      ...normalizeTree(child),
      key: node.kind === "array" ? String(index) : child.key,
    })),
  };
}

export function serializeTree(node: TreeNode): JsonValue {
  if (node.kind === "array") return node.children.map(serializeTree);
  if (node.kind === "object") {
    return Object.fromEntries(node.children.map((child) => [child.key, serializeTree(child)]));
  }
  return node.value;
}

export function copyTreeSpans(source: TreeNode, target: TreeNode): TreeNode {
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

export function addChild(root: TreeNode, nodeId: string, nextId: number): TreeNode {
  const visit = (node: TreeNode): TreeNode => {
    if (node.id === nodeId && node.kind !== "value") {
      const existingKeys = new Set(node.children.map((child) => child.key));
      let key = node.kind === "array" ? String(node.children.length) : "new_key";
      let suffix = 2;
      while (existingKeys.has(key)) key = `new_key_${suffix++}`;
      return normalizeTree({
        ...node,
        children: [
          ...node.children,
          {
            id: `node_${nextId}`,
            key,
            kind: "value",
            value: null,
            tooltip: "null",
            sourceStart: 0,
            sourceEnd: 0,
            children: [],
          },
        ],
      });
    }
    return { ...node, children: node.children.map(visit) };
  };
  return visit(root);
}

export function removeNode(root: TreeNode, nodeId: string): TreeNode | null {
  if (root.id === nodeId) return null;
  return normalizeTree({
    ...root,
    children: root.children
      .map((child) => removeNode(child, nodeId))
      .filter((child): child is TreeNode => child !== null),
  });
}

export function prunePositions<T>(positions: Record<string, T>, root: TreeNode | null) {
  if (!root) return {};
  const ids = new Set<string>();
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    ids.add(node.id);
    stack.push(...node.children);
  }
  return Object.fromEntries(Object.entries(positions).filter(([id]) => ids.has(id))) as Record<string, T>;
}
