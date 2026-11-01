// DOM text viewer panel of the standalone code-city module: a right-side
// drawer, hidden by default, showing the clicked file scrollable in
// monospace, syntax-colored when the boot injects a highlighter. Plain DOM
// sibling of the canvas; the renderer only feeds it.
import type { CodeCityFileKind, CodeCityHighlight } from "./CodeCityTypes";

const PANEL_WIDTH_PERCENT = 35;

// Minimal dark theme for highlighter token classes, scoped to the panel
// body so the rest of the page stays untouched.
const PANEL_TOKEN_THEME = ".codecity-view{color:#e4e4e7;}.codecity-view .hljs-comment{color:#6a737d;font-style:italic;}.codecity-view .hljs-keyword{color:#c792ea;}.codecity-view .hljs-string{color:#a5d6a7;}.codecity-view .hljs-number,.codecity-view .hljs-literal{color:#f78c6c;}.codecity-view .hljs-title,.codecity-view .hljs-title.function_{color:#82aaff;}.codecity-view .hljs-type,.codecity-view .hljs-class .hljs-title{color:#ffcb6b;}.codecity-view .hljs-built_in{color:#89ddff;}.codecity-view .hljs-attr,.codecity-view .hljs-attribute{color:#c3e88d;}.codecity-view .hljs-variable,.codecity-view .hljs-template-variable{color:#f07178;}.codecity-view .hljs-operator,.codecity-view .hljs-punctuation{color:#808080;}.codecity-view .hljs-function,.codecity-view .hljs-params{color:#e4e4e7;}";

export type CodeCityPreviewFile = {
    id: string;
    kind: CodeCityFileKind;
    lines: number;
    preview: string;
    lang: string | null;
};

function styled(tag: string, css: string): HTMLElement {
    const element = document.createElement(tag);
    element.style.cssText = css;
    return element;
}

// Builds the hidden drawer once and returns its opener and closer:
// textContent keeps plain content inert, highlighter HTML is trusted from
// the injected renderer, scroll resets on every file.
export function createCodeCityPanel(highlight?: CodeCityHighlight): { open: (file: CodeCityPreviewFile) => void; close: () => void } {
    const aside = styled("aside", "position:fixed;top:0;right:0;height:100%;width:" + PANEL_WIDTH_PERCENT + "%;z-index:20;display:none;flex-direction:column;background:#111113;border-left:1px solid #27272a;color:#e4e4e7;");
    const head = styled("div", "display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #27272a;");
    const title = styled("div", "flex:1;font:12px monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;");
    const close = styled("button", "font:12px monospace;padding:2px 10px;border-radius:6px;cursor:pointer;border:1px solid #27272a;background:#111113;color:#e4e4e7;");
    close.textContent = "close ×";
    const hide = (): void => {
        aside.style.display = "none";
    };
    close.addEventListener("click", hide);
    head.appendChild(title);
    head.appendChild(close);
    const body = styled("pre", "margin:0;padding:12px;overflow:auto;flex:1;font:12px/1.5 monospace;white-space:pre;");
    body.className = "codecity-view";
    const theme = document.createElement("style");
    theme.textContent = PANEL_TOKEN_THEME;
    document.head.appendChild(theme);
    aside.appendChild(head);
    aside.appendChild(body);
    document.body.appendChild(aside);
    return {
        open: (file: CodeCityPreviewFile): void => {
            title.textContent = file.id + " — " + file.lines + " lines · " + file.kind;
            const colored = file.lang !== null && file.preview !== "" && highlight !== undefined ? safeHighlight(highlight, file.preview, file.lang) : null;
            if (colored === null) {
                body.textContent = file.preview === "" ? "(empty file or binary — no preview)" : file.preview;
            } else {
                body.innerHTML = colored;
            }
            aside.style.display = "flex";
            // Reset after layout so a long previous file never leaves the
            // new one scrolled halfway down.
            requestAnimationFrame(() => {
                body.scrollTop = 0;
            });
        },
        close: hide,
    };
}

// Runs one highlight pass with a plain-text fallback: unknown language,
// highlighter throw, or empty output all read as text, never blank.
function safeHighlight(highlight: CodeCityHighlight, code: string, lang: string): string | null {
    try {
        const html = highlight(code, lang);
        if (html === null || html === "") {
            return null;
        }
        return html;
    } catch {
        return null;
    }
}
