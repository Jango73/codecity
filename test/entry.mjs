// Geometry proof of the code-city module: it lays out a synthetic folder
// tree, then asserts every invariant the renderer relies on. Bundled with
// esbuild and executed by test/run.mjs, never committed.
import { footprintSideForLines, heightForLines, heightPerLineForSamples, layoutCodeCity } from "../src/CodeCityLayout.js";
import { TREEMAP_MIN_WEIGHT_FRACTION } from "../src/CodeCityTreemap.js";
import { baseScaleForExtent, createCodeCityCamera, groundPointAtScreen, orbitCodeCityCamera, projectCodeCityPoint, zoomCodeCityCameraToward } from "../src/CodeCityProjection.js";
import { visibleCodeCityLabels } from "../src/CodeCityLabels.js";

function mulberry32(seed) {
    let state = seed;
    return () => {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return (((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296);
    };
}

const random = mulberry32(20261101);
const TOPS = ["backend", "frontend", "shared", "scripts", "doc", "tests"];
const samples = [];
for (const top of TOPS) {
    const dirCount = 4 + Math.floor(random() * 4);
    for (let dir = 0; dir < dirCount; dir += 1) {
        const fileCount = 5 + Math.floor(random() * 60);
        for (let file = 0; file < fileCount; file += 1) {
            samples.push({ path: top + "/part-" + dir + "/file-" + file + ".ts", lines: Math.floor(random() * 2000) });
        }
    }
}
samples.push({ path: "README.md", lines: 62 });
samples.push({ path: "package.json", lines: 11 });
samples.push({ path: "empty.ts", lines: 0 });
samples.push({ path: "assets/logo.png", lines: 0, binary: true });
samples.push({ path: "scripts/deploy.sh", lines: 40 });

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); console.log((ok ? "ok" : "FAIL") + " " + name); };

for (const kind of ["grid", "spiral", "manhattan", "compact", "treemap"]) {
const model = layoutCodeCity(samples, kind);
const again = layoutCodeCity(samples, kind);

check(kind + ": box count matches sample count", model.boxes.length === samples.length);
const ids = new Set(model.boxes.map((box) => box.id));
check(kind + ": every sample has a box", samples.every((sample) => ids.has(sample.path)));
check(kind + ": deterministic layout", JSON.stringify(model) === JSON.stringify(again));

let overlap = false;
for (let i = 0; i < model.boxes.length && !overlap; i += 1) {
    for (let j = i + 1; j < model.boxes.length; j += 1) {
        const a = model.boxes[i];
        const b = model.boxes[j];
        // Exact tilings share edges down to float noise, which is not an
        // overlap: only a positive-area intersection counts, hence the
        // epsilon, mirroring the extent check below.
        if (Math.abs(a.x - b.x) < a.halfWidth + b.halfWidth - 1e-9 && Math.abs(a.z - b.z) < a.halfDepth + b.halfDepth - 1e-9) {
            overlap = true;
            break;
        }
    }
}
check(kind + ": no box overlap", !overlap);
check(kind + ": boxes inside extent", model.boxes.every((box) =>
    box.x - box.halfWidth >= model.extent.x - 1e-6 && box.x + box.halfWidth <= model.extent.x + model.extent.width + 1e-6 &&
    box.z - box.halfDepth >= model.extent.z - 1e-6 && box.z + box.halfDepth <= model.extent.z + model.extent.depth + 1e-6));
check(kind + ": maxHeight matches tallest box", model.maxHeight === Math.max(...model.boxes.map((box) => box.height)));
let heightSum = 0;
for (const box of model.boxes) {
    heightSum += box.height;
}
check(kind + ": mean height sits at the standard", Math.abs(heightSum / model.boxes.length - 4) < 0.5);
}

const gridModel = layoutCodeCity(samples, "grid");
const compactModel = layoutCodeCity(samples, "compact");
check("compact packs tighter than grid", compactModel.extent.width * compactModel.extent.depth <= gridModel.extent.width * gridModel.extent.depth + 1e-6);

let allLines = 0;
for (const sample of samples) {
    allLines += sample.lines;
}
const treemapModel = layoutCodeCity(samples, "treemap");
let treemapWeight = 0;
for (const sample of samples) {
    treemapWeight += Math.max(sample.lines, allLines / samples.length * TREEMAP_MIN_WEIGHT_FRACTION);
}
const treemapArea = treemapModel.extent.width * treemapModel.extent.depth;
check("treemap fills its extent without waste", treemapArea <= treemapWeight + 1 && treemapArea >= treemapWeight * 0.9);

const sampleHeightPerLine = heightPerLineForSamples(samples.length, allLines);
check("boxes match the sizing rule", gridModel.boxes.every((box) =>
    box.height === heightForLines(box.lines, sampleHeightPerLine) &&
    box.halfWidth === footprintSideForLines(box.lines, sampleHeightPerLine) / 2));
