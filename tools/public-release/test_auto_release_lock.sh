#!/bin/zsh
# Lock and rerun checks for auto_release.sh with no release: an unusable token stops each run at the
# visibility check, right after the lock. State goes to a temporary directory; no notification is posted.
set -u
here=${0:A:h}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export TERMWEAVE_RELEASE_STATE=$tmp TERMWEAVE_RELEASE_NOTIFY=0 GH_TOKEN=invalid
lock=$tmp/auto-release.lock log=$tmp/auto-release.log
fails=0
check() { if eval "$2"; then print "PASS $1"; else print "FAIL $1"; fails=$((fails + 1)); fi; }

# 1. a lock left by a dead process is removed and the run goes on
mkdir "$lock"; zsh -c 'exit 0' & dead=$!; wait $dead; print $dead > "$lock/pid"
zsh "$here/auto_release.sh"
check "stale lock of a dead owner is removed" 'grep -q "removing stale lock" $log && [[ ! -e $lock ]]'
check "the run records its failure" 'grep -q "\"result\": \"failed\"" $tmp/release-status.json'

# 2. a lock held by a live process is kept, and the commit is queued
mkdir "$lock"; print $$ > "$lock/pid"
zsh "$here/auto_release.sh"
check "live lock is kept" '[[ -d $lock ]] && [[ $(cat $lock/pid) == $$ ]]'
check "the commit is queued" '[[ -e $lock.again ]] && grep -q "^queued:" $log'
rm -rf "$lock"

# 3. a run that ends with a queued commit starts once more
: > "$log"
zsh "$here/auto_release.sh"
for _ in {1..50}; do [[ $(grep -c '^== ' $log) -ge 2 && ! -e $lock ]] && break; sleep 0.2; done
check "a queued commit reruns once" 'grep -q "^rerun:" $log && [[ $(grep -c "^== " $log) == 2 && ! -e $lock.again ]]'

# 4. a fresh lock with no PID yet belongs to a run that is starting
mkdir "$lock"
zsh "$here/auto_release.sh"
check "a starting run's lock is kept" '[[ -d $lock ]] && grep -q "^queued:" $log'

(( fails == 0 )) && print "ALL PASS" || { print "$fails FAILED"; exit 1; }
