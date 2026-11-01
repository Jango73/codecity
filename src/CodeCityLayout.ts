// Isometric layout of the standalone code-city module: it nests one city
// block per directory in a recursive packing, then raises one square cuboid
// per file with a line-count height; past three times the mean height the extra
// lines spread into the footprint instead, so nothing hides and nothing
// invents.
import { buildCodeCityTree, countTreeFiles } from "./CodeCityTree";
import { districtColor, PALETTE_SHADE_FACTOR, plateColorsFor, depthOfPath, shadeHexColor, topNameOf } from "./CodeCityColors";
import { fileStyleFor } from "./CodeCityKind";
import { rawHeightForLines } from "./CodeCitySizing";
import { layoutTreemapDirectory, TREEMAP_MIN_WEIGHT_FRACTION } from "./CodeCityTreemap";
import type { CodeCityBox, CodeCityDirectoryNode, CodeCityFileSample, CodeCityLayoutKind, CodeCityModel, CodeCityPlate, CodeCityRect } from "./CodeCityTypes";

const FILE_FOOTPRINT = 2;
const STREET_WIDTH = 0.24;
const BLOCK_INSET = 0.3;
export const PLATE_HEIGHT = 0.1;
const STANDARD_BOX_HEIGHT = 4;
const TOWER_WIDEN_MULTIPLE = 3;
const TOWER_WIDEN_HEIGHT = STANDARD_BOX_HEIGHT * TOWER_WIDEN_MULTIPLE;

// Maps a line count to a cuboid height: strictly proportional through the
// caller-provided per-line factor, floored for visibility; past three times
// the mean height the extra lines spread into the footprint instead, so the
// height levels off by itself with no ceiling constant.
export function heightForLines(lines: number, heightPerLine: number): number {
    const side = footprintSideForLines(lines, heightPerLine);
    const spread = (side * side) / (FILE_FOOTPRINT * FILE_FOOTPRINT);
    return rawHeightForLines(lines, heightPerLine) / spread;
}

// Maps a line count to a square footprint side: the unit square until three times
// the mean height, then one unit step per quadrupling past it, so volumes
// keep growing with the file while the skyline stays level.
export function footprintSideForLines(lines: number, heightPerLine: number): number {
    if (lines <= 0 || lines * heightPerLine <= TOWER_WIDEN_HEIGHT) {
        return FILE_FOOTPRINT;
    }
    return FILE_FOOTPRINT * Math.ceil(Math.sqrt(lines * heightPerLine / TOWER_WIDEN_HEIGHT));
}

// Calibrates the per-line factor from the dataset mean, so the average
// file always stands at the standard height and every codebase reads the
// same, whatever its size: small utilities and giant monorepos keep
// comparable skylines instead of depending on a hardcoded factor.
export function heightPerLineForSamples(sampleCount: number, totalLines: number): number {
    if (sampleCount <= 0 || totalLines <= 0) {
        return 1;
    }
    return STANDARD_BOX_HEIGHT / (totalLines / sampleCount);
}

// Tells whether a sampled path stays out of the city: an entry matches a
// whole basename or a full relative path, so short convention lists cover
// generated manifests wherever they hide.
export function isIgnored(samplePath: string, ignore: string[]): boolean {
    const separator = samplePath.lastIndexOf("/");
    const basename = separator < 0 ? samplePath : samplePath.slice(separator + 1);
    for (const entry of ignore) {
        if (entry === basename || entry === samplePath) {
            return true;
        }
    }
    return false;
}

type PlacedChild = {
    id: string;
    weight: number;
    node: CodeCityDirectoryNode | null;
    file: CodeCityFileSample | null;
    width: number;
    depth: number;
};

function compareChildren(first: PlacedChild, second: PlacedChild): number {
    if (second.weight !== first.weight) {
        return second.weight - first.weight;
    }
    if (first.id < second.id) {
        return -1;
    }
    if (second.id < first.id) {
        return 1;
    }
    return 0;
}

