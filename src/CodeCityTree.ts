// Directory tree builder of the standalone code-city module: it folds a flat
// file sample list into the nested folder structure the layout nests as city
// blocks, inventing nothing and sorting everything, so the same input always
// yields the same tree.
import type { CodeCityDirectoryNode, CodeCityFileSample } from "./CodeCityTypes";

const PATH_SEPARATOR = "/";
const ROOT_NAME = ".";
const ROOT_PATH = "";

function compareSamples(first: CodeCityFileSample, second: CodeCityFileSample): number {
    if (first.path < second.path) {
        return -1;
    }
    if (first.path > second.path) {
        return 1;
    }
    return 0;
}

function findSubdirectory(node: CodeCityDirectoryNode, name: string): CodeCityDirectoryNode | null {
    for (const child of node.subdirectories) {
        if (child.name === name) {
            return child;
        }
    }
    return null;
}

function countFiles(node: CodeCityDirectoryNode): number {
    let total = node.files.length;
    for (const child of node.subdirectories) {
        total += countFiles(child);
    }
    return total;
}

function compareNodes(first: CodeCityDirectoryNode, second: CodeCityDirectoryNode): number {
    if (first.name < second.name) {
        return -1;
    }
    if (first.name > second.name) {
        return 1;
    }
    return 0;
}

function sortTree(node: CodeCityDirectoryNode): void {
    node.files.sort(compareSamples);
    node.subdirectories.sort(compareNodes);
    for (const child of node.subdirectories) {
        sortTree(child);
    }
}

// Builds the nested directory tree mirror of the sampled paths: every path
// segment becomes (or reuses) one block level, files rest on their parent,
// and the whole tree sorts by name, so layout order stays deterministic.
export function buildCodeCityTree(samples: CodeCityFileSample[]): CodeCityDirectoryNode {
    const root: CodeCityDirectoryNode = { name: ROOT_NAME, path: ROOT_PATH, subdirectories: [], files: [] };

    for (const sample of samples) {
        const segments = sample.path.split(PATH_SEPARATOR);
        let node = root;
        let prefix = ROOT_PATH;
        for (let index = 0; index < segments.length - 1; index += 1) {
            const segment = segments[index];
            prefix = prefix === ROOT_PATH ? segment : prefix + PATH_SEPARATOR + segment;
            let child = findSubdirectory(node, segment);
            if (child === null) {
                child = { name: segment, path: prefix, subdirectories: [], files: [] };
                node.subdirectories.push(child);
            }
            node = child;
        }
        node.files.push(sample);
    }

    sortTree(root);
    return root;
}

// Counts every file sample under a directory node, subdirectories included,
// so the layout weighs each block by its real content instead of inventing
// a size.
export function countTreeFiles(node: CodeCityDirectoryNode): number {
    return countFiles(node);
}
