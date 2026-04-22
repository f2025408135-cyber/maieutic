import { test, expect } from "@playwright/test";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Happy-path demo regression test — automates Scene 1 (authoring) and a
// compressed Scene 2 (student writes a spec that closes in one round, then
// submits code with a classic drift, then answers the Phase 4 question
// with "I forgot"). Verifies that the flow lands the student on Phase 5
// without errors.
//
// Hits real Opus at 5 points: scaffolding, spec examiner (×1), intent-diff,
// post-hoc. Expect ~60–90 s.
//
// Skipped entirely when ANTHROPIC_API_KEY is absent.

const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;

test.describe("demo happy path", () => {
  test.skip(!HAS_KEY, "ANTHROPIC_API_KEY not set");

  test("author an exercise, student completes it with drift, reaches Phase 5", async ({
    page,
  }) => {
    // ── Scene 1: author ──────────────────────────────────────────────
    await page.goto("/authoring");
    await expect(page.getByRole("heading", { name: /authoring/i })).toBeVisible();

    const uniqueTitle = `Count vowels — e2e ${Date.now()}`;
    await page.getByPlaceholder(/count vowels/i).fill(uniqueTitle);
    await page
      .getByPlaceholder(/counts vowels/i)
      .fill("Write a function that counts vowels in a string.");

    await page.getByRole("button", { name: /generate scaffolding/i }).click();

    // Scaffolding can take up to ~20s. Wait for dimensions to appear.
    await expect(
      page.getByText(/Spec-gate dimensions/i),
    ).toBeVisible({ timeout: 40_000 });

    // The publish button is enabled once the instructor has reviewed.
    await page
      .getByLabel(/I've reviewed the scaffolding/i)
      .check();
    await page.getByRole("button", { name: /^publish exercise$/i }).click();

    // Wait for the published confirmation and capture the exercise slug.
    const publishedNote = page.getByText(/Published as/);
    await expect(publishedNote).toBeVisible({ timeout: 30_000 });
    const href = await page
      .getByRole("link", { name: /^\/exercise\// })
      .getAttribute("href");
    expect(href).toBeTruthy();

    // ── Scene 2: student flow ─────────────────────────────────────────
    await page.goto(href!);

    // Phase 1 — submit a complete spec in one round.
    const spec = `The function takes a string and returns the count of vowels. Both lowercase a,e,i,o,u AND uppercase A,E,I,O,U are counted. 'y' is NOT a vowel. An empty string returns 0.`;
    await page.getByPlaceholder(/takes a string and returns/i).fill(spec);
    await page.getByRole("button", { name: /submit spec for review/i }).click();

    // Wait for Phase 3 — the Monaco editor becomes editable.
    await expect(page.getByText(/submit for review/i)).toBeVisible({
      timeout: 45_000,
    });

    // Type the lowercase-only code into Monaco. Monaco focus is needed.
    const droppedCode = [
      "def count_vowels(s):",
      "    count = 0",
      "    for c in s:",
      "        if c in 'aeiou':",
      "            count = count + 1",
      "    return count",
    ].join("\n");
    await page.locator(".monaco-editor").first().click();
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+A" : "Control+A",
    );
    await page.keyboard.press("Backspace");
    await page.keyboard.type(droppedCode);

    // Submit final code.
    await page.getByRole("button", { name: /submit for review/i }).click();

    // Wait for Phase 4 — divergence question appears.
    await expect(page.getByText(/Opus asks/i)).toBeVisible({ timeout: 60_000 });

    // Answer every divergence with the same "I forgot" answer and click the
    // primary button (labelled either "Next" or "Submit and finish" depending
    // on whether it's the last one). Cap at a reasonable number so a runaway
    // classifier doesn't hang the test.
    for (let step = 0; step < 8; step++) {
      const textarea = page.getByPlaceholder(
        /answering.*i don.?t know.*is valid/i,
      );
      if (!(await textarea.isVisible().catch(() => false))) break;
      await textarea.fill("I forgot about the capital letters.");
      const submitFinish = page.getByRole("button", {
        name: /submit and finish/i,
      });
      const next = page.getByRole("button", { name: /^next$/i });
      if (await submitFinish.isVisible().catch(() => false)) {
        await submitFinish.click();
        break;
      }
      await next.click();
      // Wait for post-hoc to settle and the next question to render.
      await page.waitForTimeout(4_000);
    }

    // Phase 5 — session complete.
    await expect(page.getByText(/session complete/i)).toBeVisible({
      timeout: 60_000,
    });
  });
});
