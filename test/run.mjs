// Test runner: it bundles the proof entry with the repo's own esbuild and
// executes the bundle, so the proof always runs against current sources.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, ".tmp");
mkdirSync(outDir, { recursive: true });
const bundle = join(outDir, "proof.cjs");
buildSync({ entryPoints: [join(here, "entry.mjs")], bundle: true, platform: "node", format: "cjs", outfile: bundle });
execFileSync(process.execPath, [bundle], { stdio: "inherit" });
