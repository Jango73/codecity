// Canvas renderer of the standalone code-city module: it draws plates and
// cuboids with a dynamic orbit camera, generic face visibility, painter
// ordering, hover tooltip, and zoom-driven labels. The only DOM touchpoint
// of the module; everything it draws comes from the pure model, camera,
// and label functions, so the math stays testable without a screen.
import { visibleCodeCityLabels } from "./CodeCityLabels";
import { PLATE_HEIGHT } from "./CodeCityLayout";
import { createCodeCityPanel } from "./CodeCityPanel";
import { shadeHexColor } from "./CodeCityColors";
import { createCodeCityCamera, fitScaleForCity, panCodeCityCamera, projectCodeCityPoint, orbitCodeCityCamera, zoomCodeCityCameraToward } from "./CodeCityProjection";
import type { CodeCityCamera, CodeCityFileKind, CodeCityLabel, CodeCityModel, CodeCityRenderHooks, CodeCityScreenPoint } from "./CodeCityTypes";

const VIEW_MARGIN_FRACTION = 0.12;
const READOUT_FONT = "12px monospace";
const TOOLTIP_FONT = "12px monospace";
const TOOLTIP_OFFSET_Y_PIXELS = 14;
const TOOLTIP_PADDING_PIXELS = 6;
const TOOLTIP_BACKGROUND = "rgba(0, 0, 0, 0.85)";
const LABEL_DIRECTORY_FONT = "12px sans-serif";
const LABEL_FILE_FONT = "10px monospace";
const LABEL_DIRECTORY_COLOR = "#00d4aa";
const OUTLINE_COLOR = "#000000";
const OUTLINE_WIDTH_PIXELS = 1;
const DRAW_BUILDING_OUTLINES = true;
const FACADE_MIN_ZOOM = 5;
const FACADE_MIN_SCREEN_HEIGHT_PIXELS = 120;
const FACADE_MAX_COUNT = 100;
const FACADE_LINES_PER_ROW = 2;
const FACADE_MAX_ROWS = 80;
const FACADE_WINDOW_COLUMNS = 4;
const FACADE_WINDOW_SIZE_FRACTION = 0.5;
const FACADE_WINDOW_LIT_FRACTION = 0.55;
const FACADE_WINDOW_FILL = "rgba(255, 255, 255, 0.32)";
const NIGHT_SHADE_FACTOR = 1 / 3;
const KIND_TOOLTIP_SUFFIX: Record<CodeCityFileKind, string> = {
    code: "",
    shell: " · shell",
    config: " · config",
    text: " · text",
    binary: " · binary",
};
const NO_BUTTON = -1;

type DrawFace = {
    corners: CodeCityScreenPoint[];
    fill: string;
    depth: number;
    wall: boolean;
};

type DrawnItem = {
    id: string;
    kind: CodeCityFileKind | null;
    lines: number;
    topX: number;
    topY: number;
    faces: DrawFace[];
    sortDepth: number;
    screenHeight: number;
};

function faceVisible(normalX: number, normalY: number, normalZ: number, camera: CodeCityCamera): boolean {
    const cosYaw = Math.cos(camera.yawRadians);
    const sinYaw = Math.sin(camera.yawRadians);
    const yawedX = normalX * cosYaw + normalZ * sinYaw;
    const yawedZ = -normalX * sinYaw + normalZ * cosYaw;
    const cosPitch = Math.cos(camera.pitchRadians);
    const sinPitch = Math.sin(camera.pitchRadians);
    const pitchedY = normalY * cosPitch - yawedZ * sinPitch;
    const pitchedZ = normalY * sinPitch + yawedZ * cosPitch;
    void pitchedY;
    return pitchedZ > 0;
}

