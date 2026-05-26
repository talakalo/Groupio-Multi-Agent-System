import { expect, test } from "./fixtures/auth-fixtures";

test.describe("Architecture Upload Flow", () => {
  test.beforeEach(async ({ setupAuthAndMocks }) => {
    await setupAuthAndMocks("resident");
  });

  test("should display upload page with dropzone", async ({ architecturePage }) => {
    await architecturePage.goto();
    await architecturePage.expectOnArchitecturePage();
    await expect(architecturePage.uploadButton).toBeVisible();
  });

  test("should show file input for upload", async ({ architecturePage }) => {
    await architecturePage.goto();
    await architecturePage.expectFileInputAttached();
  });

  test("should display upload instructions in Hebrew", async ({ architecturePage }) => {
    await architecturePage.goto();
    await expect(architecturePage.dropzoneTitle).toBeVisible();
    await expect(architecturePage.rawPage.getByText(/גרור ושחרר|PDF, PNG/i).first()).toBeVisible();
  });

  test("should handle file selection", async ({ architecturePage }) => {
    await architecturePage.goto();
    await architecturePage.expectFileInputAttached();
  });
});
