import { describe, it, expect } from "vitest";
import { approxTokens } from "./tokens";

describe("approxTokens", () => {
  it("estimates chars/4, rounded up", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens("a")).toBe(1);
    expect(approxTokens("abcd")).toBe(1);
    expect(approxTokens("abcde")).toBe(2);
    expect(approxTokens("a".repeat(400))).toBe(100);
  });
});
