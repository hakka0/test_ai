#!/usr/bin/env bash
set -euo pipefail

# The managed relay uses the browser's loopback port 4173. Keep the official
# preview server in its own loopback namespace when commands share that network.
# The existing Sites relay carries requests between the two namespaces.
unit_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
unit_preview_root="${unit_repo_root}/.verification/unit-art-preview"

if [[ "${SITES_MANAGED_LINUX_CONTAINER:-}" != "1" ]]; then
  echo 'This helper is for the managed Linux Cloud environment.' >&2
  exit 1
fi
for unit_preview_command in sites-preview node unshare ip; do
  command -v "${unit_preview_command}" >/dev/null
done

unit_preview_status="$(sites-preview status)"
if [[ "${unit_preview_status}" == *'Sites preview running at '* ]]; then
  echo "${unit_preview_status}"
  echo 'A preview is already active. Use sites-preview stop before selecting another preview.'
  exit 0
fi

node - "${unit_repo_root}" "${unit_preview_root}" <<'NODE'
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const [repo, preview] = process.argv.slice(2);
  await fs.mkdir(path.join(preview, '.openai'), {recursive: true});
  await fs.mkdir(path.join(preview, 'dist'), {recursive: true});
  await fs.writeFile(path.join(preview, '.openai/hosting.json'), JSON.stringify({static: {directory: 'dist'}}) + '\n');
  await fs.copyFile(path.join(repo, 'public/unit-art-test.html'), path.join(preview, 'dist/index.html'));
  const link = path.join(preview, 'dist/units'), target = path.join(repo, 'public/units');
  try {
    await fs.symlink(target, link, 'dir');
  } catch (error) {
    if (error.code !== 'EEXIST' || await fs.readlink(link) !== target) throw error;
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
NODE

exec unshare --user --map-root-user --net sh -c '
  ip link set lo up
  exec sites-preview start "$1"
' unit-art-preview "${unit_preview_root}"
