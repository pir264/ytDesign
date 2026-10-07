#!/usr/bin/env bash
# Copies the newest signed build to the TV computer and restarts Firefox there.
# Usage: npm run deploy -- <ssh-host>      e.g.  npm run deploy -- mint
#
# One-time setup on the TV computer, so no sudo is needed here:
#   sudo chown -R "$USER" /opt/youtube-tv
set -euo pipefail

host=${1:?usage: npm run deploy -- <ssh-host>}
xpi=$(ls -t artifacts/*.xpi 2>/dev/null | head -1 || true)
if [ -z "$xpi" ]; then
  echo "No signed .xpi in artifacts/; run npm run sign first." >&2
  exit 1
fi

echo "Copying $xpi to $host"
scp "$xpi" "$host:/opt/youtube-tv/youtube-tv.xpi"

# Firefox (policies.json) reinstalls the extension when the file at its install_url has changed,
# so a restart is enough. Start it again in the TV's screen session.
echo "Restarting Firefox on $host"
ssh "$host" 'pkill firefox; for i in $(seq 20); do pgrep firefox >/dev/null || break; sleep 0.5; done
  DISPLAY=:0 setsid -f firefox --kiosk https://www.youtube.com/ >/dev/null 2>&1'
echo "Done."
