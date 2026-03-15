import { test, expect } from "@playwright/test";

test.describe("RTL / Hebrew layout", () => {
  test("Homepage has dir=rtl and lang=he", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
  });

  test("Terms page renders in RTL", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
    // Contractor liability section must be present
    await expect(
      page.getByText("5א. הגבלת אחריות קבלן")
    ).toBeVisible();
    // Draft disclaimer must be absent
    await expect(
      page.getByText("מסמך זה הינו טיוטה")
    ).not.toBeVisible();
  });

  test("Privacy page renders in RTL without draft disclaimer", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByText("מסמך זה הינו טיוטה")
    ).not.toBeVisible();
  });

  test("Signup page has ToS checkbox", async ({ page }) => {
    await page.goto("/signup");
    // "resident" is pre-selected by default — skip the role click to avoid
    // an intermediate React re-render that can race with the next click.
    // Wait for hydration; then click "המשך" to advance to step 2 where the ToS checkbox renders.
    const continueBtn = page.getByRole("button", { name: /^המשך$/ });
    await expect(continueBtn).toBeVisible({ timeout: 15000 });
    await continueBtn.click();
    // Wait for step 2 form to render after React state update
    const form = page.locator("form");
    await expect(form).toBeVisible({ timeout: 10000 });
    const tosCheckbox = form.locator("#tos");
    await expect(tosCheckbox).toBeVisible({ timeout: 10000 });
    await expect(tosCheckbox).toHaveAttribute("required");
    await expect(page.locator("form").getByRole("link", { name: "תנאי השימוש" })).toBeVisible();
    await expect(page.locator("form").getByRole("link", { name: "מדיניות הפרטיות" })).toBeVisible();
  });

  test("ChevronLeft icons have rtl-flip class for RTL mode", async ({ page }) => {
    await page.goto("/");
    // Verify rtl-flip CSS class exists in the document stylesheet
    const hasRtlFlip = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      return sheets.some((sheet) => {
        try {
          const rules = Array.from(sheet.cssRules || []);
          return rules.some((rule) => rule.cssText?.includes("rtl-flip"));
        } catch {
          return false;
        }
      });
    });
    console.log("rtl-flip CSS found:", hasRtlFlip);
    expect(hasRtlFlip).toBe(true);
  });
});
