#!/bin/zsh
# Auto release: run by the post-commit hook in the background after every commit on main.
#   feat/fix/perf/refactor -> patch bump (feat! or BREAKING CHANGE -> minor), changelog entry,
#                             version commit, then publish with a GitHub Release
#   any other type          -> publish the code only (no version change)
# Every publish passes build_public.sh (leakscan) and the harness flow (gates/verify_github.sh).
# Kill switch: touch ~/.config/termweave/auto-release.off     Log: ~/.local/state/termweave/auto-release.log
set -uo pipefail
# git exports GIT_DIR, GIT_INDEX_FILE and friends (relative paths) to hooks; they break worktrees and nested git calls
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_PREFIX GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES 2>/dev/null
self=${0:A}
repo=${self:h:h:h}
state=${TERMWEAVE_RELEASE_STATE:-$HOME/.local/state/termweave}
log=$state/auto-release.log
lock=$state/auto-release.lock
harness=$HOME/projects/github-harness/bin/github
mkdir -p "${log:h}"
exec >>"$log" 2>&1
print "== $(date '+%F %T') commit $(git -C "$repo" rev-parse --short HEAD)"

[[ -e $HOME/.config/termweave/auto-release.off ]] && { print "skip: kill switch is on"; exit 0; }
[[ $(git -C "$repo" branch --show-current) == main ]] || { print "skip: not on main"; exit 0; }
# A SIGKILL or reboot skips the EXIT trap. The lock holds its owner's PID: a lock whose owner is gone is
# left over, a live owner keeps it however long it runs (an age limit broke slow runs). No PID yet means
# the owner is between mkdir and writing it, unless that was over a minute ago.
owner=$(cat "$lock/pid" 2>/dev/null)
if [[ -d $lock ]] && { [[ -n $owner ]] && ! kill -0 "$owner" 2>/dev/null || [[ -z $owner && -n $(find "$lock" -maxdepth 0 -mmin +1 2>/dev/null) ]]; }; then
  print "removing stale lock (owner ${owner:-unknown} is gone)"; rm -rf "$lock"
fi
# a commit during a run is not dropped: the running release starts once more for HEAD when it ends
mkdir "$lock" 2>/dev/null || { touch "$lock.again"; print "queued: another release is running; it runs again for this commit"; exit 0; }
print $$ > "$lock/pid"
# The hook's output goes to this log only, and four releases in a row stopped there unseen. Every run
# that takes the lock leaves release-status.json, and a run with a FAIL or AWAIT line posts a notification.
# TERMWEAVE_RELEASE_NOTIFY=0 keeps the notification off (tests).
start=$(wc -l < "$log")
finish() {
  local rc=$? problems
  rm -rf "$lock"
  # queued commits: one more run covers all of them, since the notes and the export take everything up to HEAD
  if [[ -e $lock.again ]]; then rm -f "$lock.again"; print "rerun: a commit arrived during this run"; nohup zsh "$self" >/dev/null 2>&1 &!; fi
  problems=$(tail -n +$((start + 1)) "$log" | grep -E '^(FAIL|AWAIT|REVIEW)' || true)
  python3 - "${log:h}/release-status.json" "$(git -C "$repo" rev-parse --short HEAD)" "${version:-}" "$rc" "$problems" <<'EOF'
import json, os, sys, datetime
path, commit, version, rc, problems = sys.argv[1:]
failed = rc != "0" or any(not line.startswith("REVIEW") for line in problems.splitlines())
result = "failed" if failed else "review" if problems else "ok"
record = {"time": datetime.datetime.now().isoformat(timespec="seconds"), "commit": commit, "version": version,
          "result": result, "exitCode": int(rc), "problems": problems.splitlines()}
json.dump(record, open(path + ".tmp", "w"), ensure_ascii=False, indent=2); os.replace(path + ".tmp", path)
EOF
  if [[ -n $problems || $rc != 0 ]] && [[ ${TERMWEAVE_RELEASE_NOTIFY:-1} != 0 ]]; then
    osascript -e 'on run a' -e 'display notification (item 1 of a) with title (item 3 of a) subtitle (item 2 of a)' -e 'end run' \
      "${${problems%%$'\n'*}:-exit $rc}" "${version:-$(git -C "$repo" rev-parse --short HEAD)} · 로그 ~/.local/state/termweave/auto-release.log" \
      "$([[ $rc != 0 || -n $(print -r -- "$problems" | grep -v '^REVIEW') ]] && print 'TermWeave 릴리스 실패' || print 'TermWeave 공개본 검토 필요')" >/dev/null 2>&1
  fi
}
trap finish EXIT

