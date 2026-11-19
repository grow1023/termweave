#!/bin/zsh
# Report-only privacy scan of the public export (privacy.py), run after a release is public.
# privacy.py flags every test fixture, dependency notice and image, so it cannot gate a release, and
# the leakscan in build_public.sh stays the gate. This keeps a baseline of (category, path) findings and
# prints REVIEW[privacy] for findings it has not seen before: auto_release.sh then posts a notification.
# A reported finding joins the baseline, so each one is reported once.
# usage: privacy_review.sh [export dir]      Baseline: $TERMWEAVE_RELEASE_STATE/privacy-baseline.json
set -u
here=${0:A:h}
out=${1:-${here:h:h}/.local/public}
state=${TERMWEAVE_RELEASE_STATE:-$HOME/.local/state/termweave}
report=$(mktemp); trap 'rm -f "$report"' EXIT
# exit 1 only means "review required"; a report that does not parse is the failure
python3 "$here/privacy.py" "$out" > "$report" 2>/dev/null
python3 - "$report" "$state/privacy-baseline.json" <<'EOF'
import json, os, sys
report, baseline = sys.argv[1:]
try:
    findings = json.load(open(report))["findings"]
except (OSError, ValueError, KeyError) as exc:
    print(f"FAIL[privacy]: privacy.py gave no report ({exc.__class__.__name__})"); sys.exit(1)
skip = {"binary_unverified", "unsupported_artifact", "oversize_unscanned"}  # images and fonts: not text
seen = set(map(tuple, json.load(open(baseline)))) if os.path.exists(baseline) else None
current = {(f["category"], f["path"]) for f in findings if f["category"] not in skip}
if seen is None:
    print(f"PASS[privacy]: baseline recorded ({len(current)} reviewed findings)")
else:
    new = sorted(current - seen)
    for category, path in new[:10]:
        print(f"REVIEW[privacy]: new {category} in {path}")
    if not new:
        print(f"PASS[privacy]: no new findings ({len(current)} in the baseline)")
    current |= seen
json.dump(sorted(current), open(baseline + ".tmp", "w"), indent=0); os.replace(baseline + ".tmp", baseline)
EOF