function projectBoxFaces(
    centerX: number, baseY: number, centerZ: number, halfW: number, halfD: number, height: number,
    wall: string, roof: string, camera: CodeCityCamera, widthPixels: number, heightPixels: number, baseScale: number
): DrawFace[] {
    const viewport = { widthPixels, heightPixels };
    const corner = (x: number, y: number, z: number): CodeCityScreenPoint => projectCodeCityPoint(x, y, z, camera, viewport, baseScale);
    const x0 = centerX - halfW;
    const x1 = centerX + halfW;
    const z0 = centerZ - halfD;
    const z1 = centerZ + halfD;
    const y0 = baseY;
    const y1 = baseY + height;
    const faces: DrawFace[] = [];
    const push = (normalX: number, normalY: number, normalZ: number, fill: string, corners: CodeCityScreenPoint[], wall: boolean): void => {
        if (faceVisible(normalX, normalY, normalZ, camera)) {
            faces.push({ corners, fill, depth: (corners[0].depth + corners[1].depth + corners[2].depth + corners[3].depth) / 4, wall });
        }
    };
    push(0, 1, 0, roof, [corner(x0, y1, z0), corner(x1, y1, z0), corner(x1, y1, z1), corner(x0, y1, z1)], false);
    push(0, 0, 1, wall, [corner(x0, y0, z1), corner(x1, y0, z1), corner(x1, y1, z1), corner(x0, y1, z1)], true);
    push(1, 0, 0, wall, [corner(x1, y0, z0), corner(x1, y0, z1), corner(x1, y1, z1), corner(x1, y1, z0)], true);
    push(0, 0, -1, wall, [corner(x1, y0, z0), corner(x0, y0, z0), corner(x0, y1, z0), corner(x1, y1, z0)], true);
    push(-1, 0, 0, wall, [corner(x0, y0, z1), corner(x0, y0, z0), corner(x0, y1, z0), corner(x0, y1, z1)], true);
    push(0, -1, 0, wall, [corner(x0, y0, z0), corner(x1, y0, z0), corner(x1, y0, z1), corner(x0, y0, z1)], false);
    return faces;
}

type HoverTarget = {
    id: string;
    kind: CodeCityFileKind;
    lines: number;
    preview: string;
    roof: CodeCityScreenPoint[];
};

const CLICK_DRAG_THRESHOLD_PIXELS = 4;

// Tells whether a screen pixel falls inside one convex projected quad, so
// hovering tests the whole roof instead of a radius around its center.
function pointInConvexQuad(x: number, y: number, corners: CodeCityScreenPoint[]): boolean {
    if (corners.length !== 4) {
        return false;
    }
    let sign = 0;
    for (let index = 0; index < 4; index += 1) {
        const first = corners[index];
        const second = corners[(index + 1) % 4];
        const cross = (second.x - first.x) * (y - first.y) - (second.y - first.y) * (x - first.x);
        if (cross !== 0) {
            const current = cross > 0 ? 1 : -1;
            if (sign !== 0 && current !== sign) {
                return false;
            }
            sign = current;
        }
    }
    return true;
}

// Night cache: shaded fills memoized by source color, so the per-frame
// darkening costs one map lookup instead of re-parsing every hex.
const nightCache = new Map<string, string>();

function nightFill(fill: string): string {
    const cached = nightCache.get(fill);
    if (cached !== undefined) {
        return cached;
    }
    const shaded = shadeHexColor(fill, NIGHT_SHADE_FACTOR);
    nightCache.set(fill, shaded);
    return shaded;
}

function drawFaces(context: CanvasRenderingContext2D, faces: DrawFace[], outline: boolean, night: boolean): void {
    for (const face of faces) {
        context.fillStyle = night ? nightFill(face.fill) : face.fill;
        context.beginPath();
        context.moveTo(face.corners[0].x, face.corners[0].y);
        for (let index = 1; index < face.corners.length; index += 1) {
            context.lineTo(face.corners[index].x, face.corners[index].y);
        }
        context.closePath();
        context.fill();
        if (outline) {
            context.strokeStyle = OUTLINE_COLOR;
            context.lineWidth = OUTLINE_WIDTH_PIXELS;
            context.stroke();
        }
    }
}

// Deterministic fraction in [0, 1) for one stripe of one building, so the
// faux-code pattern stays stable frame to frame without storing any text.
function hashFacadeFraction(id: string, index: number): number {
    let hash = 2166136261;
    for (let position = 0; position < id.length; position += 1) {
        hash ^= id.charCodeAt(position);
        hash = Math.imul(hash, 16777619);
    }
    hash ^= Math.imul(index + 1, 2654435761);
    hash = Math.imul(hash, 16777619);
    return ((hash >>> 0) % 1000) / 1000;
}

