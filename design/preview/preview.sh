#!/bin/zsh
# Draws the desktop band designs and the desktop pane from the test kit into design/preview/out/mine.html,
# next to a copy of the mockup, so both can be compared in a browser (serve the out folder, dark mode).
# Usage: design/preview/preview.sh   then: python3 -m http.server 8765 --bind 127.0.0.1 -d design/preview/out
set -e
ROOT="${0:A:h:h:h}"
HERE="$ROOT/design/preview"
mkdir -p "$HERE/out"
cd "$ROOT"
python3 -c "import sys; s=open('hooks/ui.test.tsx').read(); open('hooks/zz-dump.test.tsx','w').write(s[:s.index(\"test('pane and band draw\")]+open(sys.argv[1]).read())" "$HERE/dump-test.txt"
claude plugin test . > "$HERE/out/test-output.txt" 2>&1 || true
rm -f hooks/zz-dump.test.tsx
grep -E "dump|^ [0-9]+ " "$HERE/out/test-output.txt"
python3 "$HERE/tohtml.py" "$HERE/out/test-output.txt" "$HERE/out/mine.html"
cp design/mockups-v2.html "$HERE/out/mockup.html"
echo "Wrote $HERE/out/mine.html"