# An automatic release publishes to the release repository as it is: it never changes who can
# see it. Asked before the version bump, so an unreachable GitHub leaves no version commit behind.
visibility=$(cd "$repo/.local/public" 2>/dev/null && gh repo view --json visibility -q '.visibility | ascii_downcase' 2>/dev/null)
[[ $visibility == public || $visibility == private ]] || { print "FAIL: cannot read the release repository's visibility (gh auth status, and the origin of .local/public)"; exit 1; }

subject=$(git -C "$repo" log -1 --format=%s)
body=$(git -C "$repo" log -1 --format=%b)
bump=""
case $subject in
  chore\(release\)*) bump="" ;;
  feat!*|*"!:"*) bump=minor ;;
  feat*|fix*|perf*|refactor*) bump=patch ;;
esac
[[ $body == *"BREAKING CHANGE"* && -n $bump ]] && bump=minor

# A run that stopped after its version commit left a version with no public release. Finish that
# version with this commit instead of skipping a number. ponytail: this commit's own note is not
# added to that version's changelog entry; the release still carries the code.
current=$(python3 -c "import json;print(json.load(open('$repo/package.json'))['version'])")
public=$(gh api "repos/grow1023/termweave/releases?per_page=30" --jq "[.[] | select(.tag_name == \"v$current\" and (.draft | not))] | length" 2>/dev/null)
[[ $public == <-> ]] || { print "FAIL: cannot list the releases (gh auth status)"; exit 1; }
pending=""
if [[ $public == 0 ]]; then pending=1; bump=""; print "resume: v$current has no public release yet; this run finishes it"; fi

vfiles=(package.json shared/product.ts herdr-plugin.toml CITATION.cff CHANGELOG.termweave.md)
# the bump rewrites and restores these files: never touch them while they hold the user's own edits
if [[ -n $bump ]] && ! git -C "$repo" diff --quiet HEAD -- $vfiles; then
  print "skip bump: version files have uncommitted edits"; bump=""
