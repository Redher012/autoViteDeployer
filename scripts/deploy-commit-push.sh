#!/bin/bash
# Run locally: commit all changes and push so you can pull + ./deploy.sh on the server.

set -e
cd "$(dirname "$0")/.."

MSG="${1:-deploy: fix Next.js server (port conflict + false success)}"

echo "Staging all changes..."
git add -A
echo "Commit: $MSG"
git commit -m "$MSG" || true
echo "Pushing..."
git push origin main || git push origin master
echo "Done. On the server run: ./deploy.sh"
