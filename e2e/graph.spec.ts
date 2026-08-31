import { expect, test } from "@playwright/test";

test("renders a graph while preserving viewport through graph edits", async ({ page }) => {
  await page.goto("/");
  await page.locator("textarea").fill(
    JSON.stringify({ users: [{ name: "Ada" }, { name: "Grace" }], enabled: true }),
  );

  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(7);
  await expect(nodes.first()).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(6);

  const viewport = page.locator(".react-flow__viewport");
  const initialTransform = await viewport.getAttribute("style");
  await page.getByRole("button", { name: "Zoom In" }).click();
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(initialTransform);
  const transformAfterZoom = await viewport.getAttribute("style");

  await page.getByRole("button", { name: "Add child to root" }).click();
  await expect(nodes).toHaveCount(8);
  await expect.poll(() => viewport.getAttribute("style")).toBe(transformAfterZoom);

  const addedNode = page.locator(".react-flow__node", { hasText: "new_key" });
  await addedNode.getByRole("button", { name: "Delete new_key" }).click();
  await addedNode.getByRole("button", { name: "Delete new_key" }).click();
  await expect(nodes).toHaveCount(7);
  await expect.poll(() => viewport.getAttribute("style")).toBe(transformAfterZoom);

  const rootNode = nodes.first();
  const rootBounds = await rootNode.boundingBox();
  if (!rootBounds) throw new Error("Root graph node was not rendered");
  const rootPositionBeforeDrag = await rootNode.getAttribute("style");
  const edgePath = page.locator(".react-flow__edge path").first();
  const edgePathBeforeDrag = await edgePath.getAttribute("d");
  await page.mouse.move(rootBounds.x + rootBounds.width / 2, rootBounds.y + rootBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(rootBounds.x + rootBounds.width / 2 + 100, rootBounds.y + rootBounds.height / 2 + 40, {
    steps: 10,
  });
  await page.mouse.up();
  await expect.poll(() => rootNode.getAttribute("style")).not.toBe(rootPositionBeforeDrag);
  await expect.poll(() => edgePath.getAttribute("d")).not.toBe(edgePathBeforeDrag);
});
