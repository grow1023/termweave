#!/bin/zsh
# Stage a version's GitHub Release as a draft that already carries the companion APK. The harness flow
# then pushes the tag and finds this release (it creates one only when none exists), and auto_release.sh
# publishes it after the notes. Immutable releases lock the assets once published, and the latest
# release must never be one without its APK, so the asset goes on before anyone can see the release.
# Safe to rerun: an APK already built for this version is reused, an asset already attached is checked.
# usage: stage_release.sh vX.Y.Z        State: ~/.local/state/termweave-mobile-relay (apk.json)
set -eu
version=${1:?usage: stage_release.sh vX.Y.Z}
here=${0:A:h}
slug=grow1023/termweave
state=${TERMWEAVE_RELAY_STATE:-$HOME/.local/state/termweave-mobile-relay}

# releases/tags/<tag> does not answer for drafts: find the release in the list
release() { gh api "repos/$slug/releases?per_page=30" --jq ".[] | select(.tag_name == \"$version\") | $1"; }

draft=$(release .draft)
if [[ -z $draft ]]; then
  gh release create "$version" --repo "$slug" --draft --title "$version" --generate-notes --target main >/dev/null
  draft=true
fi

# no Android build on this machine: the release goes out without an APK, as before
[[ -f $state/apk.json ]] || { print "PASS[stage]: $version draft (no APK on this machine)"; exit 0; }

asset=$(release '.assets[] | select(.name == "termweave-companion.apk") | .digest')
if [[ -n $asset ]]; then
  print "PASS[stage]: $version already carries termweave-companion.apk (${asset[1,19]})"; exit 0
fi
[[ $draft == true ]] || { print "FAIL[stage]: $version is published without its APK; immutable releases cannot take it now"; exit 1; }

built=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("versionName"))' "$state/apk.json")
[[ v$built == $version ]] || "${here:h}/mobile-relay/publish_apk.sh"
"$here/attach_apk.sh" "$version"
