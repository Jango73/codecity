// District colors of the standalone code-city module: one deterministic
// earth tone per top-level folder, shared by every layout, so the same
// folder reads the same wherever it lands.
const DISTRICT_PALETTE = ["#c4956a", "#8a9e6c", "#7a8fb0", "#b0846d", "#9b8bb0", "#6d9e8f", "#b09a6d", "#9e6d6d", "#6d7f9e", "#8f9e6d", "#9e7f6d", "#6d9e9e"];
export const PALETTE_SHADE_FACTOR = 0.62;
export const PLATE_DEPTH_SHADE_STEP = 0.9;

function hashName(name: string): number {
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) {
        hash = ((hash << 5) - hash + name.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
}

function clampChannel(value: number): number {
    return Math.min(255, Math.max(0, Math.round(value)));
}

// Shades one hex color by a constant factor, so plates read as the same
// district as their cuboids while staying visibly distinct through one
// spelling instead of per-call-site arithmetic.
export function shadeHexColor(hex: string, factor: number): string {
    const red = parseInt(hex.slice(1, 3), 16);
    const green = parseInt(hex.slice(3, 5), 16);
    const blue = parseInt(hex.slice(5, 7), 16);
    return "#" + clampChannel(red * factor).toString(16).padStart(2, "0") + clampChannel(green * factor).toString(16).padStart(2, "0") + clampChannel(blue * factor).toString(16).padStart(2, "0");
}

export function districtColor(topName: string): string {
    return DISTRICT_PALETTE[hashName(topName) % DISTRICT_PALETTE.length];
}

export function topNameOf(path: string): string {
    const separator = path.indexOf("/");
    return separator < 0 ? path : path.slice(0, separator);
}

// Depth of a plate path: top-level districts sit at zero, deeper folders
// count their slashes, so the ground darkens level by level.
export function depthOfPath(path: string): number {
    if (path === "") {
        return 0;
    }
    return path.split("/").length - 1;
}

// Resolves a ground plate palette from its district and depth: the roof
// darkens one step per nesting level, the wall stays the shaded sibling,
// so depth reads directly off the ground with no extra geometry.
export function plateColorsFor(district: string, depth: number): { wall: string; roof: string } {
    const roof = shadeHexColor(district, Math.pow(PLATE_DEPTH_SHADE_STEP, depth));
    return { wall: shadeHexColor(roof, PALETTE_SHADE_FACTOR), roof };
}
