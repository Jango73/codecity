#!/bin/sh
# CodeCity dependency installer (Linux/macOS).
# Installs the project's npm dependencies into node_modules.
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

command -v node >/dev/null 2>&1 || { echo "node is required but missing" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required but missing" >&2; exit 1; }

cd "$HERE"
npm install
echo "Dependencies installed in $HERE/node_modules"