// Draws faux-code windows on the visible walls of one cuboid: a uniform
// grid of small squares, each lit or dark by path hash, one row per line
// tranche, clipped to each wall quad. Wall corners run bottom-left,
// bottom-right, top-right, top-left, so grid interpolation walks the left
// and right edges.
function drawFacadeStripes(context: CanvasRenderingContext2D, faces: DrawFace[], id: string, lines: number): void {
    const rowCount = Math.min(FACADE_MAX_ROWS, Math.ceil(lines / FACADE_LINES_PER_ROW));
    if (rowCount <= 0) {
        return;
    }
    const margin = (1 - FACADE_WINDOW_SIZE_FRACTION) / 2;
    context.fillStyle = FACADE_WINDOW_FILL;
    for (const face of faces) {
        if (!face.wall) {
            continue;
        }
        const bottomLeft = face.corners[0];
        const bottomRight = face.corners[1];
        const topRight = face.corners[2];
        const topLeft = face.corners[3];
        context.save();
        context.beginPath();
        context.moveTo(bottomLeft.x, bottomLeft.y);
        context.lineTo(bottomRight.x, bottomRight.y);
        context.lineTo(topRight.x, topRight.y);
        context.lineTo(topLeft.x, topLeft.y);
        context.closePath();
        context.clip();
        const pointAt = (t: number, v: number): { x: number; y: number } => {
            const leftX = bottomLeft.x + (topLeft.x - bottomLeft.x) * v;
            const leftY = bottomLeft.y + (topLeft.y - bottomLeft.y) * v;
            const rightX = bottomRight.x + (topRight.x - bottomRight.x) * v;
            const rightY = bottomRight.y + (topRight.y - bottomRight.y) * v;
            return { x: leftX + (rightX - leftX) * t, y: leftY + (rightY - leftY) * t };
        };
        for (let row = 0; row < rowCount; row += 1) {
            const cellLow = row / rowCount;
            const cellHigh = (row + 1) / rowCount;
            const low = cellLow + (cellHigh - cellLow) * margin;
            const high = cellHigh - (cellHigh - cellLow) * margin;
            for (let column = 0; column < FACADE_WINDOW_COLUMNS; column += 1) {
                if (hashFacadeFraction(id, row * FACADE_WINDOW_COLUMNS + column) >= FACADE_WINDOW_LIT_FRACTION) {
                    continue;
                }
                const cellLeft = column / FACADE_WINDOW_COLUMNS;
                const cellRight = (column + 1) / FACADE_WINDOW_COLUMNS;
                const left = cellLeft + (cellRight - cellLeft) * margin;
                const right = cellRight - (cellRight - cellLeft) * margin;
                const first = pointAt(left, low);
                const second = pointAt(right, low);
                const third = pointAt(right, high);
                const fourth = pointAt(left, high);
                context.beginPath();
                context.moveTo(first.x, first.y);
                context.lineTo(second.x, second.y);
                context.lineTo(third.x, third.y);
                context.lineTo(fourth.x, fourth.y);
                context.closePath();
                context.fill();
            }
        }
        context.restore();
    }
}

