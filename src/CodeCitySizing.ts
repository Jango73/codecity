// Shared height sizing of the standalone code-city module: the raw
// proportional height with a visibility floor, so the grid family and the
// treemap agree on what one line means before each applies its own cap.
const MIN_BOX_HEIGHT = 0.3;

// Maps a line count to a raw cuboid height: strictly proportional through
// the caller-provided per-line factor, with no widening and no ceiling, so
// area-driven layouts can double-encode size in height and footprint.
export function rawHeightForLines(lines: number, heightPerLine: number): number {
    if (lines <= 0) {
        return MIN_BOX_HEIGHT;
    }
    return Math.max(MIN_BOX_HEIGHT, lines * heightPerLine);
}
