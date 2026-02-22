import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { createPrefsManager } from "../src/prefs.cjs";
import fs from "fs";
import path from "path";
import os from "os";

describe("createPrefsManager", () => {
  let tmpDir;
  let prefsPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "molt-prefs-test-"));
    prefsPath = path.join(tmpDir, "preferences.json");
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  });

  it("load returns empty object when file does not exist", () => {
    const mgr = createPrefsManager(prefsPath);
    expect(mgr.load()).toEqual({});
  });

  it("load returns parsed JSON when file exists", () => {
    fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "top-left" }));
    const mgr = createPrefsManager(prefsPath);
    expect(mgr.load()).toEqual({ alignment: "top-left" });
  });

  it("load returns empty object for invalid JSON", () => {
    fs.writeFileSync(prefsPath, "not json");
    const mgr = createPrefsManager(prefsPath);
    expect(mgr.load()).toEqual({});
  });

  it("save + flush writes merged preferences to disk", () => {
    const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
    mgr.save({ alignment: "bottom-left" });
    mgr.flush();
    const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    expect(data).toEqual({ alignment: "bottom-left" });
  });

  it("save merges with existing preferences", () => {
    fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "top-left", sizeIndex: 2 }));
    const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
    mgr.save({ alignment: "bottom-right" });
    mgr.flush();
    const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    expect(data).toEqual({ alignment: "bottom-right", sizeIndex: 2 });
  });

  it("multiple saves before flush are batched", () => {
    const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
    mgr.save({ alignment: "top-left" });
    mgr.save({ sizeIndex: 3 });
    mgr.save({ opacityIndex: 1 });
    mgr.flush();
    const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    expect(data).toEqual({ alignment: "top-left", sizeIndex: 3, opacityIndex: 1 });
  });

  it("later save patches override earlier ones", () => {
    const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
    mgr.save({ alignment: "top-left" });
    mgr.save({ alignment: "center" });
    mgr.flush();
    const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    expect(data.alignment).toBe("center");
  });

  it("flush is a no-op when nothing is pending", () => {
    const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
    mgr.flush();
    expect(fs.existsSync(prefsPath)).toBe(false);
  });

  it("debounced save auto-flushes after debounceMs", async () => {
    const mgr = createPrefsManager(prefsPath, { debounceMs: 30 });
    mgr.save({ alignment: "top-right" });
    // File should not exist yet (debounce hasn't fired)
    expect(fs.existsSync(prefsPath)).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    expect(data).toEqual({ alignment: "top-right" });
  });

  it("creates parent directories if needed", () => {
    const nestedPath = path.join(tmpDir, "a", "b", "preferences.json");
    const mgr = createPrefsManager(nestedPath, { debounceMs: 10000 });
    mgr.save({ test: true });
    mgr.flush();
    const data = JSON.parse(fs.readFileSync(nestedPath, "utf8"));
    expect(data).toEqual({ test: true });
  });

  it("exposes filePath for diagnostics", () => {
    const mgr = createPrefsManager(prefsPath);
    expect(mgr.filePath).toBe(prefsPath);
  });

  it("flush after flush is idempotent", () => {
    const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
    mgr.save({ x: 1 });
    mgr.flush();
    mgr.flush(); // second flush should be a no-op
    const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    expect(data).toEqual({ x: 1 });
  });
});
