// City builder: it scans a directory, bundles the canvas boot with the
// repo's own esbuild, and inlines everything into a per-project city file,
// so each codebase opens as one offline file with no server. Inside a git
// checkout it reads the tracked file list, so ignored build output never
// pollutes the city; anywhere else it walks the whole directory instead.
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const output = join(root, "output");
mkdirSync(output, { recursive: true });
const target = process.argv[2] ?? join(root, "src");
const kind = process.argv[3] ?? "compact";
const ignore = process.argv[4] === undefined ? ["package.json", "package-lock.json"] : process.argv[4].split(",").filter((entry) => entry !== "");
if (kind !== "grid" && kind !== "spiral" && kind !== "manhattan" && kind !== "compact" && kind !== "treemap") {
    console.error("unknown layout kind: " + kind + " (grid, spiral, manhattan, compact, treemap)");
    process.exit(1);
}
const MAX_BYTES = 1000000;
const MAX_PREVIEW_LINES = 400;
const MAX_PREVIEW_CHARS = 32000;
const PREVIEW_TRUNCATED_MARK = "\n… (preview truncated)";

// Probes one file: text files earn their line count plus a capped preview
// for the viewer panel, binaries (null byte) earn a flat zero-line slab
// flagged for the dark-slate kind, oversize files and non-files stay out.
function probeFile(abs) {
    const stat = statSync(abs);
    if (!stat.isFile() || stat.size > MAX_BYTES) {
        return null;
    }
    const raw = readFileSync(abs);
    if (raw.includes(0)) {
        return { lines: 0, binary: true, text: "" };
    }
    let lines = 0;
    for (const byte of raw) {
        if (byte === 10) {
            lines += 1;
        }
    }
    const full = raw.toString("utf8").split("\n").slice(0, MAX_PREVIEW_LINES).join("\n");
    const cut = full.length > MAX_PREVIEW_CHARS ? full.slice(0, MAX_PREVIEW_CHARS) : full;
    const truncated = cut.length < raw.length ? PREVIEW_TRUNCATED_MARK : "";
    return { lines: raw.length === 0 ? 0 : lines + 1, binary: false, text: cut + truncated };
}

function pushSample(out, path, probed) {
    if (probed === null) {
        return;
    }
    const sample = { path, lines: probed.lines };
    if (probed.binary) {
        sample.binary = true;
    }
    if (probed.text !== "") {
        sample.text = probed.text;
    }
    out.push(sample);
}

// Reads the tracked file list when the target lives inside a git checkout,
// so ignored build output stays out of the city; otherwise it walks the
// whole directory, so any plain folder still visualizes fully.
function collectSamples(target) {
    try {
        execSync("git rev-parse --is-inside-work-tree", { cwd: target, stdio: "pipe" });
        const tracked = execSync("git ls-files", { cwd: target, encoding: "utf-8" }).split("\n").filter((line) => line !== "");
        const samples = [];
        for (const rel of tracked) {
            pushSample(samples, rel, probeFile(join(target, rel)));
        }
        return samples;
    } catch {
        return collect(target, []);
    }
}
function collect(dir, out, target) {
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) {
            continue;
        }
        const abs = join(dir, name);
        if (statSync(abs).isDirectory()) {
            collect(abs, out, target);
            continue;
        }
        const probed = probeFile(abs);
        if (probed !== null) {
            pushSample(out, relative(target, abs), probed);
        }
    }
    return out;
}

const samples = collectSamples(target);
writeFileSync(join(output, "city-data.mjs"), "export const CITY_SAMPLES = " + JSON.stringify(samples) + ";\nexport const CITY_KIND = " + JSON.stringify(kind) + ";\nexport const CITY_IGNORE = " + JSON.stringify(ignore) + ";\n");
const result = buildSync({
    entryPoints: [join(here, "city-boot.mjs")],
    bundle: true,
    platform: "browser",
    format: "iife",
    minify: true,
    write: false,
});
const projectName = basename(resolve(target));
const outFile = join(output, projectName + "-city.html");
const template = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CodeCity — ${projectName}</title>
<style>
  html, body { margin: 0; height: 100%; background: #18181b; overflow: hidden; }
  #city { width: 100vw; height: 100vh; display: block; cursor: grab; }
</style>
</head>
<body>
<canvas id="city"></canvas>
<script>${result.outputFiles[0].text}</script>
</body>
</html>
`;
writeFileSync(outFile, template);
unlinkSync(join(output, "city-data.mjs"));
console.log("city built: " + samples.length + " files from " + target + " -> " + outFile);