function childWeight(node: CodeCityDirectoryNode | null): number {
    if (node === null) {
        return 1;
    }
    return Math.max(countTreeFiles(node), 1);
}

// Measures one directory block without placing anything: files cost one
// square cell each, subdirectories cost their measured block, and every
// column (resp. row) sizes up to its own largest child, so levels nest
// exactly without stretching small blocks to the biggest sibling.
function measureDirectory(node: CodeCityDirectoryNode, cache: Map<CodeCityDirectoryNode, { width: number; depth: number }>, kind: CodeCityLayoutKind, heightPerLine: number): { width: number; depth: number } {
    const cached = cache.get(node);
    if (cached !== undefined) {
        return cached;
    }
    const children = collectChildren(node, cache, kind, heightPerLine);
    const sizes: { width: number; depth: number }[] = [];
    for (const child of children) {
        sizes.push({ width: child.width, depth: child.depth });
    }
    if (sizes.length === 0) {
        return { width: 0, depth: 0 };
    }
    const packed = packChildren(sizes, kind);
    const measured = {
        width: packed.totalWidth + BLOCK_INSET * 2,
        depth: packed.totalDepth + BLOCK_INSET * 2,
    };
    cache.set(node, measured);
    return measured;
}

type GridGeometry = {
    columns: number;
    columnWidths: number[];
    rowDepths: number[];
    totalWidth: number;
    totalDepth: number;
    cells: { column: number; row: number }[];
};

type CellOrder = { column: number; row: number };

// Row-major cell order: the Manhattan fill, left to right, top to bottom.
function rowMajorCellOrder(columns: number, rows: number, count: number): CellOrder[] {
    void rows;
    const order: CellOrder[] = [];
    for (let index = 0; index < count; index += 1) {
        order.push({ column: index % columns, row: Math.floor(index / columns) });
    }
    return order;
}

// Spiral cell order: center outwards, so the biggest children settle
// downtown and the small ones ring the edges instead of lining a corridor.
function spiralCellOrder(columns: number, rows: number, count: number): CellOrder[] {
    void count;
    const seen: boolean[][] = [];
    for (let row = 0; row < rows; row += 1) {
        const line: boolean[] = [];
        for (let column = 0; column < columns; column += 1) {
            line.push(false);
        }
        seen.push(line);
    }
    const order: CellOrder[] = [];
    const take = (column: number, row: number): void => {
        if (column >= 0 && column < columns && row >= 0 && row < rows && !seen[row][column]) {
            seen[row][column] = true;
            order.push({ column, row });
        }
    };
    let column = Math.floor((columns - 1) / 2);
    let row = Math.floor((rows - 1) / 2);
    take(column, row);
    const steps: CellOrder[] = [{ column: 1, row: 0 }, { column: 0, row: 1 }, { column: -1, row: 0 }, { column: 0, row: -1 }];
    let direction = 0;
    let runLength = 1;
    let guard = columns * rows * 4 + 16;
    while (order.length < columns * rows && guard > 0) {
        guard -= 1;
        for (let round = 0; round < 2 && order.length < columns * rows; round += 1) {
            for (let step = 0; step < runLength && order.length < columns * rows; step += 1) {
                column += steps[direction % 4].column;
                row += steps[direction % 4].row;
                take(column, row);
            }
            direction += 1;
        }
        runLength += 1;
    }
    return order;
}

// Splits a child list into a block grid where each column (resp. row) fits
// its own largest child, so no cell stretches to an unrelated giant
// sibling. Manhattan freezes a square-root fill; grid and spiral try every
// column count and keep the squarest block, spiral filling center-out so
// districts read as downtowns instead of corridors.
function gridGeometry(sizes: { width: number; depth: number }[], kind: CodeCityLayoutKind): GridGeometry {
    if (sizes.length === 0) {
        return { columns: 0, columnWidths: [], rowDepths: [], totalWidth: 0, totalDepth: 0, cells: [] };
    }
    if (kind === "manhattan") {
        return geometryForColumns(sizes, Math.ceil(Math.sqrt(sizes.length)), rowMajorCellOrder);
    }
    let best: GridGeometry | null = null;
    let bestAspect = Infinity;
    for (let columns = 1; columns <= sizes.length; columns += 1) {
        const candidate = geometryForColumns(sizes, columns, kind === "spiral" ? spiralCellOrder : rowMajorCellOrder);
        const aspect = candidate.totalWidth > 0 && candidate.totalDepth > 0 ? Math.abs(Math.log(candidate.totalWidth / candidate.totalDepth)) : Infinity;
        if (aspect < bestAspect) {
            bestAspect = aspect;
            best = candidate;
        }
    }
    return best as GridGeometry;
}

