#!/bin/sh
# CodeCity launcher: installs dependencies when missing, builds the offline
# city for any codebase, and opens it in the browser. Re-running rebuilds
# from current sources; pass --no-open to build without opening.
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

PATH_ARG=""
LAYOUT_ARG="compact"
OPEN_ARG="1"
while [ $# -gt 0 ]; do
    case "$1" in
        --path)
            PATH_ARG="${2:?--path needs a directory}"
            shift 2
            ;;
        --layout)
            LAYOUT_ARG="${2:?--layout needs grid, spiral, manhattan or compact}"
            shift 2
            ;;
        --no-open)
            OPEN_ARG="0"
            shift
            ;;
        --help)
            echo "usage: run.sh [--path <directory>] [--layout grid|spiral|manhattan|compact|treemap] [--no-open]"
            exit 0
            ;;
        *)
            if [ -z "$PATH_ARG" ]; then
                PATH_ARG="$1"
                shift
            else
                echo "unknown argument: $1 (see --help)" >&2
                exit 1
            fi
            ;;
    esac
done
command -v node >/dev/null 2>&1 || { echo "node is required but missing" >&2; exit 1; }
case "$LAYOUT_ARG" in
    grid|spiral|manhattan|compact|treemap) ;;
    *) echo "unknown layout: $LAYOUT_ARG" >&2; exit 1 ;;
esac
if [ ! -d "$HERE/node_modules" ]; then
    (cd "$HERE" && npm install)
fi

TARGET="$PATH_ARG"
if [ -z "$TARGET" ]; then
    TARGET="$HERE/src"
fi
CITY=$(node "$HERE/tools/build-city.mjs" "$TARGET" "$LAYOUT_ARG" | sed -n 's/.* -> //p')
echo "open $CITY"
if [ "$OPEN_ARG" = "1" ]; then
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$CITY"
    elif command -v open >/dev/null 2>&1; then
        open "$CITY"
    else
        echo "no opener found (xdg-open/open)" >&2
    fi
fi
