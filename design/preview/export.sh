#!/bin/zsh
# Redraws the bands, the pane, every outfit and some stage scenes with sample numbers and saves them
# as the README's pictures in docs/images/. Run it after a visual change, then commit docs/images.
set -e
ROOT="${0:A:h:h:h}"
HERE="$ROOT/design/preview"
cd "$ROOT"
"$HERE/preview.sh" > /dev/null
cp "$HERE/docs-test.txt" hooks/zz-docs.test.ts
claude plugin test . > "$HERE/out/docs-output.txt" 2>&1 || true
rm -f hooks/zz-docs.test.ts
grep -E "docs pictures|^ [0-9]+ " "$HERE/out/docs-output.txt"
python3 "$HERE/export.py" "$HERE/out/test-output.txt" "$HERE/out/docs-output.txt" "$ROOT/docs/images"
