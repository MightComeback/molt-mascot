import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Use fileURLToPath for cross-platform correctness (Windows path handling).
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const pkgPath = path.join(root, "package.json");
const manifestPath = path.join(root, "clawdbot.plugin.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const next = {
  ...manifest,
  id: pkg.name,
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  // Keep entrypoint aligned with package.json (avoid packaging mismatches).
  main: pkg.main ?? manifest.main,
};

const before = JSON.stringify(manifest, null, 2) + "\n";
const after = JSON.stringify(next, null, 2) + "\n";

if (before !== after) {
  fs.writeFileSync(manifestPath, after, "utf8");
  process.stdout.write(
    `synced clawdbot.plugin.json: ${manifest.id}@${manifest.version} -> ${next.id}@${next.version}\n`
  );
}
