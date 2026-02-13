#!/bin/bash

# Setup cron job for cleaning up expired demo deployments and orphaned files
# This script adds a cron job that runs every 5 minutes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Get the port from environment or default to 3000
PORT=${PORT:-3000}

# Get the base URL (default to localhost, but can be overridden)
BASE_URL=${BASE_URL:-"http://localhost:${PORT}"}

# Cleanup endpoint URL
CLEANUP_URL="${BASE_URL}/api/demo/cleanup"

echo "Setting up cleanup cron job..."
echo "Cleanup URL: ${CLEANUP_URL}"
echo ""

# Create the cron job entry
CRON_JOB="*/5 * * * * curl -X GET '${CLEANUP_URL}' > /dev/null 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "api/demo/cleanup"; then
    echo "⚠️  Cleanup cron job already exists!"
    echo ""
    echo "Current cron jobs:"
    crontab -l 2>/dev/null | grep "api/demo/cleanup"
    echo ""
    read -p "Do you want to replace it? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled. No changes made."
        exit 0
    fi
    # Remove existing cleanup cron job
    crontab -l 2>/dev/null | grep -v "api/demo/cleanup" | crontab -
fi

# Add the new cron job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Cleanup cron job added successfully!"
echo ""
echo "The cron job will run every 5 minutes and:"
echo "  - Remove expired demo deployments (older than 30 minutes)"
echo "  - Clean up orphaned upload files (not referenced by any deployment)"
echo ""
echo "To view your cron jobs, run: crontab -l"
echo "To remove this cron job, run: crontab -e (then delete the line)"
echo ""
echo "To test the cleanup endpoint manually, run:"
echo "  curl -X GET '${CLEANUP_URL}'"
