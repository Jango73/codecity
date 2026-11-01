// Dynamic camera of the standalone code-city module: yaw and pitch orbit,
// wheel zoom, and pixel pan feed one orthographic projection, so the view
// never bakes a fixed angle and rotation stays adjustable at all times. The
// rotation itself lives here alone, never re-spelled at call sites.
import type { CodeCityCamera, CodeCityScreenPoint, CodeCityViewport } from "./CodeCityTypes";

const FULL_CIRCLE_RADIANS = Math.PI * 2;
const PITCH_CLAMP_RADIANS = Math.PI / 2 - 0.02;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 40;
const DRAG_RADIANS_PER_PIXEL = 0.008;
const WHEEL_ZOOM_BASE = 1.0015;
const DEFAULT_YAW_RADIANS = -0.785;
const DEFAULT_PITCH_RADIANS = 0.62;
const DEFAULT_ZOOM = 1;

function wrapRadians(angle: number): number {
    let wrapped = angle % FULL_CIRCLE_RADIANS;
    if (wrapped > Math.PI) {
        wrapped -= FULL_CIRCLE_RADIANS;
    }
    if (wrapped < -Math.PI) {
        wrapped += FULL_CIRCLE_RADIANS;
    }
    return wrapped;
}

export function createCodeCityCamera(): CodeCityCamera {
    return { yawRadians: DEFAULT_YAW_RADIANS, pitchRadians: DEFAULT_PITCH_RADIANS, zoom: DEFAULT_ZOOM, panXPixels: 0, panYPixels: 0 };
}

// Orbits the camera by a drag vector: horizontal pixels turn the yaw around
// world up, vertical pixels tilt the pitch, clamped before the pole, so the
// city never flips upside down mid-drag.
export function rotateCodeCityCamera(camera: CodeCityCamera, deltaXPixels: number, deltaYPixels: number): void {
    camera.yawRadians = wrapRadians(camera.yawRadians + deltaXPixels * DRAG_RADIANS_PER_PIXEL);
    const pitched = camera.pitchRadians + deltaYPixels * DRAG_RADIANS_PER_PIXEL;
    camera.pitchRadians = Math.min(PITCH_CLAMP_RADIANS, Math.max(-PITCH_CLAMP_RADIANS, pitched));
}

// Zooms the camera around the cursor-agnostic center: one exponential
// spelling shared by every wheel handler, bounded so the city can neither
// vanish nor explode past float comfort.
export function zoomCodeCityCamera(camera: CodeCityCamera, wheelDelta: number): void {
    const zoomed = camera.zoom * Math.pow(WHEEL_ZOOM_BASE, -wheelDelta);
    camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomed));
}

// Pans the camera across the canvas in screen pixels, independent of zoom,
// so navigation keeps its grab feel at every magnification.
export function panCodeCityCamera(camera: CodeCityCamera, deltaXPixels: number, deltaYPixels: number): void {
    camera.panXPixels += deltaXPixels;
    camera.panYPixels += deltaYPixels;
}

const GROUND_UNPROJECT_MIN_SIN_PITCH = 0.05;

// Recovers the ground-plane world point shown at one screen pixel: the
// inverse of the projection for y = 0, so orbiting and picking can anchor
// on the content instead of the world origin. Returns null when the
// camera looks too level for a stable answer.
export function groundPointAtScreen(camera: CodeCityCamera, screenXPixels: number, screenYPixels: number, viewport: CodeCityViewport, baseScale: number): { x: number; z: number } | null {
    const sinPitch = Math.sin(camera.pitchRadians);
    if (Math.abs(sinPitch) < GROUND_UNPROJECT_MIN_SIN_PITCH) {
        return null;
    }
    const scale = baseScale * camera.zoom;
    const centerXPixels = viewport.widthPixels / 2;
    const centerYPixels = viewport.heightPixels / 2;
    const yawedX = (screenXPixels - centerXPixels - camera.panXPixels) / scale;
    const yawedZ = (screenYPixels - centerYPixels - camera.panYPixels) / (scale * sinPitch);
    const cosYaw = Math.cos(camera.yawRadians);
    const sinYaw = Math.sin(camera.yawRadians);
    return { x: yawedX * cosYaw - yawedZ * sinYaw, z: yawedX * sinYaw + yawedZ * cosYaw };
}

