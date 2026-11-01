import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import shell from "highlight.js/lib/languages/shell";
import powershell from "highlight.js/lib/languages/powershell";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import ini from "highlight.js/lib/languages/ini";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import makefile from "highlight.js/lib/languages/makefile";
import sql from "highlight.js/lib/languages/sql";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import java from "highlight.js/lib/languages/java";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import { layoutCodeCity } from "../src/CodeCityLayout.js";
import { renderCodeCity } from "../src/CodeCityCanvas.js";
import { CITY_IGNORE, CITY_KIND, CITY_SAMPLES } from "../output/city-data.mjs";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("json", json);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("makefile", makefile);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("java", java);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);

// Maps a file path to a registered highlight.js language, or null for
// plain text. Extension first, known basenames second, so Dockerfile and
// Makefile resolve without extensions.
function langOf(path) {
    const base = path.slice(path.lastIndexOf("/") + 1);
    if (base === "Dockerfile" || base.startsWith("Dockerfile.")) {
        return "dockerfile";
    }
    if (base === "Makefile" || base === "makefile" || base === "CMakeLists.txt") {
        return "makefile";
    }
    const dot = base.lastIndexOf(".");
    const ext = dot < 0 ? "" : base.slice(dot + 1).toLowerCase();
    const byExt = {
        ts: "typescript",
        tsx: "typescript",
        mts: "typescript",
        cts: "typescript",
        js: "javascript",
        jsx: "javascript",
        mjs: "javascript",
        cjs: "javascript",
        json: "json",
        py: "python",
        sh: "bash",
        bash: "bash",
        zsh: "bash",
        ps1: "powershell",
        yml: "yaml",
        yaml: "yaml",
        md: "markdown",
        markdown: "markdown",
        xml: "xml",
        html: "xml",
        htm: "xml",
        svg: "xml",
        vue: "xml",
        css: "css",
        scss: "css",
        less: "css",
        ini: "ini",
        toml: "ini",
        cfg: "ini",
        env: "ini",
        sql: "sql",
        c: "c",
        h: "c",
        cpp: "cpp",
        cxx: "cpp",
        cc: "cpp",
        hpp: "cpp",
        hxx: "cpp",
        cs: "csharp",
        java: "java",
        go: "go",
        rs: "rust",
    };
    const lang = byExt[ext] ?? null;
    return lang !== null && hljs.getLanguage(lang) !== undefined ? lang : null;
}

function highlight(code, lang) {
    try {
        return hljs.highlight(code, { language: lang }).value;
    } catch {
        return null;
    }
}

const KINDS = ["grid", "spiral", "manhattan", "compact", "treemap"];
const params = new URLSearchParams(location.search);
const requested = params.get("kind");
const kind = KINDS.includes(requested) ? requested : CITY_KIND;

const bar = document.createElement("div");
bar.style.cssText = "position:fixed;top:10px;left:10px;z-index:10;display:flex;gap:6px;";
for (const option of KINDS) {
    const button = document.createElement("button");
    button.textContent = option;
    button.style.cssText = "font:12px monospace;padding:4px 10px;border-radius:6px;cursor:pointer;border:1px solid #27272a;background:" + (option === kind ? "#00d4aa" : "#111113") + ";color:" + (option === kind ? "#111113" : "#e4e4e7") + ";";
    button.addEventListener("click", () => {
        params.set("kind", option);
        location.search = params.toString();
    });
    bar.appendChild(button);
}
document.body.appendChild(bar);

const nightOn = params.get("night") === "1";
const nightButton = document.createElement("button");
nightButton.textContent = "night";
nightButton.style.cssText = "font:12px monospace;padding:4px 10px;border-radius:6px;cursor:pointer;border:1px solid #27272a;background:" + (nightOn ? "#00d4aa" : "#111113") + ";color:" + (nightOn ? "#111113" : "#e4e4e7") + ";";
nightButton.addEventListener("click", () => {
    if (nightOn) {
        params.delete("night");
    } else {
        params.set("night", "1");
    }
    location.search = params.toString();
});
bar.appendChild(nightButton);

const model = layoutCodeCity(CITY_SAMPLES, kind, CITY_IGNORE);
const canvas = document.getElementById("city");
renderCodeCity(canvas, model, { langOf, highlight });
