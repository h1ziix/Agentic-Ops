import { expect, test } from "@playwright/test";

const routes = ["dashboard", "workflows", "workflows/kazakhstan-fintech", "companies", "leads", "approvals", "activity", "automation", "intelligence", "icps", "templates", "settings", "onboarding"];
test("all showcase screens render across the required widths with no overflow, runtime errors or operational requests", async ({ page }) => {
  const errors: string[] = []; const operationalRequests: string[] = []; const failedResponses: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) operationalRequests.push(request.url()); });
  page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });
  for (const width of [1920, 1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      await page.goto(`/demo/${route}`);
      await expect(page.getByText("DEMO / SAMPLE", { exact: true })).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${width}px ${route} overflow`).toBeTruthy();
      if (route === "dashboard" && width >= 768) {
        const stages = page.getByRole("list", { name: "Execution stages", exact: true }).locator("li");
        await expect.poll(() => stages.evaluateAll((items) => items.every((stage) => getComputedStyle(stage).opacity === "1"))).toBeTruthy();
        expect(await stages.evaluateAll((items) => new Set(items.map((stage) => Math.round(stage.getBoundingClientRect().top))).size)).toBe(1);
      }
      if (width === 1440 && ["dashboard", "workflows/kazakhstan-fintech", "leads", "approvals", "automation", "intelligence"].includes(route)) {
        await expect(page.locator("#main-content > div").first()).toHaveCSS("opacity", "1");
        await page.screenshot({ path: `docs/screenshots/${route === "workflows/kazakhstan-fintech" ? "workflow" : route === "approvals" ? "approval" : route}.png`, fullPage: true, animations: "disabled" });
      }
    }
  }
  expect(errors).toEqual([]); expect(operationalRequests).toEqual([]); expect(failedResponses).toEqual([]);
});

test("record drawers and stage details restore keyboard focus; compact navigation and filters remain usable", async ({ page }) => {
  for (const route of ["companies", "leads"]) {
    await page.goto(`/demo/${route}`);
    const launcher = page.getByRole("button", { name: "Qadam Cloud Workflow SaaS", exact: true });
    await launcher.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(launcher).toBeFocused();
    await page.goto(`/demo/${route}?${route === "companies" ? "company=qadam-cloud" : "lead=lead-qadam-cloud"}`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: route === "companies" ? "Search companies" : "Search leads", exact: true })).toBeFocused();
  }
  await page.goto("/demo/workflows/kazakhstan-fintech");
  const planningStage = page.getByRole("button", { name: "Planning Complete", exact: true });
  await planningStage.press("Enter");
  await expect(planningStage).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Collapse stage details", exact: true }).press("Enter");
  await expect(planningStage).toBeFocused();
  await page.goto("/demo/activity");
  await page.getByRole("combobox", { name: "Filter activity by workflow", exact: true }).selectOption("kazakhstan-fintech");
  await expect(page).toHaveURL(/\/demo\/activity\?workflow=kazakhstan-fintech/);
  await page.getByRole("tab", { name: "Errors 0", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No events in this view", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show all events", exact: true }).click();
  await expect(page.getByRole("tab", { name: "All events 9", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("link", { name: "Leads", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/leads$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search leads", exact: true }).fill("no matching sample");
  await expect(page.getByRole("heading", { name: "No leads in this view", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(page.getByRole("button", { name: /Qadam Cloud.*90/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
});

test("keyboard search, drawers, local creation, approval persistence and reset stay safe", async ({ page }) => {
  const externalMutations: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST" || new URL(request.url()).pathname.startsWith("/api/")) externalMutations.push(request.url()); });
  await page.goto("/demo/dashboard");
  await page.getByRole("button", { name: "Search workspace", exact: true }).click();
  await page.getByRole("textbox", { name: "Search pages, workflows and companies" }).fill("Qadam");
  await page.getByRole("textbox", { name: "Search pages, workflows and companies" }).press("ArrowDown");
  await page.getByRole("button", { name: /Qadam Cloud.*Company/ }).press("Enter");
  await expect(page).toHaveURL(/\/demo\/companies\?company=qadam-cloud/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "docs/screenshots/company.png", fullPage: true, animations: "disabled" });
  await page.getByRole("dialog").press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/demo/onboarding");
  await page.getByRole("button", { name: "Create a local draft", exact: true }).click();
  await page.getByRole("button", { name: "Create workflow", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/workflows\/demo-/);
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.goto("/demo/approvals");
  await expect(page.getByText("Review 2 sample outreach drafts", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await page.getByRole("textbox", { name: "Subject", exact: true }).fill("Local edit to reset");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Local edit to reset", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "An operations idea for Qadam Cloud", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate approval (2)", exact: true }).click();
  await page.getByRole("button", { name: "Confirm approval", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 drafts approved" })).toBeVisible();
  await page.getByRole("tab", { name: /Decisions/ }).click();
  await page.getByRole("button", { name: /Review 2 sample outreach drafts/ }).click();
  await expect(page.getByText("Decision saved locally", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Decisions/ }).click();
  await page.getByRole("button", { name: /Review 2 sample outreach drafts/ }).click();
  await expect(page.getByText("Decision saved locally", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("tab", { name: /Pending/ }).click();
  await expect(page.getByRole("button", { name: "Simulate approval (2)", exact: true })).toBeVisible();
  expect(externalMutations).toEqual([]);
});

test("dark theme, reduced motion, missing records and unknown routes retain navigation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("agentic-ops-theme", "system"));
  await page.goto("/demo/workflows/kazakhstan-fintech");
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await page.evaluate(() => [...document.getAnimations()].filter((animation) => animation.playState === "running").length)).toBe(0);
  await page.goto("/demo/workflows/missing");
  await expect(page.getByRole("heading", { name: /not found|isn’t here|not available/i })).toBeVisible();
  await page.goto("/demo/unknown");
  await expect(page.getByRole("heading", { name: "This record isn’t here." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore the safe demo" })).toBeVisible();
});
