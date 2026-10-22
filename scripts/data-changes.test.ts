import { describe, expect, test } from "bun:test";

import { buildReport, diffTable, needsReview, REVIEW_MARK, renderReport } from "./data-changes.ts";

describe("diffTable", () => {
  test("ignores the header and the order", () => {
    const d = diffTable("data/processed/x/a.csv", "anio,mes,v\n2026,1,a\n2026,2,b\n", "anio,mes,v\n2026,2,b\n2026,1,a\n");
    expect(d).toMatchObject({ before: 2, after: 2, added: 0, changed: 0, removed: 0 });
  });

  test("a row that comes back with the same key was corrected, not deleted", () => {
    const d = diffTable(
      "data/processed/x/a.csv",
      "anio,mes,v\n2026,9,a\n2026,10,b\n2026,8,c\n",
      "anio,mes,v\n2026,9,a\n2026,10,B\n2026,11,d\n",
    );
    expect(d).toMatchObject({ before: 3, after: 3, added: 1, changed: 1, removed: 1 });
  });

  test("reads quoted key fields", () => {
    const d = diffTable("data/processed/x/a.csv", 'a,b,v\n"x, y",1,a\n', 'a,b,v\n"x, y",1,b\n');
    expect(d).toMatchObject({ changed: 1, removed: 0 });
  });
});

describe("buildReport", () => {
  const files: Record<string, { base: string; index: string }> = {
    "data/processed/x/a.csv": { base: "id\n1\n2\n", index: "id\n1\n2\n3\n" },
    "data/raw/x/manifest.jsonl": { base: '{"a":1}\n', index: '{"a":1}\n{"b":2}\n' },
    "data/raw/y/manifest.jsonl": { base: '{"a":1}\n', index: '{"c":3}\n' },
  };
  const read = (rev: "base" | "index", path: string) => files[path]?.[rev] ?? "";

  test("new rows and appended logs need no review", () => {
    const r = buildReport(
      [
        { status: "M", path: "data/processed/x/a.csv" },
        { status: "M", path: "data/raw/x/manifest.jsonl" },
        { status: "A", path: "data/raw/x/2026-10-22/a.json" },
      ],
      read,
    );
    expect(needsReview(r)).toBe(false);
    expect(renderReport(r, "origin/dev")).not.toContain(REVIEW_MARK);
  });

  test("flags deleted files, touched raw files and rewritten logs", () => {
    const r = buildReport(
      [
        { status: "D", path: "data/processed/x/b.csv" },
        { status: "M", path: "data/raw/x/2026-10-12/a.json" },
        { status: "M", path: "data/raw/y/manifest.jsonl" },
      ],
      read,
    );
    expect(r.deleted).toEqual(["data/processed/x/b.csv"]);
    expect(r.rawTouched).toEqual(["data/raw/x/2026-10-12/a.json"]);
    expect(r.logsRewritten).toEqual(["data/raw/y/manifest.jsonl"]);
    expect(renderReport(r, "origin/dev")).toContain(REVIEW_MARK);
  });
});
