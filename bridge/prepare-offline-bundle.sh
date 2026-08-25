#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR="${1:-dist/wheelhouse}"
mkdir -p "${OUTPUT_DIR}"
python3 -m pip download --dest "${OUTPUT_DIR}" -r requirements.txt
echo "Wheelhouse offline criado em ${OUTPUT_DIR}."
