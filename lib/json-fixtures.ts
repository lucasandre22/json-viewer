export function createWideJsonFixture(nodeCount: number): string {
  return JSON.stringify(
    Object.fromEntries(
      Array.from({ length: nodeCount }, (_, index) => [`property_${index}`, index]),
    ),
  );
}

export function createDeepJsonFixture(depth: number): string {
  let value: unknown = "leaf";
  for (let index = 0; index < depth; index += 1) value = { [`level_${index}`]: value };
  return JSON.stringify(value);
}
