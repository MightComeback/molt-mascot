import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { createPrefsManager, validatePrefs, PREF_SCHEMA } from "../src/prefs.cjs";
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

  describe("getAll", () => {
    it("returns empty object when no prefs exist", () => {
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.getAll()).toEqual({});
    });

    it("returns persisted preferences", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ a: 1, b: 2 }));
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.getAll()).toEqual({ a: 1, b: 2 });
    });

    it("includes pending unsaved writes", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ a: 1 }));
      const mgr = createPrefsManager(prefsPath, { debounceMs: 99999 });
      mgr.save({ b: 2 });
      const all = mgr.getAll();
      expect(all).toEqual({ a: 1, b: 2 });
    });

    it("returns a safe copy (mutations don't affect internal state)", () => {
      const mgr = createPrefsManager(prefsPath, { debounceMs: 99999 });
      mgr.save({ x: 10 });
      const copy = mgr.getAll();
      copy.x = 999;
      expect(mgr.get("x")).toBe(10);
    });

    it("excludes keys set to undefined", () => {
      const mgr = createPrefsManager(prefsPath, { debounceMs: 99999 });
      mgr.save({ a: 1, b: undefined });
      expect(mgr.getAll()).toEqual({ a: 1 });
    });
  });

  describe("size()", () => {
    it("returns 0 when no preferences are set", () => {
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.size()).toBe(0);
    });

    it("returns count of persisted preferences", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ a: 1, b: 2, c: 3 }));
      const mgr = createPrefsManager(prefsPath);
      expect(mgr.size()).toBe(3);
    });

    it("reflects pending unsaved writes", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ a: 1 }));
      const mgr = createPrefsManager(prefsPath, { debounceMs: 99999 });
      mgr.save({ b: 2 });
      expect(mgr.size()).toBe(2);
    });

    it("decreases after remove", () => {
      const mgr = createPrefsManager(prefsPath, { debounceMs: 99999 });
      mgr.save({ x: 1, y: 2, z: 3 });
      expect(mgr.size()).toBe(3);
      mgr.remove("y");
      expect(mgr.size()).toBe(2);
    });

    it("returns 0 after clear", () => {
      fs.writeFileSync(prefsPath, JSON.stringify({ a: 1 }));
      const mgr = createPrefsManager(prefsPath, { debounceMs: 99999 });
      mgr.clear();
      expect(mgr.size()).toBe(0);
    });
  });
});

