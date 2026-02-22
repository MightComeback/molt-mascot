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

  it("remove deletes a single key from preferences", () => {
    fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "top-left", sizeIndex: 2 }));
    const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
    mgr.remove("alignment");
    mgr.flush();
    const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    expect(data).toEqual({ sizeIndex: 2 });
  });

  it("remove deletes multiple keys at once", () => {
    fs.writeFileSync(prefsPath, JSON.stringify({ a: 1, b: 2, c: 3 }));
    const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
    mgr.remove("a", "c");
    mgr.flush();
    const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    expect(data).toEqual({ b: 2 });
  });

  it("remove is a no-op for nonexistent keys", () => {
    fs.writeFileSync(prefsPath, JSON.stringify({ x: 1 }));
    const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
    mgr.remove("nonexistent");
    mgr.flush();
    const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    expect(data).toEqual({ x: 1 });
  });

  it("remove with no arguments is a no-op", () => {
    const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
    mgr.remove();
    mgr.flush();
    expect(fs.existsSync(prefsPath)).toBe(false);
  });

  it("remove batches with pending save", () => {
    const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
    mgr.save({ a: 1, b: 2, c: 3 });
    mgr.remove("b");
    mgr.flush();
    const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    expect(data).toEqual({ a: 1, c: 3 });
  });

  it("save after remove re-adds the key", () => {
    fs.writeFileSync(prefsPath, JSON.stringify({ a: 1, b: 2 }));
    const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
    mgr.remove("a");
    mgr.save({ a: 99 });
    mgr.flush();
    const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    expect(data).toEqual({ a: 99, b: 2 });
  });

  describe("clear", () => {
    it("deletes existing preferences file and returns true", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "top-left" }));
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.clear()).toBe(true);
      expect(fs.existsSync(prefsPath)).toBe(false);
    });

    it("returns false when file does not exist", () => {
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.clear()).toBe(false);
    });

    it("cancels pending debounced writes", async () => {
      const mgr = createPrefsManager(prefsPath, { debounceMs: 50 });
      mgr.save({ alignment: "center" });
      mgr.clear();
      // Wait longer than debounce — file should not reappear
      await new Promise((r) => setTimeout(r, 100));
      expect(fs.existsSync(prefsPath)).toBe(false);
    });

    it("load returns empty object after clear", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ x: 1 }));
      const mgr = createPrefsManager(prefsPath);
      mgr.clear();
      expect(mgr.load()).toEqual({});
    });

    it("save works normally after clear", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ old: true }));
      const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
      mgr.clear();
      mgr.save({ fresh: true });
      mgr.flush();
      const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
      expect(data).toEqual({ fresh: true });
    });
  });

  describe("has", () => {
    it("returns false when file does not exist", () => {
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.has("alignment")).toBe(false);
    });

    it("returns true for a persisted key", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "top-left" }));
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.has("alignment")).toBe(true);
    });

    it("returns false for a missing key when file exists", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "top-left" }));
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.has("opacity")).toBe(false);
    });

    it("returns true for a pending (unsaved) key", () => {
      const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
      mgr.save({ size: "large" });
      expect(mgr.has("size")).toBe(true);
    });

    it("returns false after key is removed", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "top-left" }));
      const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
      mgr.remove("alignment");
      expect(mgr.has("alignment")).toBe(false);
    });
  });

  describe("get", () => {
    it("returns undefined when file does not exist and no default", () => {
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.get("alignment")).toBeUndefined();
    });

    it("returns the default when key is not set", () => {
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.get("alignment", "bottom-right")).toBe("bottom-right");
    });

    it("returns persisted value", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "top-left" }));
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.get("alignment")).toBe("top-left");
    });

    it("returns pending (unsaved) value over persisted", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "top-left" }));
      const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
      mgr.save({ alignment: "center" });
      expect(mgr.get("alignment")).toBe("center");
    });

    it("returns default after key is removed", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "top-left" }));
      const mgr = createPrefsManager(prefsPath, { debounceMs: 10000 });
      mgr.remove("alignment");
      expect(mgr.get("alignment", "fallback")).toBe("fallback");
    });

    it("returns falsy values (0, false, empty string) without falling back", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ count: 0, enabled: false, name: "" }));
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.get("count", 99)).toBe(0);
      expect(mgr.get("enabled", true)).toBe(false);
      // Empty string is falsy but not undefined, so it should be returned
      expect(mgr.get("name", "default")).toBe("");
    });
  });

  describe("keys", () => {
    it("returns empty array when no preferences exist", () => {
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.keys()).toEqual([]);
    });

    it("returns keys from persisted preferences", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "top-left", size: "large" }));
      const mgr = createPrefsManager(prefsPath);
      const k = mgr.keys();
      expect(k).toContain("alignment");
      expect(k).toContain("size");
      expect(k.length).toBe(2);
    });

    it("returns keys from pending (unsaved) preferences", () => {
      const mgr = createPrefsManager(prefsPath, { debounceMs: 99999 });
      mgr.save({ opacity: 0.5, ghost: true });
      const k = mgr.keys();
      expect(k).toContain("opacity");
      expect(k).toContain("ghost");
    });

    it("excludes keys set to undefined after remove", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ a: 1, b: 2, c: 3 }));
      const mgr = createPrefsManager(prefsPath, { debounceMs: 99999 });
      mgr.remove("b");
      const k = mgr.keys();
      expect(k).toContain("a");
      expect(k).toContain("c");
      expect(k).not.toContain("b");
    });
  });

  describe("set", () => {
    it("sets a single key-value pair", () => {
      const mgr = createPrefsManager(prefsPath, { debounceMs: 99999 });
      mgr.set("alignment", "top-left");
      expect(mgr.get("alignment")).toBe("top-left");
    });

    it("overwrites an existing key", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ size: "small" }));
      const mgr = createPrefsManager(prefsPath, { debounceMs: 99999 });
      mgr.set("size", "large");
      expect(mgr.get("size")).toBe("large");
    });

    it("persists after flush", () => {
      const mgr = createPrefsManager(prefsPath, { debounceMs: 99999 });
      mgr.set("opacity", 0.5);
      mgr.flush();
      const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
      expect(data.opacity).toBe(0.5);
    });

    it("batches with pending save() calls", () => {
      const mgr = createPrefsManager(prefsPath, { debounceMs: 99999 });
      mgr.save({ a: 1 });
      mgr.set("b", 2);
      mgr.flush();
      const data = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
      expect(data.a).toBe(1);
      expect(data.b).toBe(2);
    });
  });
});
