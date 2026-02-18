# E2E test results – upload and view

## How results are uploaded in CI

When the **E2E Tests** job runs (on `main` and `dev`), it does two things:

1. **Upload artifact (Playwright HTML report)**  
   - **Artifact name:** `playwright-report`  
   - **Path:** `apps/web/playwright-report/`  
   - **Retention:** 7 days  

2. **Publish test summary (JUnit)**  
   - Playwright writes **JUnit XML** to `apps/web/playwright-report/junit-e2e.xml`.  
   - The **EnricoMi/publish-unit-test-result-action** step publishes that file so you get a **check run** on the commit with a pass/fail summary (and failed test list when applicable).

## How to view / download

### 1. Download the HTML report (screenshots, traces, UI)

1. Open the workflow run: **Actions** → select the run (e.g. “CI” or “E2E Tests”).  
2. Scroll to the **Artifacts** section at the bottom.  
3. Download **playwright-report**.  
4. Unzip and open **`index.html`** in a browser.  
   - You get the full Playwright report: passed/failed tests, traces, screenshots, and timeouts.

### 2. View the test summary on the commit

- On the **commit page**, open the **Checks** tab.  
- Open the **E2E Tests** (or **CI**) check.  
- The **E2E Test Results** step (or check run) shows a short summary: how many tests passed/failed and which ones failed (from the JUnit XML).

### 3. Run E2E locally and open the report

```bash
cd apps/web
pnpm exec playwright test --project=chromium
pnpm exec playwright show-report
```

This opens the HTML report for the last run in your browser.

## Configuration (what was added)

- **`apps/web/playwright.config.ts`**  
  - Reporters: **html** (to `playwright-report/`) and **junit** (to `playwright-report/junit-e2e.xml`).

- **`.github/workflows/ci.yml`**  
  - **Upload artifact:** `playwright-report` from `apps/web/playwright-report/`.  
  - **Publish test results:** `EnricoMi/publish-unit-test-result-action@v2` with `files: apps/web/playwright-report/junit-e2e.xml` and `check_name: E2E Test Results`.

So: **upload** is done by the workflow (artifact + JUnit publish). You **view** by downloading the artifact and opening `index.html`, and by checking the “E2E Test Results” summary on the commit.
