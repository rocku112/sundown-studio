#!/bin/bash
# OCR all chapter JPGs into text files, one per photo
set -e
TESS='/c/Program Files/Tesseract-OCR/tesseract.exe'
export TESSDATA_PREFIX=/tmp/tessdata
SRC_BASE='E:/Dropbox/Carrer/證照/永續'
OUT_BASE='/f/Github/sundown-studio/learn/esg/scripts/ocr_out'

ch_name() {
  case $1 in
    1) echo '第一章';;
    2) echo '第二章';;
    3) echo '第三章';;
    4) echo '第四章';;
  esac
}

# Pre-flight: check everything up front, so a missing language pack or a
# stray filename fails here instead of 100 photos into the run.
fail=0
note() { echo "  ! $1"; fail=1; }

echo "=== pre-flight ==="
[ -x "$TESS" ] || note "tesseract not executable: $TESS"
[ -d "$TESSDATA_PREFIX" ] || note "TESSDATA_PREFIX is not a directory: $TESSDATA_PREFIX"
[ -f "$TESSDATA_PREFIX/chi_tra.traineddata" ] || note "no chi_tra.traineddata under $TESSDATA_PREFIX"
# Authoritative check: the file can exist and still not be visible to tesseract.
if [ -x "$TESS" ] && ! "$TESS" --list-langs 2>&1 | grep -qx 'chi_tra'; then
  note "tesseract cannot see chi_tra (OCR would silently produce empty files)"
fi
[ -d "$SRC_BASE" ] || note "source base not found: $SRC_BASE"

for ch in 1 2 3 4; do
  src="$SRC_BASE/$(ch_name $ch)題庫"
  out="$OUT_BASE/ch$ch"
  if [ ! -d "$src" ]; then note "ch$ch: source dir missing: $src"; continue; fi
  count=$(find "$src" -maxdepth 1 -type f -name '*.JPG' | wc -l)
  # An empty dir would leave the glob unexpanded and feed a literal '*.JPG' to tesseract.
  if [ "$count" -eq 0 ]; then note "ch$ch: no .JPG in $src"; continue; fi
  # The output name is derived from the (N) in each filename; without it the
  # printf below dies under set -e.
  bad=$(find "$src" -maxdepth 1 -type f -name '*.JPG' -printf '%f\n' | grep -cv '([0-9]\+)' || true)
  [ "$bad" -eq 0 ] || note "ch$ch: $bad filename(s) have no (N) counter"
  mkdir -p "$out"
  echo "  ch$ch: $count photos -> $out"
done

if [ "$fail" -ne 0 ]; then
  echo "pre-flight failed - nothing was OCR'd." >&2
  exit 1
fi
echo "=== pre-flight ok ==="

for ch in 1 2 3 4; do
  name=$(ch_name $ch)
  src="$SRC_BASE/${name}題庫"
  out="$OUT_BASE/ch$ch"
  count=$(ls "$src"/*.JPG 2>/dev/null | wc -l)
  echo "=== ch$ch: $count photos ==="
  i=0
  for jpg in "$src"/*.JPG; do
    i=$((i+1))
    base=$(basename "$jpg" .JPG)
    # Extract the (N) part
    num=$(echo "$base" | grep -oP '\(\K\d+')
    out_file="$out/$(printf '%03d' $num).txt"
    if [ -f "$out_file" ]; then continue; fi
    "$TESS" "$jpg" "${out_file%.txt}" -l chi_tra 2>/dev/null
    if [ $((i % 10)) -eq 0 ]; then echo "  ch$ch: $i/$count"; fi
  done
  echo "  ch$ch: done"
done
