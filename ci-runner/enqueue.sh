#!/usr/bin/env bash
# ─── CI Job Enqueue ───────────────────────────────────────────────
# Called by Soft Serve's post-receive hook.
# Writes a job file to the queue directory for the runner to pick up.
#
# Usage (from post-receive hook):
#   enqueue.sh <repo> <oldrev> <newrev> <refname>
#
# Or pipe from stdin (standard post-receive format):
#   while read oldrev newrev refname; do
#     enqueue.sh "$REPO_NAME" "$oldrev" "$newrev" "$refname"
#   done

set -euo pipefail

QUEUE_DIR="${CI_QUEUE_DIR:-${HOME}/.ci-runner/queue}"
mkdir -p "$QUEUE_DIR"

REPO="${1:-unknown}"
OLDREV="${2:-0000000000000000000000000000000000000000}"
NEWREV="${3:-HEAD}"
REFNAME="${4:-refs/heads/main}"

# Skip delete events
ZERO="0000000000000000000000000000000000000000"
if [ "$NEWREV" = "$ZERO" ]; then
  exit 0
fi

# Skip non-branch refs (tags, etc.) — optionally remove this to CI on tags too
case "$REFNAME" in
  refs/heads/*) ;; # branches — run CI
  refs/tags/*)  exit 0 ;; # tags — skip for now
  *)            exit 0 ;; # other — skip
esac

# Generate job ID
JOB_ID="$(date +%s)-$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 8)"

# Try to get commit message
COMMIT_MSG=""
if command -v git &>/dev/null; then
  COMMIT_MSG=$(git log -1 --format="%s" "$NEWREV" 2>/dev/null || echo "")
fi

# Write job file
cat > "${QUEUE_DIR}/${JOB_ID}.json" << EOF
{
  "id": "${JOB_ID}",
  "repo": "${REPO}",
  "ref": "${REFNAME}",
  "commitHash": "${NEWREV}",
  "commitMessage": "${COMMIT_MSG}",
  "pusher": "${USER:-unknown}",
  "timestamp": $(date +%s000)
}
EOF

>&2 echo "🏗️  CI job queued: ${JOB_ID} (${REPO}@${NEWREV:0:8})"
