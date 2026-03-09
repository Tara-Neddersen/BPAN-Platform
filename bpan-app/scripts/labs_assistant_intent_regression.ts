import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { routeLabsAssistantIntent, type LabsAssistantIntent } from "@/lib/labs-assistant/intent-router";

type FixtureRow = {
  question: string;
  expectedIntent: LabsAssistantIntent;
};

async function main() {
  const fixturePath = path.join(
    process.cwd(),
    "src",
    "app",
    "api",
    "labs",
    "assistant",
    "__fixtures__",
    "intent-regression.json",
  );
  const raw = await readFile(fixturePath, "utf8");
  const fixture = JSON.parse(raw) as FixtureRow[];
  if (!Array.isArray(fixture) || fixture.length === 0) {
    throw new Error("No fixtures found for labs assistant intent regression.");
  }

  const failures: Array<{ question: string; expected: LabsAssistantIntent; actual: LabsAssistantIntent }> = [];
  for (const row of fixture) {
    const actual = routeLabsAssistantIntent(row.question);
    if (actual !== row.expectedIntent) {
      failures.push({
        question: row.question,
        expected: row.expectedIntent,
        actual,
      });
    }
  }

  if (failures.length > 0) {
    console.error(`Intent regression failed: ${failures.length}/${fixture.length} mismatches`);
    for (const item of failures) {
      console.error(`- Q: ${item.question}`);
      console.error(`  expected=${item.expected} actual=${item.actual}`);
    }
    process.exit(1);
  }

  console.log(`Intent regression passed: ${fixture.length}/${fixture.length}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Intent regression failed: ${message}`);
  process.exit(1);
});
