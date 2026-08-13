import { describe, it, expect } from "vitest";
import { parsePatch } from "./diff";

describe("parsePatch", () => {
  it("returns [] for null or undefined patch", () => {
    expect(parsePatch(null)).toEqual([]);
    expect(parsePatch(undefined)).toEqual([]);
  });

  it("returns [] for an empty patch", () => {
    expect(parsePatch("")).toEqual([]);
  });

  it("numbers add/del/context lines from the hunk header", () => {
    const patch = ["@@ -1,2 +1,3 @@", " ctx", "-gone", "+added", " tail"].join("\n");
    const lines = parsePatch(patch);

    expect(lines.map((l) => l.kind)).toEqual(["hunk", "ctx", "del", "add", "ctx"]);
    // context row starts at old 1 / new 1
    expect(lines[1]).toMatchObject({ kind: "ctx", text: "ctx", oldNo: 1, newNo: 1 });
    // deletion advances only the old counter
    expect(lines[2]).toMatchObject({ kind: "del", text: "gone", oldNo: 2 });
    // addition advances only the new counter
    expect(lines[3]).toMatchObject({ kind: "add", text: "added", newNo: 2 });
    // trailing context: old advanced past the del, new past the add
    expect(lines[4]).toMatchObject({ kind: "ctx", text: "tail", oldNo: 3, newNo: 3 });
  });

  it("resets numbering at each hunk header across multiple hunks", () => {
    const patch = [
      "@@ -10,1 +10,2 @@",
      " a",
      "+b",
      "@@ -50,1 +51,1 @@",
      "-x",
      "+y",
    ].join("\n");
    const lines = parsePatch(patch);

    const firstCtx = lines.find((l) => l.text === "a");
    expect(firstCtx).toMatchObject({ oldNo: 10, newNo: 10 });
    const firstAdd = lines.find((l) => l.text === "b");
    expect(firstAdd).toMatchObject({ newNo: 11 });

    // second hunk restarts from its own header
    const secondDel = lines.find((l) => l.text === "x");
    expect(secondDel).toMatchObject({ oldNo: 50 });
    const secondAdd = lines.find((l) => l.text === "y");
    expect(secondAdd).toMatchObject({ newNo: 51 });
  });

  it("treats a context line without a leading space as context", () => {
    const patch = ["@@ -1,1 +1,1 @@", "bare"].join("\n");
    const [, ctx] = parsePatch(patch);
    expect(ctx).toMatchObject({ kind: "ctx", text: "bare", oldNo: 1, newNo: 1 });
  });
});
