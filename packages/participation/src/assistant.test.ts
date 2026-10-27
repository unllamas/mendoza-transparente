import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { assistantFeedback, assistantFeedbackNote, assistantGaps } from "./assistant.ts";
import type { Db } from "./db.ts";
import { localDb } from "./local-db.ts";
import { handlePanel } from "./panel-api.ts";
import { auditLog } from "./store.ts";

let db: Db;
beforeEach(() => {
  db = localDb(new Database(":memory:") as never);
});

const vote = (
  at: string,
  v: "up" | "down",
  reason: string | null = null,
  flow: string | null = null,
  municipality: string | null = null,
  note: string | null = null,
) =>
  db
    .prepare("INSERT INTO assistant_feedback (created_at, vote, reason, note, flow, municipality) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(at, v, reason, note, flow, municipality)
    .run();
const gap = (at: string, kind: string, municipality: string | null, value: string) =>
  db
    .prepare("INSERT INTO assistant_gaps (created_at, kind, municipality, value) VALUES (?, ?, ?, ?)")
    .bind(at, kind, municipality, value)
    .run();

const panel = (path: string) =>
  handlePanel(new Request(`https://panel.example.com${path}`), db, { email: "equipo@example.com" }) as Promise<Response>;

describe("assistant feedback", () => {
  test("counts votes, groups the thumbs down and never puts a note in the list", async () => {
    await vote("2026-10-01T10:00:00Z", "up", null, "abrir-un-comercio", "Godoy Cruz");
    await vote("2026-10-02T10:00:00Z", "down", "dato", "abrir-un-comercio", "Godoy Cruz", "Mi DNI es 30.123.456");
    await vote("2026-10-03T10:00:00Z", "down", "dato", "tasa-de-comercio", "Luján de Cuyo");
    await vote("2026-10-04T10:00:00Z", "down", "falta", "tasa-de-comercio", "Godoy Cruz");
    const f = await assistantFeedback(db);
    expect([f.up, f.down]).toEqual([1, 3]);
    expect(f.byReason).toEqual([
      { key: "dato", n: 2 },
      { key: "falta", n: 1 },
    ]);
    expect(f.byFlow.find((r) => r.key === "tasa-de-comercio")?.n).toBe(2);
    expect(f.byMunicipality[0]).toEqual({ key: "Godoy Cruz", n: 2 });
    expect(f.recent.map((v) => v.id)).toEqual([4, 3, 2, 1]);
    expect(f.recent.find((v) => v.id === 2)?.hasNote).toBe(true);
    expect(f.recent.find((v) => v.id === 3)?.hasNote).toBe(false);
    expect(JSON.stringify(f)).not.toContain("30.123.456");
    expect(f.recent.every((v) => !("note" in v))).toBe(true);
  });

  test("the list keeps only the last 50 votes and an empty table gives zeros", async () => {
    expect(await assistantFeedback(db)).toMatchObject({ up: 0, down: 0, recent: [] });
    for (let i = 0; i < 55; i++) await vote(`2026-10-01T10:00:${String(i).padStart(2, "0")}Z`, "up");
    const f = await assistantFeedback(db);
    expect(f.up).toBe(55);
    expect(f.recent).toHaveLength(50);
  });

  test("the note is read one vote at a time, and the panel audits that read", async () => {
    await vote("2026-10-02T10:00:00Z", "down", "dato", null, null, "Me llamo Ana");
    await vote("2026-10-03T10:00:00Z", "up");
    expect((await assistantFeedbackNote(db, 1))?.note).toBe("Me llamo Ana");
    expect(await assistantFeedbackNote(db, 99)).toBeNull();

    const list = await panel("/api/panel/assistant");
    expect(list.status).toBe(200);
    expect(await list.text()).not.toContain("Me llamo Ana");
    expect(await auditLog(db)).toHaveLength(0);

    const read = await panel("/api/panel/assistant/votes/1");
    expect(((await read.json()) as { note: string }).note).toBe("Me llamo Ana");
    const entries = await auditLog(db);
    expect(entries.map((e) => e.action)).toEqual(["assistant.note.read"]);
    expect(entries[0]?.detail).toEqual({ voteId: 1 });
    expect(JSON.stringify(entries)).not.toContain("Ana");

    expect((await panel("/api/panel/assistant/votes/99")).status).toBe(404);
  });
});

describe("assistant gaps", () => {
  test("groups by kind, municipality and value, most asked first, with the last date", async () => {
    await gap("2026-10-01T10:00:00Z", "rubro", "Godoy Cruz", "panaderia");
    await gap("2026-10-03T10:00:00Z", "rubro", "Godoy Cruz", "panaderia");
    await gap("2026-10-02T10:00:00Z", "rubro", "Maipú", "panaderia");
    await gap("2026-10-04T10:00:00Z", "tramite", null, "sacar-licencia-de-conducir");
    await gap("2026-10-05T10:00:00Z", "tramite", null, "sacar-licencia-de-conducir");
    await gap("2026-10-06T10:00:00Z", "tramite", null, "sacar-licencia-de-conducir");
    const gaps = await assistantGaps(db);
    expect(gaps).toEqual([
      { kind: "tramite", municipality: null, value: "sacar-licencia-de-conducir", n: 3, lastAt: "2026-10-06T10:00:00Z" },
      { kind: "rubro", municipality: "Godoy Cruz", value: "panaderia", n: 2, lastAt: "2026-10-03T10:00:00Z" },
      { kind: "rubro", municipality: "Maipú", value: "panaderia", n: 1, lastAt: "2026-10-02T10:00:00Z" },
    ]);
    const r = await panel("/api/panel/assistant");
    expect(((await r.json()) as { gaps: unknown[] }).gaps).toHaveLength(3);
  });
});
