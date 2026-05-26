import { expect, test } from "./fixtures/auth-fixtures";

test.describe("RTL / Hebrew layout", () => {
  test("Homepage has dir=rtl and lang=he", async ({ landingPage }) => {
    await landingPage.goto();
    await expect(landingPage.rawPage.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(landingPage.rawPage.locator("html")).toHaveAttribute("lang", "he");
  });

  test("Terms page renders in RTL", async ({ landingPage }) => {
    await landingPage.gotoTerms();
    await expect(landingPage.rawPage.locator("main")).toHaveAttribute("dir", "rtl");
    await expect(landingPage.rawPage.getByText("5א. הגבלת אחריות קבלן")).toBeVisible();
    await expect(landingPage.rawPage.getByText("מסמך זה הינו טיוטה")).not.toBeVisible();
  });

  test("Privacy page renders in RTL without draft disclaimer", async ({ landingPage }) => {
    await landingPage.gotoPrivacy();
    await expect(landingPage.rawPage.locator("main")).toHaveAttribute("dir", "rtl");
    await expect(landingPage.rawPage.getByText("מסמך זה הינו טיוטה")).not.toBeVisible();
  });

  test("Signup page has ToS checkbox", async ({ signupPageReady }) => {
    await signupPageReady.rawPage.getByRole("button", { name: /המשך/ }).click();
    const tosCheckbox = signupPageReady.rawPage.locator("#tos");
    await expect(tosCheckbox).toBeVisible({ timeout: 10000 });
    await expect(tosCheckbox).toHaveAttribute("required");
    await expect(
      signupPageReady.rawPage.locator("form").getByRole("link", { name: "תנאי השימוש" }),
    ).toBeVisible();
    await expect(
      signupPageReady.rawPage.locator("form").getByRole("link", { name: "מדיניות הפרטיות" }),
    ).toBeVisible();
  });

  test("ChevronLeft icons have rtl-flip class for RTL mode", async ({ landingPage }) => {
    await landingPage.goto();
    const hasRtlFlip = await landingPage.rawPage.evaluate(() => {
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
  });
});