function geometryForColumns(sizes: { width: number; depth: number }[], columns: number, orderFor: (columns: number, rows: number, count: number) => CellOrder[]): GridGeometry {
    const rows = Math.ceil(sizes.length / columns);
    const order = orderFor(columns, rows, sizes.length).slice(0, sizes.length);
    const columnWidths: number[] = [];
    for (let column = 0; column < columns; column += 1) {
        columnWidths.push(0);
    }
    const rowDepths: number[] = [];
    for (let row = 0; row < rows; row += 1) {
        rowDepths.push(0);
    }
    order.forEach((cell, index) => {
        columnWidths[cell.column] = Math.max(columnWidths[cell.column], sizes[index].width);
        rowDepths[cell.row] = Math.max(rowDepths[cell.row], sizes[index].depth);
    });
    let totalWidth = 0;
    for (const columnWidth of columnWidths) {
        totalWidth += columnWidth;
    }
    totalWidth += STREET_WIDTH * (columns - 1);
    let totalDepth = 0;
    for (const rowDepth of rowDepths) {
        totalDepth += rowDepth;
    }
    totalDepth += STREET_WIDTH * (rows - 1);
    return { columns, columnWidths, rowDepths, totalWidth, totalDepth, cells: order };
}

type PackedChildren = {
    origins: { x: number; z: number }[];
    totalWidth: number;
    totalDepth: number;
};

// Packs a child list in shelves: children queue biggest-first into rows,
// each row grows to the tallest child it holds, rows center on the widest
// one, and no column stretches to an unrelated giant, so mixed sizes nest
// without the grid's alignment waste.
function shelfGeometry(sizes: { width: number; depth: number }[]): PackedChildren {
    if (sizes.length === 0) {
        return { origins: [], totalWidth: 0, totalDepth: 0 };
    }
    let totalArea = 0;
    for (const size of sizes) {
        totalArea += size.width * size.depth;
    }
    const targetWidth = Math.sqrt(totalArea);
    const rows: number[][] = [];
    let current: number[] = [];
    let currentWidth = 0;
    sizes.forEach((size, index) => {
        const wanted = current.length === 0 ? size.width : currentWidth + STREET_WIDTH + size.width;
        if (current.length > 0 && wanted > targetWidth) {
            rows.push(current);
            current = [];
            currentWidth = 0;
        }
        current.push(index);
        currentWidth = current.length === 1 ? size.width : currentWidth + STREET_WIDTH + size.width;
    });
    if (current.length > 0) {
        rows.push(current);
    }
    const rowWidths: number[] = [];
    const rowDepths: number[] = [];
    for (const row of rows) {
        let width = 0;
        let depth = 0;
        for (const index of row) {
            width += (width === 0 ? 0 : STREET_WIDTH) + sizes[index].width;
            depth = Math.max(depth, sizes[index].depth);
        }
        rowWidths.push(width);
        rowDepths.push(depth);
    }
    let totalWidth = 0;
    for (const width of rowWidths) {
        totalWidth = Math.max(totalWidth, width);
    }
    let totalDepth = 0;
    for (const depth of rowDepths) {
        totalDepth += depth;
    }
    totalDepth += STREET_WIDTH * (rows.length - 1);
    const origins: { x: number; z: number }[] = [];
    for (let index = 0; index < sizes.length; index += 1) {
        origins.push({ x: 0, z: 0 });
    }
    let cursorZ = 0;
    rows.forEach((row, rowIndex) => {
        let cursorX = (totalWidth - rowWidths[rowIndex]) / 2;
        for (const index of row) {
            origins[index] = { x: cursorX, z: cursorZ };
            cursorX += sizes[index].width + STREET_WIDTH;
        }
        cursorZ += rowDepths[rowIndex] + STREET_WIDTH;
    });
    return { origins, totalWidth, totalDepth };
}