fi
if [[ -n $bump ]]; then
  current=$(python3 -c "import json;print(json.load(open('$repo/package.json'))['version'])")
  next=$(python3 - "$current" "$bump" <<'EOF'
import sys
major, minor, patch = map(int, sys.argv[1].split("."))
print(f"{major}.{minor + 1}.0" if sys.argv[2] == "minor" else f"{major}.{minor}.{patch + 1}")
EOF
)
  print "bump $bump: $current -> $next"
  # every feat/fix/perf/refactor since the previous release commit goes into this version's entry
  since=$(git -C "$repo" log -1 --format=%H -E --grep='^(chore\(release\)|release): v')
  # a commit's "Release-note:" trailers (plain words for the user) replace its subject in the notes
  notes=$(git -C "$repo" log --format='%s%x1f%(trailers:key=Release-note,valueonly,separator=%x1f)' ${since:+$since..}HEAD \
    | python3 -c 'import re,sys
for line in sys.stdin.read().splitlines():
    subject, *trailers = line.split("\x1f")
    if not re.match(r"(feat|fix|perf|refactor)(\(|!|:)", subject): continue
    print("\n".join(t.strip() for t in trailers if t.strip()) or subject)')
  [[ -n $notes ]] || notes=$subject
  python3 - "$repo" "$current" "$next" "$notes" <<'EOF'
import re, sys, datetime
repo, cur, nxt, notes = sys.argv[1:]
def sub(path, pattern, repl):
    p = f"{repo}/{path}"; s = open(p).read(); t, n = re.subn(pattern, repl, s, count=1, flags=re.M)
    if n != 1: raise SystemExit(f"version not found in {path}")  # same value is fine; a missing line is not
    open(p, "w").write(t)
sub("package.json", r'"version": "[^"]+"', f'"version": "{nxt}"')
sub("shared/product.ts", r'PRODUCT_VERSION = "[^"]+"', f'PRODUCT_VERSION = "{nxt}"')
sub("herdr-plugin.toml", r'^version = "[^"]+"', f'version = "{nxt}"')
sub("CITATION.cff", r'^version: "[^"]+"', f'version: "{nxt}"')
today = datetime.date.today().isoformat()
sub("CITATION.cff", r'^date-released: "[^"]+"', f'date-released: "{today}"')
p = f"{repo}/CHANGELOG.termweave.md"; s = open(p).read()
entry = f"## [{nxt}] - {today}\n\n" + "".join(f"- {line}\n" for line in notes.splitlines() if line.strip()) + "\n"
i = s.index("## [")
open(p, "w").write(s[:i] + entry + s[i:])
EOF
  [[ $? -eq 0 ]] || { print "FAIL: version files (restored)"; git -C "$repo" checkout -q -- $vfiles; exit 1; }
  # hooks off: this version commit must not start a second release run
  # pathspec: only the version files go in, never something else the user has staged
  git -C "$repo" -c core.hooksPath=/dev/null commit -q -m "chore(release): v$next" -m "Automatic $bump release for: $subject" -- $vfiles \
    || { print "FAIL: version commit (restored)"; git -C "$repo" checkout -q -- $vfiles; exit 1; }
  version=v$next
else
  version=v$(python3 -c "import json;print(json.load(open('$repo/package.json'))['version'])")
fi

"$repo/tools/public-release/build_public.sh" --version "$version" || { print "FAIL: export or leakscan"; exit 1; }
pub=$repo/.local/public
# a new version: its release waits as a draft that already holds the APK (see stage_release.sh)
if [[ -n $bump$pending ]]; then
  "$repo/tools/public-release/stage_release.sh" "$version" || { print "FAIL: stage $version (rerun tools/public-release/stage_release.sh $version)"; exit 1; }
fi
# The harness stops each release at AWAIT[prep] until someone records a review of the export's diff.
# The record is written here from what was checked: the commits since the last release, the leakscan
# that build_public.sh just passed, and the changed files. The flow's own gates still run after it.
if [[ -f $pub/.github/github-prep.json ]]; then
  python3 "${harness:h:h}/lib/prep_contract.py" update "$pub" >/dev/null || { print "FAIL: prep update"; exit 1; }
  since_src=$(git -C "$repo" log -1 --format=%H -E --grep='^(chore\(release\)|release): v' HEAD~1 2>/dev/null)
  python3 - "$pub/.github/github-prep.json" "$(git -C "$pub" rev-parse HEAD)" "$version" \
    "$(git -C "$repo" log --format='- %s' --no-merges ${since_src:+$since_src..}HEAD | grep -v '^- chore(release)' | head -20)" <<'EOF'
import json, sys
path, head, version, commits = sys.argv[1:]
record = json.load(open(path))
review = record["diffReview"]
review["summary"] = (f"Automated review for {version} by tools/public-release/auto_release.sh. "
    f"{len(review['files'])} file(s) changed since {review['since'][:12]}. "
    "build_public.sh passed its leakscan on this export; the harness flow runs the master gate after this record. "
    "Source commits:\n" + (commits or "- (none)"))
record["reviewedHead"] = head
json.dump(record, open(path, "w"), ensure_ascii=False, indent=2); open(path, "a").write("\n")
EOF
  [[ $? -eq 0 ]] || { print "FAIL: prep record"; exit 1; }
  author_email=$(cat "$HOME/.config/termweave/public-author-email")
  git -C "$pub" add .github
  GIT_AUTHOR_NAME=VoidLight00 GIT_AUTHOR_EMAIL=$author_email GIT_COMMITTER_NAME=VoidLight00 GIT_COMMITTER_EMAIL=$author_email \
    git -C "$pub" -c core.hooksPath=/dev/null commit -q -m "docs(github): review the $version changes" || { print "FAIL: prep record commit"; exit 1; }
fi
"$harness" flow "$repo/.local/public" --profile public-full --languages en,ko,ja,zh \
  --approve-images --approve-publish --$visibility --release --approve-release || { print "FAIL: harness flow"; exit 1; }
print "PASS: published $version"
"$repo/tools/public-release/post_release_notes.sh" "$version" \
  || print "FAIL: release notes not posted (run tools/public-release/post_release_notes.sh $version)"
# the staged draft goes public last, with its notes and APK in place
if [[ -n $bump$pending ]]; then
  gh release edit "$version" --repo grow1023/termweave --draft=false --latest >/dev/null \
    && [[ $(gh api repos/grow1023/termweave/releases/latest --jq .tag_name) == $version ]] \
    && print "PASS[release-public]: $version is the latest release" \
    || { print "FAIL: publish the $version draft (gh release edit $version --draft=false --latest)"; exit 1; }
fi
# a version bump also moves the live app (launchd com.voidlight.termweave) to this release, health-checked
if [[ -n $bump$pending ]] && launchctl print gui/$(id -u)/com.voidlight.termweave >/dev/null 2>&1; then
  "$repo/tools/operations/deploy-release.sh" || { print "FAIL: live deploy (previous release kept)"; exit 1; }
fi
# report only, after the release is public: new privacy.py findings post a notification (privacy_review.sh)
[[ -n $bump$pending ]] && "$repo/tools/public-release/privacy_review.sh" "$repo/.local/public"
exit 0
