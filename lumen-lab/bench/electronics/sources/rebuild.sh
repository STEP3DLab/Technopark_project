#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONDONTWRITEBYTECODE=1
pcb_python="${KICAD_PYTHON:-/usr/bin/python3}"
doc_python="${DOC_PYTHON:-python3}"
mkdir -p gerbers reports
"$doc_python" sources/schematic.py
"$pcb_python" sources/board.py
kicad-cli sch erc --exit-code-violations --format json -o reports/erc.json LM04B.kicad_sch
kicad-cli pcb drc --schematic-parity --all-track-errors --exit-code-violations --format json -o reports/drc.json LM04B.kicad_pcb
kicad-cli pcb drc --schematic-parity --all-track-errors --exit-code-violations -o reports/drc.txt LM04B.kicad_pcb
kicad-cli pcb export gerbers --layers F.Cu,B.Cu,F.Mask,B.Mask,F.SilkS,Edge.Cuts --use-drill-file-origin -o gerbers/ LM04B.kicad_pcb
kicad-cli pcb export drill --drill-origin plot --format excellon --excellon-separate-th --excellon-units mm -o gerbers/ LM04B.kicad_pcb
kicad-cli pcb export ipcd356 -o gerbers/LM04B.d356 LM04B.kicad_pcb
kicad-cli sch export pdf -o schematic.pdf LM04B.kicad_sch
"$pcb_python" sources/verify.py
"$doc_python" sources/manual.py
"$doc_python" sources/pack.py
