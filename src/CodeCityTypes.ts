// Shared vocabulary of the standalone code-city module: every structure the
// tree builder, the layout, the projection, the label filter, and the canvas
// renderer exchange, with no dependency outside shared/code-city/.
export type CodeCityFileSample = {
    path: string;
    lines: number;
    binary?: boolean;
    text?: string;
};

export type CodeCityDirectoryNode = {
    name: string;
    path: string;
    subdirectories: CodeCityDirectoryNode[];
    files: CodeCityFileSample[];
};

export type CodeCityRect = {
    x: number;
    z: number;
    width: number;
    depth: number;
};

export type CodeCityPlate = {
    id: string;
    rect: CodeCityRect;
    wall: string;
    roof: string;
};

export type CodeCityFileKind = "code" | "shell" | "config" | "text" | "binary";

export type CodeCityBox = {
    id: string;
    kind: CodeCityFileKind;
    preview: string;
    x: number;
    z: number;
    halfWidth: number;
    halfDepth: number;
    height: number;
    lines: number;
    wall: string;
    roof: string;
};

export type CodeCityLayoutKind = "grid" | "spiral" | "manhattan" | "compact" | "treemap";

export type CodeCityModel = {
    plates: CodeCityPlate[];
    boxes: CodeCityBox[];
    extent: CodeCityRect;
    maxHeight: number;
};

export type CodeCityCamera = {
    yawRadians: number;
    pitchRadians: number;
    zoom: number;
    panXPixels: number;
    panYPixels: number;
};

export type CodeCityViewport = {
    widthPixels: number;
    heightPixels: number;
};

export type CodeCityScreenPoint = {
    x: number;
    y: number;
    depth: number;
};

export type CodeCityLabel = {
    text: string;
    x: number;
    y: number;
    kind: "directory" | "file";
};

// Renders highlighted HTML for one file, or null to fall back to plain
// text. Lives outside the module so src/ never depends on a highlighter:
// the viewer boot injects the real one, tests inject nothing.
export type CodeCityHighlight = (code: string, lang: string) => string | null;

export type CodeCityRenderHooks = {
    langOf?: (path: string) => string | null;
    highlight?: CodeCityHighlight;
};
