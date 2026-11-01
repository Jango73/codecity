// File-kind split of the standalone code-city module: code renders light
// gray, shell terminal green, config steel blue, plain text warm paper,
// binaries dark slate, so the building color always reads the file kind
// and only the ground plates keep district colors. Code and shell both
// earn facade windows as executable text.
// Extension-based and lowercase, plus a few well-known basenames;
// content-sniffed binaries from the builder win over every extension
// through the flag.
import type { CodeCityFileKind } from "./CodeCityTypes";

const CODE_EXTENSIONS = new Set([
    "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs",
    "py", "pyi", "java", "kt", "kts", "scala", "groovy",
    "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "cs",
    "go", "rs", "swift", "dart", "rb", "php", "pl", "pm",
    "lua", "r", "jl", "ex", "exs", "erl", "hrl",
    "ml", "mli", "hs", "clj", "cljs", "zig", "elm", "purs",
    "vue", "svelte", "astro", "html", "htm", "css", "scss", "sass", "less",
    "sql", "graphql", "gql", "proto", "tf", "glsl", "vert", "frag", "wgsl",
    "vim", "el",
]);

const SHELL_EXTENSIONS = new Set([
    "sh", "bash", "zsh", "fish", "ksh", "csh", "tcsh", "dash",
    "ps1", "psm1", "bat", "cmd",
]);

const CONFIG_EXTENSIONS = new Set([
    "json", "jsonc", "json5", "yaml", "yml", "toml", "ini", "cfg", "conf",
    "config", "env", "properties", "props", "xml", "xsd", "plist", "editorconfig",
]);

const TEXT_EXTENSIONS = new Set([
    "md", "mdx", "markdown", "txt", "rst", "adoc", "log", "csv", "tsv",
]);

const BINARY_EXTENSIONS = new Set([
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "svg",
    "woff", "woff2", "ttf", "otf", "eot",
    "pdf", "zip", "tar", "gz", "7z", "rar",
    "exe", "dll", "so", "dylib", "a", "o", "class", "jar", "war",
    "mp3", "mp4", "wav", "ogg", "mov", "sqlite", "db", "dat", "bin", "hex",
]);

const CODE_BASENAMES = new Set([
    "dockerfile", "makefile", "rakefile", "gemfile", "vagrantfile",
]);

const CONFIG_BASENAMES = new Set([
    ".babelrc", ".eslintrc", ".prettierrc", ".npmrc", ".nvmrc",
    ".gitignore", ".gitattributes", ".dockerignore", "cmakelists.txt",
]);

const TEXT_BASENAMES = new Set([
    "license", "licence", "notice", "authors", "changelog", "readme", "copying", "contributing", "todo",
]);

export const CODE_ROOF_COLOR = "#a8adb5";
export const CONFIG_ROOF_COLOR = "#5b8dd9";
export const SHELL_ROOF_COLOR = "#2fa866";
export const TEXT_ROOF_COLOR = "#e8dcc0";
export const BINARY_ROOF_COLOR = "#4e5560";

function splitName(path: string): { basename: string; extension: string | null } {
    const separator = path.lastIndexOf("/");
    const basename = (separator < 0 ? path : path.slice(separator + 1)).toLowerCase();
    const dot = basename.lastIndexOf(".");
    if (dot < 0) {
        return { basename, extension: null };
    }
    return { basename, extension: basename.slice(dot + 1) };
}

export function fileKindForPath(path: string, binary: boolean): CodeCityFileKind {
    if (binary) {
        return "binary";
    }
    const { basename, extension } = splitName(path);
    if (extension !== null && BINARY_EXTENSIONS.has(extension)) {
        return "binary";
    }
    if (CONFIG_BASENAMES.has(basename) || (extension !== null && CONFIG_EXTENSIONS.has(extension))) {
        return "config";
    }
    if (extension !== null && SHELL_EXTENSIONS.has(extension)) {
        return "shell";
    }
    if (CODE_BASENAMES.has(basename) || (extension !== null && CODE_EXTENSIONS.has(extension))) {
        return "code";
    }
    if (TEXT_BASENAMES.has(basename) || (extension !== null && TEXT_EXTENSIONS.has(extension))) {
        return "text";
    }
    return "text";
}

// Resolves the kind and roof color of one file in a single call, so call
// sites never re-spell the mapping. District stays out of it: only ground
// plates carry district colors, buildings always read their file kind.
export function fileStyleFor(path: string, binary: boolean): { kind: CodeCityFileKind; roof: string } {
    const kind = fileKindForPath(path, binary);
    switch (kind) {
        case "code":
            return { kind, roof: CODE_ROOF_COLOR };
        case "shell":
            return { kind, roof: SHELL_ROOF_COLOR };
        case "config":
            return { kind, roof: CONFIG_ROOF_COLOR };
        case "text":
            return { kind, roof: TEXT_ROOF_COLOR };
        case "binary":
            return { kind, roof: BINARY_ROOF_COLOR };
    }
}
