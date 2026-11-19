#!/bin/zsh
# Attach the companion APK that tools/mobile-relay/publish_apk.sh built to its GitHub Release, so
# phones get it without this Mac's relay: the app reads releases/latest (Updater.java) and checks
# the asset's SHA-256 before it installs.
# usage: attach_apk.sh vX.Y.Z        State: ~/.local/state/termweave-mobile-relay (apk.json)
set -eu
version=${1:?usage: attach_apk.sh vX.Y.Z}
slug=grow1023/termweave
state=${TERMWEAVE_RELAY_STATE:-$HOME/.local/state/termweave-mobile-relay}
apk=$state/termweave-companion.apk
# apk.json is what publish_apk.sh measured: never attach another version's build, or changed bytes
expected=$(python3 - "$state/apk.json" "$version" <<'PY'
import json, sys
record = json.load(open(sys.argv[1]))
if "v" + str(record.get("versionName")) != sys.argv[2]:
    raise SystemExit(f"FAIL[apk-asset]: the built APK is {record.get('versionName')}, not {sys.argv[2]}")
print(record["sha256"])
PY
)
actual=$(shasum -a 256 "$apk" | cut -d' ' -f1)
[[ $actual == $expected ]] || { print -u2 "FAIL[apk-asset]: $apk does not match apk.json"; exit 1; }
gh release upload "$version" "$apk" --repo "$slug" --clobber
# what GitHub now serves must be the bytes that were built
# the list, not releases/tags/<tag>: that one does not answer for a draft
remote=$(gh api "repos/$slug/releases?per_page=30" --jq ".[] | select(.tag_name == \"$version\") | .assets[] | select(.name == \"termweave-companion.apk\") | .digest")
[[ $remote == sha256:$expected ]] || { print -u2 "FAIL[apk-asset]: GitHub reports ${remote:-no digest}"; exit 1; }
print "PASS[apk-asset]: $version termweave-companion.apk sha256 ${expected[1,12]}"