// Orbits around the content under the screen center instead of the world
// origin: it remembers the ground point centered before turning, rotates,
// then re-pans it back to the middle, so the city turns in place instead
// of swinging around a far pivot.
export function orbitCodeCityCamera(camera: CodeCityCamera, deltaXPixels: number, deltaYPixels: number, viewport: CodeCityViewport, baseScale: number): void {
    const centerXPixels = viewport.widthPixels / 2;
    const centerYPixels = viewport.heightPixels / 2;
    const anchor = groundPointAtScreen(camera, centerXPixels, centerYPixels, viewport, baseScale);
    rotateCodeCityCamera(camera, deltaXPixels, deltaYPixels);
    if (anchor === null) {
        return;
    }
    const cosYaw = Math.cos(camera.yawRadians);
    const sinYaw = Math.sin(camera.yawRadians);
    const yawedX = anchor.x * cosYaw + anchor.z * sinYaw;
    const yawedZ = -anchor.x * sinYaw + anchor.z * cosYaw;
    const scale = baseScale * camera.zoom;
    camera.panXPixels = centerXPixels - (centerXPixels + yawedX * scale);
    camera.panYPixels = centerYPixels - (centerYPixels - (-yawedZ * Math.sin(camera.pitchRadians)) * scale);
}

// Zooms toward one screen pixel instead of the screen center: the world
// point under the cursor keeps its screen position, so zooming never pans
// the view away. Pure arithmetic on the camera, no canvas anywhere.
export function zoomCodeCityCameraToward(camera: CodeCityCamera, wheelDelta: number, pivotXPixels: number, pivotYPixels: number, centerXPixels: number, centerYPixels: number): void {
    const previousZoom = camera.zoom;
    zoomCodeCityCamera(camera, wheelDelta);
    if (previousZoom <= 0) {
        return;
    }
    const ratio = camera.zoom / previousZoom;
    camera.panXPixels = pivotXPixels - centerXPixels - (pivotXPixels - centerXPixels - camera.panXPixels) * ratio;
    camera.panYPixels = pivotYPixels - centerYPixels - (pivotYPixels - centerYPixels - camera.panYPixels) * ratio;
}

// Projects one world point to screen pixels: yaw around world up, then
// pitch around world right, then the orthographic drop keeps x and y while
// depth survives for painter ordering. Fits one canvas through the base
// scale derived from the city extent, so the whole city starts framed.
export function projectCodeCityPoint(
    x: number,
    y: number,
    z: number,
    camera: CodeCityCamera,
    viewport: CodeCityViewport,
    baseScale: number
): CodeCityScreenPoint {
    const cosYaw = Math.cos(camera.yawRadians);
    const sinYaw = Math.sin(camera.yawRadians);
    const yawedX = x * cosYaw + z * sinYaw;
    const yawedZ = -x * sinYaw + z * cosYaw;
    const cosPitch = Math.cos(camera.pitchRadians);
    const sinPitch = Math.sin(camera.pitchRadians);
    const pitchedY = y * cosPitch - yawedZ * sinPitch;
    const pitchedDepth = y * sinPitch + yawedZ * cosPitch;
    const scale = baseScale * camera.zoom;
    return {
        x: viewport.widthPixels / 2 + yawedX * scale + camera.panXPixels,
        y: viewport.heightPixels / 2 - pitchedY * scale + camera.panYPixels,
        depth: pitchedDepth,
    };
}

// Derives the base scale fitting a city extent into a viewport with a fixed
// margin, so every fresh camera frames the whole city before the first
// zoom gesture.
export function baseScaleForExtent(extentWidth: number, extentDepth: number, viewport: CodeCityViewport, marginFraction: number): number {
    const usableWidth = viewport.widthPixels * (1 - marginFraction);
    const usableHeight = viewport.heightPixels * (1 - marginFraction);
    if (extentWidth <= 0 || extentDepth <= 0) {
        return 1;
    }
    return Math.min(usableWidth / extentWidth, usableHeight / extentDepth);
}

// Derives the base scale framing the whole city including its towers: the
// ground diamond spans depth times sine of pitch, the tallest cuboid adds
// its height times cosine, so the default view never beheads the skyline.
// Pass a stable framing camera, never the live one: refitting on every
// pitch change would dilate the city while orbiting.
export function fitScaleForCity(extentWidth: number, extentDepth: number, maxHeight: number, camera: CodeCityCamera, viewport: CodeCityViewport, marginFraction: number): number {
    const usableWidth = viewport.widthPixels * (1 - marginFraction);
    const usableHeight = viewport.heightPixels * (1 - marginFraction);
    const verticalSpan = extentDepth * Math.abs(Math.sin(camera.pitchRadians)) + maxHeight * Math.abs(Math.cos(camera.pitchRadians));
    if (extentWidth <= 0 || verticalSpan <= 0) {
        return 1;
    }
    return Math.min(usableWidth / extentWidth, usableHeight / verticalSpan);
}
