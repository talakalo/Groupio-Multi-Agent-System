/**
 * CustomReporter — JSON report for admin E2E suite.
 * Output: playwright-report/report.json
 */

import fs from "node:fs";
import path from "node:path";
import type {
  Reporter,
  Suite,
  TestCase,
  TestResult,
  FullConfig,
  FullResult,
} from "@playwright/test/reporter";

interface TestRecord {
  title: string;
  file: string;
  status: "passed" | "failed" | "skipped" | "timedOut" | "interrupted";
  duration: number;
  retry: number;
  errors: string[];
  startedAt: string;
}

interface JsonReport {
  schemaVersion: 1;
  project: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: FullResult["status"];
  totals: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  tests: TestRecord[];
}

export default class CustomReporter implements Reporter {
  private readonly outputFile: string;
  private startedAt!: string;
  private readonly tests: TestRecord[] = [];

  constructor(options: { outputFile?: string } = {}) {
    this.outputFile = options.outputFile ?? "playwright-report/report.json";
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startedAt = new Date().toISOString();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.tests.push({
      title: test.titlePath().join(" > "),
      file: path.relative(process.cwd(), test.location.file),
      status: result.status,
      duration: result.duration,
      retry: result.retry,
      errors: result.errors.map((e) => e.message ?? String(e)),
      startedAt: new Date(result.startTime).toISOString(),
    });
  }

  onEnd(result: FullResult): void {
    const finishedAt = new Date().toISOString();
    const report: JsonReport = {
      schemaVersion: 1,
      project: "groupio-admin",
      startedAt: this.startedAt,
      finishedAt,
      durationMs: new Date(finishedAt).getTime() - new Date(this.startedAt).getTime(),
      status: result.status,
      totals: {
        total: this.tests.length,
        passed: this.tests.filter((t) => t.status === "passed").length,
        failed: this.tests.filter((t) => t.status === "failed").length,
        skipped: this.tests.filter((t) => t.status === "skipped").length,
      },
      tests: this.tests,
    };

    const dir = path.dirname(this.outputFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.outputFile, JSON.stringify(report, null, 2), "utf-8");
    console.log(`\n[CustomReporter] JSON report → ${this.outputFile}`);
  }
}