// Dispatches a child list to its block packing: the grid family aligns
// cells in columns and rows, the compact shelf queues them in centered
// rows with no cross-stretching.
function packChildren(sizes: { width: number; depth: number }[], kind: CodeCityLayoutKind): PackedChildren {
    if (kind === "compact") {
        return shelfGeometry(sizes);
    }
    const grid = gridGeometry(sizes, kind);
    const origins: { x: number; z: number }[] = [];
    for (let index = 0; index < sizes.length; index += 1) {
        origins.push({ x: 0, z: 0 });
    }
    const columnOffsets: number[] = [];
    let cursorX = 0;
    for (const columnWidth of grid.columnWidths) {
        columnOffsets.push(cursorX);
        cursorX += columnWidth + STREET_WIDTH;
    }
    const rowOffsets: number[] = [];
    let cursorZ = 0;
    for (const rowDepth of grid.rowDepths) {
        rowOffsets.push(cursorZ);
        cursorZ += rowDepth + STREET_WIDTH;
    }
    grid.cells.forEach((cell, index) => {
        origins[index] = {
            x: columnOffsets[cell.column] + (grid.columnWidths[cell.column] - sizes[index].width) / 2,
            z: rowOffsets[cell.row] + (grid.rowDepths[cell.row] - sizes[index].depth) / 2,
        };
    });
    return { origins, totalWidth: grid.totalWidth, totalDepth: grid.totalDepth };
}

function collectChildren(node: CodeCityDirectoryNode, cache: Map<CodeCityDirectoryNode, { width: number; depth: number }>, kind: CodeCityLayoutKind, heightPerLine: number): PlacedChild[] {
    const children: PlacedChild[] = [];
    for (const child of node.subdirectories) {
        const measured = measureDirectory(child, cache, kind, heightPerLine);
        children.push({ id: child.path, weight: childWeight(child), node: child, file: null, width: measured.width, depth: measured.depth });
    }
    for (const file of node.files) {
        const side = footprintSideForLines(file.lines, heightPerLine);
        children.push({ id: file.path, weight: 1, node: null, file, width: side, depth: side });
    }
    children.sort(compareChildren);
    return children;
}

// Places one directory block on the grid: every child centers in its cell,
// the widest child sets the column width, streets separate the cells, and
// the block grows exactly around its content, so siblings never overlap and
// every file keeps its square footprint at every nesting level.
function layoutDirectory(node: CodeCityDirectoryNode, originX: number, originZ: number, plates: CodeCityPlate[], boxes: CodeCityBox[], cache: Map<CodeCityDirectoryNode, { width: number; depth: number }>, kind: CodeCityLayoutKind, heightPerLine: number): { width: number; depth: number } {
    const children = collectChildren(node, cache, kind, heightPerLine);
    if (children.length === 0) {
        return { width: 0, depth: 0 };
    }

    const sizes = children.map((child) => ({ width: child.width, depth: child.depth }));
    const packed = packChildren(sizes, kind);

    children.forEach((child, index) => {
        const childX = originX + BLOCK_INSET + packed.origins[index].x;
        const childZ = originZ + BLOCK_INSET + packed.origins[index].z;

        if (child.node !== null && child.file === null) {
            const plate = plateColorsFor(districtColor(topNameOf(child.node.path)), depthOfPath(child.node.path));
            const placed = layoutDirectory(child.node, childX, childZ, plates, boxes, cache, kind, heightPerLine);
            plates.push({
                id: child.node.path,
                rect: { x: childX, z: childZ, width: placed.width, depth: placed.depth },
                wall: plate.wall,
                roof: plate.roof,
            });
            return;
        }
        if (child.file !== null) {
            const style = fileStyleFor(child.file.path, child.file.binary === true);
            const half = footprintSideForLines(child.file.lines, heightPerLine) / 2;
            boxes.push({
                id: child.file.path,
                kind: style.kind,
                preview: child.file.text ?? "",
                x: childX + half,
                z: childZ + half,
                halfWidth: half,
                halfDepth: half,
                height: heightForLines(child.file.lines, heightPerLine),
                lines: child.file.lines,
                wall: shadeHexColor(style.roof, PALETTE_SHADE_FACTOR),
                roof: style.roof,
            });
        }
    });

    return {
        width: packed.totalWidth + BLOCK_INSET * 2,
        depth: packed.totalDepth + BLOCK_INSET * 2,
    };
}

