import { describe, expect, it } from "bun:test";
import { cleanErrorString, truncate, coerceNumber } from "../src/index.ts";

describe("utils", () => {
  it("coerceNumber", () => {
    expect(coerceNumber(10, 5)).toBe(10);
    expect(coerceNumber("10", 5)).toBe(10);
    expect(coerceNumber("abc", 5)).toBe(5);
    expect(coerceNumber(undefined, 5)).toBe(5);
  });

  it("truncate", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello world", 5)).toBe("he..."); // 5-3=2 -> he...
    // Space aware truncation
    expect(truncate("hello world", 9)).toBe("hello..."); 
    // "hello world" (11). limit 9. cut=6. "hello "
  });

  it("cleanErrorString", () => {
    expect(cleanErrorString("Error: foo")).toBe("foo");
    expect(cleanErrorString("Tool failed: Error: foo")).toBe("foo");
    expect(cleanErrorString("Command failed: foo")).toBe("foo");
    expect(cleanErrorString("GitError: fatal: branch not found")).toBe("branch not found");
    // Strip ANSI
    expect(cleanErrorString("\u001b[31mError:\u001b[0m foo")).toBe("foo");
    // Exit code handling
    expect(cleanErrorString("Command exited with code 1\nDetails here")).toBe("Details here");
  });
});
