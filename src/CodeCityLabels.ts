// Zoom-driven label filter of the standalone code-city module: it decides
// which directory and file names earn screen space at the current zoom, so
// the view stays readable instead of drowning in overlapping text. Pure
// data in, labels out, no canvas anywhere.
import { projectCodeCityPoint } from "./CodeCityProjection";
import type { CodeCityBox, CodeCityCamera, CodeCityLabel, CodeCityModel, CodeCityViewport } from "./CodeCityTypes";

const DIRECTORY_LABEL_MIN_ZOOM = 1.4;
const FILE_LABEL_MIN_ZOOM = 3.2;
const MIN_LABEL_SIZE_PIXELS = 26;
const MAX_LABEL_COUNT = 800;
const VIEWPORT_MARGIN_PIXELS = 120;
const LABEL_CHAR_WIDTH_PIXELS = 6;
const LABEL_HEIGHT_PIXELS = 12;

type LabelCandidate = {
    label: CodeCityLabel;
    priority: number;
};

// Collects the labels worth drawing at this zoom: directory plates first,
// then file cuboids past a deeper zoom, biggest on screen first, culled to
// the viewport so a deep zoom names every visible file instead of the
// first hundred of the whole city, capped only as a frame-budget guard.
export function visibleCodeCityLabels(model: CodeCityModel, camera: CodeCityCamera, viewport: CodeCityViewport, baseScale: number): CodeCityLabel[] {
    const candidates: LabelCandidate[] = [];
    const onScreen = (x: number, y: number): boolean => {
        return x >= -VIEWPORT_MARGIN_PIXELS && x <= viewport.widthPixels + VIEWPORT_MARGIN_PIXELS && y >= -VIEWPORT_MARGIN_PIXELS && y <= viewport.heightPixels + VIEWPORT_MARGIN_PIXELS;
    };

    if (camera.zoom >= DIRECTORY_LABEL_MIN_ZOOM) {
        for (const plate of model.plates) {
            const center = projectCodeCityPoint(plate.rect.x + plate.rect.width / 2, 0, plate.rect.z + plate.rect.depth / 2, camera, viewport, baseScale);
            const size = Math.min(plate.rect.width, plate.rect.depth) * baseScale * camera.zoom;
            const segments = plate.id.split("/");
            const text = segments[segments.length - 1];
            if (size >= MIN_LABEL_SIZE_PIXELS && onScreen(center.x, center.y)) {
                candidates.push({ label: { text, x: center.x, y: center.y, kind: "directory" }, priority: size });
            }
        }
    }

    if (camera.zoom >= FILE_LABEL_MIN_ZOOM) {
        for (const box of model.boxes) {
            const top = projectCodeCityPoint(box.x, box.height, box.z, camera, viewport, baseScale);
            const bottom = projectCodeCityPoint(box.x, 0, box.z, camera, viewport, baseScale);
            const left = projectCodeCityPoint(box.x - box.halfWidth, box.height / 2, box.z, camera, viewport, baseScale);
            const right = projectCodeCityPoint(box.x + box.halfWidth, box.height / 2, box.z, camera, viewport, baseScale);
            const screenWidth = Math.max(Math.abs(right.x - left.x), Math.abs(top.x - bottom.x));
            const screenHeight = Math.abs(top.y - bottom.y);
            const size = Math.max(screenWidth, screenHeight);
            if (size >= MIN_LABEL_SIZE_PIXELS && onScreen(top.x, top.y)) {
                const fileName = box.id.slice(box.id.lastIndexOf("/") + 1);
                candidates.push({ label: { text: fileName, x: top.x, y: top.y, kind: "file" }, priority: size });
            }
        }
    }

    candidates.sort((first, second) => second.priority - first.priority);

    // Greedy declutter: biggest labels win their screen space, the rest
    // wait for a deeper zoom instead of piling into an unreadable cloud.
    const placed: { left: number; top: number; right: number; bottom: number }[] = [];
    const accepted: CodeCityLabel[] = [];
    for (const candidate of candidates) {
        if (accepted.length >= MAX_LABEL_COUNT) {
            break;
        }
        const halfWidth = candidate.label.text.length * LABEL_CHAR_WIDTH_PIXELS / 2;
        const rect = {
            left: candidate.label.x - halfWidth,
            top: candidate.label.y - LABEL_HEIGHT_PIXELS,
            right: candidate.label.x + halfWidth,
            bottom: candidate.label.y,
        };
        let collides = false;
        for (const other of placed) {
            if (rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top) {
                collides = true;
                break;
            }
        }
        if (!collides) {
            placed.push(rect);
            accepted.push(candidate.label);
        }
    }
    return accepted;
}