// Builds the full city model from raw file samples: the tree keeps the real
// folder nesting, every directory becomes a block packing, and every file
// becomes one square cuboid whose height carries the line count until three times
// the mean, past which the cuboid widens instead of rising, so the whole
// codebase stays visible with nothing hidden and nothing invented. The kind selects the block fill: grid packs the
// squarest blocks, spiral grows them center-out, manhattan keeps the fixed
// row-major fill, compact queues children biggest-first in centered rows
// with no column stretching, treemap tiles every directory by line count
// with area and height both encoding size. The ignore list drops noise files by basename
// or full path before the tree builds, so generated manifests never earn
// a tower.
export function layoutCodeCity(samples: CodeCityFileSample[], kind: CodeCityLayoutKind = "compact", ignore: string[] = []): CodeCityModel {
    const kept = samples.filter((sample) => !isIgnored(sample.path, ignore));
    const tree = buildCodeCityTree(kept);
    const plates: CodeCityPlate[] = [];
    const boxes: CodeCityBox[] = [];
    const cache = new Map<CodeCityDirectoryNode, { width: number; depth: number }>();
    let totalLines = 0;
    for (const sample of kept) {
        totalLines += sample.lines;
    }
    const heightPerLine = heightPerLineForSamples(kept.length, totalLines);
    let rootSize = { width: 0, depth: 0 };
    if (kind === "treemap") {
        const meanLines = kept.length === 0 ? 0 : totalLines / kept.length;
        const weightFloor = meanLines * TREEMAP_MIN_WEIGHT_FRACTION;
        let totalWeight = 0;
        for (const sample of kept) {
            totalWeight += Math.max(sample.lines, weightFloor);
        }
        const side = Math.sqrt(totalWeight);
        rootSize = { width: side, depth: side };
        layoutTreemapDirectory(tree, { x: 0, z: 0, width: side, depth: side }, plates, boxes, heightPerLine, weightFloor);
    } else {
        rootSize = layoutDirectory(tree, 0, 0, plates, boxes, cache, kind, heightPerLine);
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let maxHeight = 0;
    for (const box of boxes) {
        minX = Math.min(minX, box.x - box.halfWidth);
        maxX = Math.max(maxX, box.x + box.halfWidth);
        minZ = Math.min(minZ, box.z - box.halfDepth);
        maxZ = Math.max(maxZ, box.z + box.halfDepth);
        maxHeight = Math.max(maxHeight, box.height);
    }
    if (boxes.length === 0) {
        minX = 0;
        maxX = rootSize.width;
        minZ = 0;
        maxZ = rootSize.depth;
    }
    const shiftX = -(minX + maxX) / 2;
    const shiftZ = -(minZ + maxZ) / 2;
    for (const box of boxes) {
        box.x += shiftX;
        box.z += shiftZ;
    }
    for (const plate of plates) {
        plate.rect.x += shiftX;
        plate.rect.z += shiftZ;
    }

    return {
        plates,
        boxes,
        extent: { x: minX + shiftX, z: minZ + shiftZ, width: maxX - minX, depth: maxZ - minZ },
        maxHeight,
    };
}