// Renders one interactive frame loop on the given canvas: drag orbits the
// camera, wheel zooms, shift-drag (or right button) pans, hover reads the
// cuboid under the cursor, and labels fade in with zoom through the shared
// label filter instead of hardcoded thresholds in the view.
export function renderCodeCity(canvas: HTMLCanvasElement, model: CodeCityModel, hooks: CodeCityRenderHooks = {}): void {
    const context = canvas.getContext("2d");
    if (context === null) {
        return;
    }

    const camera: CodeCityCamera = createCodeCityCamera();
    // Reference framing: the base scale fits the city once at the default
    // pitch and never follows the live camera, so orbiting the elevation
    // turns the city instead of breathing its size.
    const framingCamera: CodeCityCamera = createCodeCityCamera();
    // Night mode arrives through the URL like the layout kind, so the
    // renderer stays button-free: ?night=1 darkens the scene to one third
    // while windows keep full brightness.
    const night = new URLSearchParams(window.location.search).get("night") === "1";
    let draggingButton = NO_BUTTON;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let hoveredId: string | null = null;
    let hoveredKind: CodeCityFileKind | null = null;
    let hoveredLines = 0;
    let hoverX = 0;
    let hoverY = 0;
    let downX = 0;
    let downY = 0;
    let hoverTargets: HoverTarget[] = [];
    const panel = createCodeCityPanel(hooks.highlight);

    const resize = (): void => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    canvas.addEventListener("pointerdown", (event) => {
        draggingButton = event.button;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        downX = event.clientX;
        downY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
        if (draggingButton !== NO_BUTTON) {
            const deltaX = event.clientX - lastPointerX;
            const deltaY = event.clientY - lastPointerY;
            if (draggingButton === 0 || event.shiftKey) {
                panCodeCityCamera(camera, deltaX, deltaY);
            } else {
                const orbitViewport = { widthPixels: canvas.width, heightPixels: canvas.height };
                orbitCodeCityCamera(camera, deltaX, deltaY, orbitViewport, currentScale());
            }
            lastPointerX = event.clientX;
            lastPointerY = event.clientY;
            hoveredId = null;
            return;
        }
        hoverX = event.offsetX;
        hoverY = event.offsetY;
        hoveredId = null;
        hoveredKind = null;
        hoveredLines = 0;
        for (let index = hoverTargets.length - 1; index >= 0; index -= 1) {
            const target = hoverTargets[index];
            if (pointInConvexQuad(event.offsetX, event.offsetY, target.roof)) {
                hoveredId = target.id;
                hoveredKind = target.kind;
                hoveredLines = target.lines;
                break;
            }
        }
    });

    const stopDrag = (): void => {
        draggingButton = NO_BUTTON;
    };
    canvas.addEventListener("pointerup", stopDrag);
    canvas.addEventListener("pointercancel", stopDrag);
    canvas.addEventListener("pointerleave", () => {
        hoveredId = null;
    });
    // Opens the viewer panel on a true click (not the end of an orbit drag)
    // over a hovered cuboid, swapping content when another one is picked;
    // a true click on empty ground closes it.
    canvas.addEventListener("click", (event) => {
        if (Math.hypot(event.clientX - downX, event.clientY - downY) > CLICK_DRAG_THRESHOLD_PIXELS) {
            return;
        }
        if (hoveredId === null) {
            panel.close();
            return;
        }
        const target = hoverTargets.find((entry) => entry.id === hoveredId);
        if (target === undefined) {
            return;
        }
        const lang = hooks.langOf === undefined ? null : hooks.langOf(target.id);
        panel.open({ id: target.id, kind: target.kind, lines: target.lines, preview: target.preview, lang });
    });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        zoomCodeCityCameraToward(camera, event.deltaY, event.offsetX, event.offsetY, canvas.width / 2, canvas.height / 2);
    }, { passive: false });

    const currentScale = (): number => {
        const viewport = { widthPixels: canvas.width, heightPixels: canvas.height };
        return fitScaleForCity(model.extent.width, model.extent.depth, model.maxHeight, framingCamera, viewport, VIEW_MARGIN_FRACTION);
    };

    const frame = (): void => {
        const scale = currentScale();
        const viewport = { widthPixels: canvas.width, heightPixels: canvas.height };
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Ground first: parent plates before nested ones, so blocks never
        // cover the cuboids standing on them. Boxes follow, far base first.
        const plateItems: DrawnItem[] = [];
        for (const plate of model.plates) {
            const faces = projectBoxFaces(plate.rect.x + plate.rect.width / 2, 0, plate.rect.z + plate.rect.depth / 2, plate.rect.width / 2, plate.rect.depth / 2, PLATE_HEIGHT, plate.wall, plate.roof, camera, canvas.width, canvas.height, scale);
            const top = projectCodeCityPoint(plate.rect.x + plate.rect.width / 2, PLATE_HEIGHT, plate.rect.z + plate.rect.depth / 2, camera, viewport, scale);
            plateItems.push({ id: plate.id, kind: null, lines: 0, topX: top.x, topY: top.y, faces, sortDepth: plate.rect.width * plate.rect.depth, screenHeight: 0 });
        }
        plateItems.sort((first, second) => second.sortDepth - first.sortDepth);

        const boxItems: DrawnItem[] = [];
        const roofs: { target: HoverTarget; sortDepth: number }[] = [];
        for (const box of model.boxes) {
            const faces = projectBoxFaces(box.x, PLATE_HEIGHT, box.z, box.halfWidth, box.halfDepth, box.height, box.wall, box.roof, camera, canvas.width, canvas.height, scale);
            const top = projectCodeCityPoint(box.x, PLATE_HEIGHT + box.height, box.z, camera, viewport, scale);
            const base = projectCodeCityPoint(box.x, 0, box.z, camera, viewport, scale);
            boxItems.push({ id: box.id, kind: box.kind, lines: box.lines, topX: top.x, topY: top.y, faces, sortDepth: base.depth, screenHeight: Math.abs(top.y - base.y) });
            const y = PLATE_HEIGHT + box.height;
            roofs.push({
                target: {
                id: box.id,
                kind: box.kind,
                lines: box.lines,
                preview: box.preview,
                roof: [
                    projectCodeCityPoint(box.x - box.halfWidth, y, box.z - box.halfDepth, camera, viewport, scale),
                    projectCodeCityPoint(box.x + box.halfWidth, y, box.z - box.halfDepth, camera, viewport, scale),
                    projectCodeCityPoint(box.x + box.halfWidth, y, box.z + box.halfDepth, camera, viewport, scale),
                    projectCodeCityPoint(box.x - box.halfWidth, y, box.z + box.halfDepth, camera, viewport, scale),
                ],
                },
                sortDepth: base.depth,
            });
        }
        boxItems.sort((first, second) => first.sortDepth - second.sortDepth);
        roofs.sort((first, second) => first.sortDepth - second.sortDepth);
        hoverTargets = roofs.map((entry) => entry.target);

        for (const item of plateItems) {
            drawFaces(context, item.faces, false, night);
        }
        // Zoom-gated facades: only the tallest on-screen code and shell
        // cuboids earn windows, biggest first, capped as a frame-budget guard.
        const facadeIds = new Set<string>();
        if (camera.zoom >= FACADE_MIN_ZOOM) {
            const ranked = boxItems
                .filter((item) => (item.kind === "code" || item.kind === "shell") && item.screenHeight >= FACADE_MIN_SCREEN_HEIGHT_PIXELS)
                .sort((first, second) => second.screenHeight - first.screenHeight)
                .slice(0, FACADE_MAX_COUNT);
            for (const item of ranked) {
                facadeIds.add(item.id);
            }
        }
        for (const item of boxItems) {
            drawFaces(context, item.faces, DRAW_BUILDING_OUTLINES, night);
            if (facadeIds.has(item.id)) {
                drawFacadeStripes(context, item.faces, item.id, item.lines);
            }
            if (item.id === hoveredId) {
                context.strokeStyle = "#ffffff";
                context.lineWidth = 2;
                context.beginPath();
                context.arc(item.topX, item.topY, 5, 0, Math.PI * 2);
                context.stroke();
            }
        }

        const labels: CodeCityLabel[] = visibleCodeCityLabels(model, camera, viewport, scale);
        for (const label of labels) {
            const isDirectory = label.kind === "directory";
            context.font = isDirectory ? LABEL_DIRECTORY_FONT : LABEL_FILE_FONT;
            context.textAlign = isDirectory ? "left" : "center";
            context.lineWidth = 3;
            context.strokeStyle = "rgba(0, 0, 0, 0.7)";
            const labelX = isDirectory ? label.x + 4 : label.x;
            context.strokeText(label.text, labelX, label.y - 4);
            context.fillStyle = isDirectory ? LABEL_DIRECTORY_COLOR : "#e4e4e7";
            context.fillText(label.text, labelX, label.y - 4);
        }
        context.textAlign = "left";

        context.font = READOUT_FONT;
        context.textAlign = "left";
        context.lineWidth = 3;
        context.strokeStyle = "rgba(0, 0, 0, 0.7)";
        const readout = model.boxes.length + " files" + (night ? " · night" : "");
        context.strokeText(readout, 12, canvas.height - 12);
        context.fillStyle = "#ffffff";
        context.fillText(readout, 12, canvas.height - 12);

        if (hoveredId !== null) {
            context.font = TOOLTIP_FONT;
            const suffix = hoveredKind === null ? "" : KIND_TOOLTIP_SUFFIX[hoveredKind];
            const tooltipText = hoveredId + " — " + hoveredLines + " lines" + suffix;
            const textWidth = context.measureText(tooltipText).width;
            const boxWidth = textWidth + TOOLTIP_PADDING_PIXELS * 2;
            const boxHeight = 20;
            let boxX = hoverX - boxWidth / 2;
            boxX = Math.min(Math.max(boxX, 4), Math.max(4, canvas.width - boxWidth - 4));
            let boxY = hoverY - TOOLTIP_OFFSET_Y_PIXELS - boxHeight;
            if (boxY < 4) {
                boxY = hoverY + TOOLTIP_OFFSET_Y_PIXELS;
            }
            context.fillStyle = TOOLTIP_BACKGROUND;
            context.fillRect(boxX, boxY, boxWidth, boxHeight);
            context.textAlign = "left";
            context.fillStyle = "#ffffff";
            context.fillText(tooltipText, boxX + TOOLTIP_PADDING_PIXELS, boxY + 14);
        }

        requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
}
