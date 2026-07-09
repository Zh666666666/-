#!/usr/bin/env bash
set -euo pipefail

if ! pgrep -f "next dev" >/dev/null 2>&1; then
  nohup npm run dev -- --hostname 0.0.0.0 \
    > /tmp/tka-rehab-next.log 2>&1 &
fi
