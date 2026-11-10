#!/bin/bash
# Make a new release of the mod.
#
#   scripts/release.sh 0.2.0            make release v0.2.0
#   scripts/release.sh 0.2.0 --dry-run  only check and show what would happen
#
# What it does, in order:
#   1. checks: on main, nothing uncommitted, version is new and higher
#   2. runs `claude plugin validate .` and `claude plugin test .`
#   3. writes the version into .claude-plugin/plugin.json and commits it
#   4. tags the commit vX.Y.Z, pushes main and the tag to GitHub
#   5. creates a GitHub release with notes listing the commits since the last one
#
# Claude Code only offers an update when this version number goes up,
# so every change you want people to get needs a release.
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION="${1:-}"
DRY=0
[ "${2:-}" = "--dry-run" ] && DRY=1
REPO="Ben-Diehlci/Claude-CodedLinesTracker"
MANIFEST=".claude-plugin/plugin.json"

fail() { echo "STOP: $*" >&2; exit 1; }

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "give a version like 0.2.0"
TAG="v$VERSION"

CURRENT=$(python3 -c "import json;print(json.load(open('$MANIFEST'))['version'])")
echo "Current version: $CURRENT  ->  new: $VERSION"

# The new version must be higher than the current one.
python3 - "$CURRENT" "$VERSION" <<'PY' || fail "$VERSION is not higher than $CURRENT"
import sys
a, b = (tuple(int(x) for x in v.split('.')) for v in sys.argv[1:3])
sys.exit(0 if b > a else 1)
PY

[ "$(git branch --show-current)" = "main" ] || fail "switch to main first"
[ -z "$(git status --porcelain)" ] || fail "there are uncommitted changes; commit them first"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && fail "tag $TAG already exists"

echo "--- Checking the mod"
claude plugin validate .
claude plugin test .

LAST=$(git describe --tags --abbrev=0 2>/dev/null || true)
echo "--- Changes since ${LAST:-the start}:"
if [ -n "$LAST" ]; then git log --oneline "$LAST"..HEAD; else git log --oneline | head -20; fi

if [ "$DRY" = 1 ]; then
  echo "--- Dry run: nothing changed. Run again without --dry-run to release $TAG."
  exit 0
fi

echo "--- Writing version $VERSION"
python3 - "$MANIFEST" "$VERSION" <<'PY'
import json, sys
path, ver = sys.argv[1:3]
data = json.load(open(path))
data['version'] = ver
open(path, 'w').write(json.dumps(data, indent=2) + '\n')
PY
git add "$MANIFEST"
git commit -m "Release $TAG"
git tag -a "$TAG" -m "Release $TAG"

echo "--- Pushing to GitHub"
git push origin main
git push origin "$TAG"

echo "--- Creating the GitHub release"
GH_TOKEN=$(gh auth token --user Ben-Diehlci) gh release create "$TAG" \
  --repo "$REPO" --title "$TAG" --generate-notes ${LAST:+--notes-start-tag "$LAST"}

echo "--- Released $TAG"
