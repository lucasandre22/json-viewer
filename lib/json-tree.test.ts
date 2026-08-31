import { describe, expect, it } from "vitest";
import {
  MAX_RENDERED_NODES,
  addChild,
  countNodes,
  normalizeTree,
  parseJsonTree,
  removeNode,
  serializeTree,
} from "./json-tree";
import { createDeepJsonFixture, createWideJsonFixture } from "./json-fixtures";

describe("JSON tree model", () => {
  it("retains source spans and serializes parsed JSON", () => {
    const tree = parseJsonTree('{"items":[true,2]}');
    expect(tree).not.toBeNull();
    expect(tree?.sourceStart).toBe(0);
    expect(tree?.sourceEnd).toBe(18);
    expect(serializeTree(tree!)).toEqual({ items: [true, 2] });
  });

  it("renumbers arrays after a deletion", () => {
    const tree = parseJsonTree('["first","second"]')!;
    const next = normalizeTree(removeNode(tree, tree.children[0].id)!);
    expect(next.children.map((child) => child.key)).toEqual(["0"]);
  });

  it("adds collision-free object keys", () => {
    const tree = parseJsonTree('{"new_key":true}')!;
    const next = addChild(tree, tree.id, 2);
    expect(next.children.map((child) => child.key)).toEqual(["new_key", "new_key_2"]);
  });

  it("has a defined graph budget", () => {
    expect(MAX_RENDERED_NODES).toBe(2_000);
    expect(countNodes(parseJsonTree("[1,2,3]")!)).toBe(4);
  });

  it("uses constant-size container previews", () => {
    const tree = parseJsonTree('{"items":[1,2,3]}')!;
    expect(tree.tooltip).toBe("Object (1 child)");
    expect(tree.children[0].tooltip).toBe("Array (3 children)");
  });

  it("parses deterministic target-scale fixtures", () => {
    expect(countNodes(parseJsonTree(createWideJsonFixture(1_999))!)).toBe(MAX_RENDERED_NODES);
    expect(countNodes(parseJsonTree(createDeepJsonFixture(100))!)).toBe(101);
  });
});