check("towers widen instead of rising", footprintSideForLines(10000, sampleHeightPerLine) > footprintSideForLines(100, sampleHeightPerLine) &&
    heightForLines(10000, sampleHeightPerLine) / heightForLines(100, sampleHeightPerLine) < 100);

const filtered = layoutCodeCity(samples, "grid", ["package.json"]);
check("ignore drops basename matches", filtered.boxes.length === samples.length - 1 && filtered.boxes.every((box) => !box.id.endsWith("package.json")));
check("boxes carry a file kind", gridModel.boxes.every((box) => box.kind === "code" || box.kind === "shell" || box.kind === "config" || box.kind === "text" || box.kind === "binary"));
check("boxes default to an empty preview", gridModel.boxes.every((box) => box.preview === ""));
check("markdown reads as text", gridModel.boxes.some((box) => box.id === "README.md" && box.kind === "text"));
check("manifest reads as config", gridModel.boxes.some((box) => box.id === "package.json" && box.kind === "config"));
check("sources read as code", gridModel.boxes.some((box) => box.id === "empty.ts" && box.kind === "code"));
check("scripts read as shell", gridModel.boxes.some((box) => box.id === "scripts/deploy.sh" && box.kind === "shell"));
check("flagged binary reads as binary", gridModel.boxes.some((box) => box.id === "assets/logo.png" && box.kind === "binary"));
const plateById = new Map(gridModel.plates.map((plate) => [plate.id, plate.roof]));
const luminanceOf = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
let depthPairs = 0;
let depthDarkens = true;
for (const plate of gridModel.plates) {
    const separator = plate.id.lastIndexOf("/");
    if (separator > 0) {
        const parent = plateById.get(plate.id.slice(0, separator));
        if (parent !== undefined) {
            depthPairs += 1;
            if (!(luminanceOf(plate.roof) < luminanceOf(parent))) {
                depthDarkens = false;
            }
        }
    }
}
check("plates darken with depth", depthPairs > 0 && depthDarkens);

const model = layoutCodeCity(samples, "grid");
const viewport = { widthPixels: 1600, heightPixels: 1000 };
const scale = baseScaleForExtent(model.extent.width, model.extent.depth, viewport, 0.12);
const rotated = createCodeCityCamera();
rotated.yawRadians += Math.PI * 2;
const plain = createCodeCityCamera();
const before = projectCodeCityPoint(3, 5, 7, plain, viewport, scale);
const after = projectCodeCityPoint(3, 5, 7, rotated, viewport, scale);
check("full-turn rotation is identity", Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);

const anchored = createCodeCityCamera();
const anchorViewport = { widthPixels: 1600, heightPixels: 1000 };
const anchorScale = baseScaleForExtent(model.extent.width, model.extent.depth, anchorViewport, 0.12);
const pivotX = 1100;
const pivotY = 300;
const fixed = projectCodeCityPoint(3, 5, 7, anchored, anchorViewport, anchorScale);
anchored.panXPixels = pivotX - fixed.x;
anchored.panYPixels = pivotY - fixed.y;
zoomCodeCityCameraToward(anchored, -120, pivotX, pivotY, anchorViewport.widthPixels / 2, anchorViewport.heightPixels / 2);
const kept = projectCodeCityPoint(3, 5, 7, anchored, anchorViewport, anchorScale);
check("zoom toward cursor keeps the point fixed", Math.abs(kept.x - pivotX) < 1e-6 && Math.abs(kept.y - pivotY) < 1e-6);

const orbitCam = createCodeCityCamera();
const orbitViewport = { widthPixels: 1600, heightPixels: 1000 };
const orbitScale = baseScaleForExtent(model.extent.width, model.extent.depth, orbitViewport, 0.12);
const anchor = groundPointAtScreen(orbitCam, orbitViewport.widthPixels / 2, orbitViewport.heightPixels / 2, orbitViewport, orbitScale);
orbitCodeCityCamera(orbitCam, 37, -21, orbitViewport, orbitScale);
const recentered = projectCodeCityPoint(anchor.x, 0, anchor.z, orbitCam, orbitViewport, orbitScale);
check("orbit keeps the screen center fixed", Math.abs(recentered.x - orbitViewport.widthPixels / 2) < 1e-6 && Math.abs(recentered.y - orbitViewport.heightPixels / 2) < 1e-6);

const lowZoom = { ...createCodeCityCamera(), zoom: 1 };
const midZoom = { ...createCodeCityCamera(), zoom: 2 };
const highZoom = { ...createCodeCityCamera(), zoom: 5 };
const lowCount = visibleCodeCityLabels(model, lowZoom, viewport, scale).length;
const midCount = visibleCodeCityLabels(model, midZoom, viewport, scale).length;
const highCount = visibleCodeCityLabels(model, highZoom, viewport, scale).length;
check("labels grow with zoom", lowCount <= midCount && midCount <= highCount);

if (failures.length > 0) {
    process.exit(1);
}
console.log("proof passed on " + samples.length + " synthetic samples");
