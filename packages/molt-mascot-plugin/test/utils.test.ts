import { describe, expect, it } from "bun:test";
import { cleanErrorString, truncate, coerceNumber, summarizeToolResultMessage } from "../src/index.ts";

describe("utils", () => {
  it("coerceNumber", () => {
    expect(coerceNumber(10, 5)).toBe(10);
    expect(coerceNumber("10", 5)).toBe(10);
    expect(coerceNumber("abc", 5)).toBe(5);
    expect(coerceNumber(undefined, 5)).toBe(5);
  });

  it("truncate", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello world", 5)).toBe("hell…"); // 5-1=4 -> hell…
    // Space aware truncation
    expect(truncate("hello world", 9)).toBe("hello…"); 
    // "hello world" (11). limit 9. cut=8. "hello wo" -> lastSpace=5 -> "hello" -> "hello…"
  });

  it("cleanErrorString", () => {
    expect(cleanErrorString("Error: foo")).toBe("foo");
    expect(cleanErrorString("Tool failed: Error: foo")).toBe("foo");
    expect(cleanErrorString("Command failed: foo")).toBe("foo");
    expect(cleanErrorString("GitError: fatal: branch not found")).toBe("branch not found");
    expect(cleanErrorString("sh: foo: command not found")).toBe("foo: command not found");
    // Strip ANSI
    expect(cleanErrorString("\u001b[31mError:\u001b[0m foo")).toBe("foo");
    // Exit code handling
    expect(cleanErrorString("Command exited with code 1\nDetails here")).toBe("Details here");
    // Custom error types
    expect(cleanErrorString("MoltError: Connection lost")).toBe("Connection lost");
  });

  it("summarizeToolResultMessage", () => {
    expect(summarizeToolResultMessage("hello")).toBe("hello");
    expect(summarizeToolResultMessage({ result: "done" })).toBe("done");
    
    // Priorities
    expect(summarizeToolResultMessage({ error: "fail", result: "ok" })).toBe("fail");
    expect(summarizeToolResultMessage({ stderr: "bad", stdout: "good" })).toBe("bad");
    
    // Complex objects
    expect(summarizeToolResultMessage({ error: { message: "nested" } })).toBe("nested");
    
    // Exit codes
    expect(summarizeToolResultMessage({ exitCode: 127 })).toBe("exit code 127");
    
    // Cleaning
    expect(summarizeToolResultMessage({ error: "Error: something" })).toBe("something");
  });
});
