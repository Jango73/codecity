// Squarified treemap of the standalone code-city module: where every directory
// tiles its rectangle with children sized by
// line count instead of sharing one square footprint. Area and raw height
// both encode size, folders read as nested frames, and a weight floor keeps
// tiny files visible as small tiles instead of vanishing slivers.
import { districtColor, PALETTE_SHADE_FACTOR, plateColorsFor, depthOfPath, shadeHexColor, topNameOf } from "./CodeCityColors";
import { fileStyleFor } from "./CodeCityKind";
import { rawHeightForLines } from "./CodeCitySizing";
import type { CodeCityBox, CodeCityDirectoryNode, CodeCityFileSample, CodeCityPlate, CodeCityRect } from "./CodeCityTypes";

const TREEMAP_DIR_INSET = 0.3;
export const TREEMAP_MIN_WEIGHT_FRACTION = 0.05;

type TreemapChild = {
    id: string;
    weight: number;
    node: CodeCityDirectoryNode | null;
    file: CodeCityFileSample | null;
};

function subtreeWeight(node: CodeCityDirectoryNode, weightFloor: number): number {
    let total = 0;
    for (const file of node.files) {
        total += Math.max(file.lines, weightFloor);
    }
    for (const child of node.subdirectories) {
        total += subtreeWeight(child, weightFloor);
    }
    return total;
}

// Scores one candidate row: the worst aspect ratio its tiles would take,
// so the greedy fill keeps every tile close to a square.
function rowWorst(row: number[], rowSum: number, side: number): number {
    let largest = 0;
    let smallest = Infinity;
    for (const weight of row) {
        largest = Math.max(largest, weight);
        smallest = Math.min(smallest, weight);
    }
    if (smallest <= 0) {
        return Infinity;
    }
    const squared = side * side;
    const scaled = rowSum * rowSum;
    return Math.max((squared * largest) / scaled, scaled / (squared * smallest));
}

// Splits one rectangle into exact tiles weighing the given shares, biggest
// first in squarish rows, the last tile of every row snapping to the edge
// so no rounding gap survives between siblings.
export function squarifyTiles(weights: number[], rect: CodeCityRect): CodeCityRect[] {
    const tiles: CodeCityRect[] = weights.map(() => ({ x: rect.x, z: rect.z, width: 0, depth: 0 }));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) {
        const share = weights.length === 0 ? 0 : rect.width / weights.length;
        tiles.forEach((tile, index) => {
            tile.x = rect.x + share * index;
            tile.z = rect.z;
            tile.width = index === tiles.length - 1 ? rect.x + rect.width - tile.x : share;
            tile.depth = rect.depth;
        });
        return tiles;
    }
    const ranked = weights.map((weight, index) => ({ index, weight })).sort((first, second) => second.weight - first.weight);
    let rest = { x: rect.x, z: rect.z, width: rect.width, depth: rect.depth };
    let restWeight = total;
    let row: { index: number; weight: number }[] = [];
    let rowSum = 0;
    const layRow = (): void => {
        const horizontal = rest.width >= rest.depth;
        const longSide = Math.max(rest.width, rest.depth);
        const shortSide = Math.min(rest.width, rest.depth);
        const lastRow = restWeight - rowSum <= 0;
        const thickness = lastRow ? shortSide : (rowSum / restWeight) * shortSide;
        let cursor = 0;
        row.forEach((item, position) => {
            const length = position === row.length - 1 ? longSide - cursor : (item.weight / rowSum) * longSide;
            if (horizontal) {
                tiles[item.index] = { x: rest.x + cursor, z: rest.z, width: length, depth: thickness };
            } else {
                tiles[item.index] = { x: rest.x, z: rest.z + cursor, width: thickness, depth: length };
            }
            cursor += length;
        });
        if (horizontal) {
            rest = { x: rest.x, z: rest.z + thickness, width: rest.width, depth: rest.depth - thickness };
        } else {
            rest = { x: rest.x + thickness, z: rest.z, width: rest.width - thickness, depth: rest.depth };
        }
        restWeight -= rowSum;
        row = [];
        rowSum = 0;
    };
    for (const item of ranked) {
        const candidate = [...row.map((entry) => entry.weight), item.weight];
        const candidateSum = rowSum + item.weight;
        const side = Math.max(rest.width, rest.depth);
        if (row.length > 0 && rowWorst(candidate, candidateSum, side) > rowWorst(row.map((entry) => entry.weight), rowSum, side)) {
            layRow();
        }
        row.push(item);
        rowSum += item.weight;
    }
    if (row.length > 0) {
        layRow();
    }
    return tiles;
}

// Tiles one directory: subdirectories earn nested frames, files earn cuboids
// sized by share with raw proportional heights, so area and height agree.
export function layoutTreemapDirectory(node: CodeCityDirectoryNode, rect: CodeCityRect, plates: CodeCityPlate[], boxes: CodeCityBox[], heightPerLine: number, weightFloor: number): void {
    const children: TreemapChild[] = [];
    for (const child of node.subdirectories) {
        children.push({ id: child.path, weight: subtreeWeight(child, weightFloor), node: child, file: null });
    }
    for (const file of node.files) {
        children.push({ id: file.path, weight: Math.max(file.lines, weightFloor), node: null, file });
    }
    if (children.length === 0) {
        return;
    }
    children.sort((first, second) => second.weight - first.weight || (first.id < second.id ? -1 : 1));
    // Directories frame their children with an inset gutter, unless the tile
    // is already smaller than the frame itself: then the children take the
    // whole tile instead of collapsing into a zero-area stack.
    const fitsFrame = rect.width > TREEMAP_DIR_INSET * 2 && rect.depth > TREEMAP_DIR_INSET * 2;
    const inner: CodeCityRect = fitsFrame
        ? { x: rect.x + TREEMAP_DIR_INSET, z: rect.z + TREEMAP_DIR_INSET, width: rect.width - TREEMAP_DIR_INSET * 2, depth: rect.depth - TREEMAP_DIR_INSET * 2 }
        : { x: rect.x, z: rect.z, width: rect.width, depth: rect.depth };
    const tiles = squarifyTiles(children.map((child) => child.weight), inner);
    children.forEach((child, index) => {
        const tile = tiles[index];
        if (child.node !== null && child.file === null) {
            const plate = plateColorsFor(districtColor(topNameOf(child.node.path)), depthOfPath(child.node.path));
            layoutTreemapDirectory(child.node, tile, plates, boxes, heightPerLine, weightFloor);
            plates.push({
                id: child.node.path,
                rect: { x: tile.x, z: tile.z, width: tile.width, depth: tile.depth },
                wall: plate.wall,
                roof: plate.roof,
            });
            return;
        }
        if (child.file !== null) {
            const style = fileStyleFor(child.file.path, child.file.binary === true);
            boxes.push({
                id: child.file.path,
                kind: style.kind,
                preview: child.file.text ?? "",
                x: tile.x + tile.width / 2,
                z: tile.z + tile.depth / 2,
                halfWidth: tile.width / 2,
                halfDepth: tile.depth / 2,
                height: rawHeightForLines(child.file.lines, heightPerLine),
                lines: child.file.lines,
                wall: shadeHexColor(style.roof, PALETTE_SHADE_FACTOR),
                roof: style.roof,
            });
        }
    });
}