describe("validatePrefs", () => {
  it("passes through valid preferences unchanged", () => {
    const raw = { alignment: "top-left", sizeIndex: 2, clickThrough: true, padding: 10 };
    const { clean, dropped } = validatePrefs(raw);
    expect(clean).toEqual(raw);
    expect(dropped).toEqual([]);
  });

  it("drops unknown keys with reason", () => {
    const { clean, dropped } = validatePrefs({ alignment: "center", bogus: 42, foo: "bar" });
    expect(clean).toEqual({ alignment: "center" });
    const droppedKeys = dropped.map((d) => d.key);
    expect(droppedKeys).toContain("bogus");
    expect(droppedKeys).toContain("foo");
    expect(dropped.find((d) => d.key === "bogus").reason).toBe("unknown key");
  });

  it("drops keys with wrong type and includes reason", () => {
    const { clean, dropped } = validatePrefs({ alignment: 123, clickThrough: "yes", sizeIndex: "two" });
    expect(clean).toEqual({});
    expect(dropped.map((d) => d.key)).toEqual(["alignment", "clickThrough", "sizeIndex"]);
    expect(dropped[0].reason).toBe("expected string, got number");
    expect(dropped[1].reason).toBe("expected boolean, got string");
  });

  it("drops numbers that fail validation (negative index, NaN padding)", () => {
    const { clean, dropped } = validatePrefs({ sizeIndex: -1, opacityIndex: 1.5, padding: -10 });
    expect(clean).toEqual({});
    expect(dropped.map((d) => d.key)).toEqual(["sizeIndex", "opacityIndex", "padding"]);
    for (const d of dropped) expect(d.reason).toMatch(/failed validation/);
  });

  it("drops NaN and Infinity numbers", () => {
    const { clean, dropped } = validatePrefs({ padding: NaN, sizeIndex: Infinity });
    expect(clean).toEqual({});
    const droppedKeys = dropped.map((d) => d.key);
    expect(droppedKeys).toContain("padding");
    expect(droppedKeys).toContain("sizeIndex");
  });

  it("validates dragPosition object shape", () => {
    const { clean: good } = validatePrefs({ dragPosition: { x: 100, y: 200 } });
    expect(good.dragPosition).toEqual({ x: 100, y: 200 });

    const { clean: bad, dropped } = validatePrefs({ dragPosition: { x: "a", y: 10 } });
    expect(bad.dragPosition).toBeUndefined();
    expect(dropped.map((d) => d.key)).toContain("dragPosition");
  });

  it("drops null dragPosition", () => {
    const { clean, dropped } = validatePrefs({ dragPosition: null });
    expect(clean.dragPosition).toBeUndefined();
    expect(dropped.map((d) => d.key)).toContain("dragPosition");
  });

  it("returns empty clean object for null/undefined/array input", () => {
    expect(validatePrefs(null).clean).toEqual({});
    expect(validatePrefs(undefined).clean).toEqual({});
    expect(validatePrefs([1, 2]).clean).toEqual({});
  });

  it("drops invalid alignment values", () => {
    const { clean, dropped } = validatePrefs({ alignment: "banana" });
    expect(clean).toEqual({});
    expect(dropped.map((d) => d.key)).toContain("alignment");
  });

  it("accepts valid alignment values", () => {
    const { clean, dropped } = validatePrefs({ alignment: "top-left" });
    expect(clean.alignment).toBe("top-left");
    expect(dropped).toEqual([]);
  });

  it("accepts valid raw opacity values and rejects out-of-range", () => {
    const { clean: good } = validatePrefs({ opacity: 0.3 });
    expect(good.opacity).toBe(0.3);

    const { clean: zero } = validatePrefs({ opacity: 0 });
    expect(zero.opacity).toBe(0);

    const { clean: one } = validatePrefs({ opacity: 1 });
    expect(one.opacity).toBe(1);

    const { clean: bad1, dropped: d1 } = validatePrefs({ opacity: 1.5 });
    expect(bad1.opacity).toBeUndefined();
    expect(d1.map((d) => d.key)).toContain("opacity");

    const { clean: bad2, dropped: d2 } = validatePrefs({ opacity: -0.1 });
    expect(bad2.opacity).toBeUndefined();
    expect(d2.map((d) => d.key)).toContain("opacity");
  });

  it("does not mutate input", () => {
    const raw = { alignment: "center", bogus: 42 };
    const copy = { ...raw };
    validatePrefs(raw);
    expect(raw).toEqual(copy);
  });
});

describe("loadValidated", () => {
  let tmpDir;
  let prefsPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "molt-prefs-lv-"));
    prefsPath = path.join(tmpDir, "preferences.json");
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  });

  it("returns clean prefs and empty dropped for valid data", () => {
    fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "top-left", clickThrough: true }));
    const mgr = createPrefsManager(prefsPath);
    const { clean, dropped } = mgr.loadValidated();
    expect(clean).toEqual({ alignment: "top-left", clickThrough: true });
    expect(dropped).toEqual([]);
  });

  it("strips unknown keys from persisted file", () => {
    fs.writeFileSync(prefsPath, JSON.stringify({ alignment: "center", bogus: 42 }));
    const mgr = createPrefsManager(prefsPath);
    const { clean, dropped } = mgr.loadValidated();
    expect(clean).toEqual({ alignment: "center" });
    expect(dropped.map((d) => d.key)).toContain("bogus");
  });

  it("drops invalid values", () => {
    fs.writeFileSync(prefsPath, JSON.stringify({ alignment: 123, padding: -5 }));
    const mgr = createPrefsManager(prefsPath);
    const { clean, dropped } = mgr.loadValidated();
    expect(clean).toEqual({});
    expect(dropped.length).toBe(2);
  });

  it("returns empty clean for missing file", () => {
    const mgr = createPrefsManager(prefsPath);
    const { clean, dropped } = mgr.loadValidated();
    expect(clean).toEqual({});
    expect(dropped).toEqual([]);
  });
});

describe("PREF_SCHEMA", () => {
  it("covers all expected preference keys", () => {
    const expectedKeys = ["alignment", "sizeIndex", "opacityIndex", "opacity", "padding", "clickThrough", "hideText", "gatewayUrl", "dragPosition"];
    for (const key of expectedKeys) {
      expect(PREF_SCHEMA[key]).toBeDefined();
    }
  });
});
