#!/usr/bin/env bash
# package.sh — Builds a clean zip package for extensions.gnome.org (EGO)
set -euo pipefail

UUID="net-speed-monitor@pnr.tech"
BUILD_DIR="$(mktemp -d /tmp/nsm-build.XXXXXX)"
DIST_DIR="$(pwd)/dist"
ZIP_FILE="${DIST_DIR}/${UUID}.zip"

echo "=== Packaging Net Speed Monitor Extension ==="
mkdir -p "${DIST_DIR}"
rm -f "${ZIP_FILE}"

echo "1. Staging extension files into ${BUILD_DIR}..."
cp metadata.json "${BUILD_DIR}/"
cp *.js "${BUILD_DIR}/"
cp *.css "${BUILD_DIR}/"
mkdir -p "${BUILD_DIR}/schemas"
cp schemas/*.xml "${BUILD_DIR}/schemas/"

if [ -d icons ] && [ "$(ls -A icons 2>/dev/null)" ]; then
    cp -r icons "${BUILD_DIR}/"
fi

echo "2. Compiling test GSettings schema..."
glib-compile-schemas "${BUILD_DIR}/schemas/"
# Note: EGO bots compile schemas upon installation, but including schemas/ is required.

echo "3. Creating archive ${ZIP_FILE}..."
(
    cd "${BUILD_DIR}"
    zip -qr "${ZIP_FILE}" . -x "schemas/gschemas.compiled"
)

rm -rf "${BUILD_DIR}"

echo "=== Done! Package ready at: ${ZIP_FILE} ==="
ls -lh "${ZIP_FILE}"
