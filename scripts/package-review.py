"""Build portable review archives using checksum-verified official Node runtimes.
Build-time requirements: Python 3.12+, Node 22+, network access. No third-party packages.
"""
import concurrent.futures
import hashlib
import io
import pathlib
import shutil
import subprocess
import tarfile
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'artifacts' / 'portable'
VERSION = 'v22.23.4'
BASE = f'https://nodejs.org/dist/{VERSION}/'
TARGETS = {'windows-x64': 'win-x64.zip', 'mac-apple-silicon': 'darwin-arm64.tar.gz',
           'mac-intel': 'darwin-x64.tar.gz', 'linux-x64': 'linux-x64.tar.gz'}

def download(name):
    with urllib.request.urlopen(BASE + name, timeout=90) as response:
        return response.read()

def build(item):
    label, suffix = item
    filename = f'node-{VERSION}-{suffix}'
    data = download(filename)
    if hashlib.sha256(data).hexdigest() != CHECKSUMS[filename]:
        raise RuntimeError(f'Checksum mismatch: {filename}')
    dest = OUT / f'Next-Touch-{label}'
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(ROOT / 'dist', dest / 'app')
    (dest / 'app' / 'scripts').mkdir()
    shutil.copy2(ROOT / 'scripts' / 'launch-review.mjs', dest / 'app' / 'scripts')
    shutil.copy2(ROOT / '.env.example', dest / 'agent.env.example')
    shutil.copytree(ROOT / 'docs', dest / 'docs')
    shutil.copytree(ROOT / 'deploy', dest / 'deploy')
    shutil.copy2(ROOT / 'README.md', dest / 'README.md')
    runtime = dest / 'runtime'
    runtime.mkdir()
    windows = label.startswith('windows')
    # Extract only the runtime and its license, never arbitrary archive paths.
    if windows:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            prefix = f'node-{VERSION}-win-x64/'
            (runtime / 'node.exe').write_bytes(archive.read(prefix + 'node.exe'))
            (runtime / 'LICENSE.txt').write_bytes(archive.read(prefix + 'LICENSE'))
    else:
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            prefix = filename.removesuffix('.tar.gz') + '/'
            for source, target in [('bin/node', 'node'), ('LICENSE', 'LICENSE.txt')]:
                (runtime / target).write_bytes(archive.extractfile(prefix + source).read())
        (runtime / 'node').chmod(0o755)
    if windows:
        (dest / 'Start Next Touch.cmd').write_bytes(b'@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node.exe" "app\\scripts\\launch-review.mjs"\r\nif errorlevel 1 pause\r\n')
        start = 'Start Next Touch.cmd'
    else:
        start = 'Start Next Touch.command' if label.startswith('mac') else 'start-next-touch.sh'
        launcher = dest / start
        launcher.write_text('#!/bin/sh\ncd -- "$(dirname -- "$0")" || exit 1\nexec ./runtime/node ./app/scripts/launch-review.mjs\n')
        launcher.chmod(0o755)
    (dest / 'READ ME FIRST.txt').write_text(f'''NEXT TOUCH — PORTABLE REVIEW

1. Extract the entire ZIP into a folder on your computer.
2. Open {start}.
3. Your browser opens the analysis desk automatically. If it does not, copy
   the local address printed in the launcher window into your browser.
4. Keep the launcher window open. Close it when you finish reviewing.

No Node.js installation, npm, Docker, account, API key or internet connection
is needed for the bundled replay and evidence-based analysis.

This is a portable program, not a signed installer. Your operating system
or organization may require approval to run downloaded software. Do not
turn off security protection. If execution is blocked, contact the entrant
through the submission platform for an alternative review route.

REVIEW IN THREE MINUTES
- Press Play to receive observations and events as the match progresses.
- Select a player to link the pitch, player metrics and timeline.
- Inspect defensive density and compare passing / carrying options.
- Pause and scrub the received timeline to revisit a moment.
- Open /coach-validation.html at the same local address to inspect seven
  tactical and missing-data fixtures.

DATA
Includes 10 minutes of seeded synthetic football, 22 fictional players
and 3,000 tracking frames. No external dataset or real match rights required.
Predictions are heuristic estimates, not validated performance probabilities.

AGENT LIMITATION
Evidence-based analysis is included. Free-form language-model responses
require a separately configured model service. Agent stays off until configured.
To enable: copy agent.env.example to .env in this folder, set the provider,
endpoint, deployment and credentials, then restart. Open Setup instructions
in the Agent panel for Azure and local-model options. No credentials or
model weights are distributed. Host environment credentials are ignored.
Azure hosting and inference have not been verified.

SOURCE AND DOCUMENTATION
https://github.com/zhichuanxun/next-touch-match-intelligence
Runtime: Node.js {VERSION}, distributed under its included license.
Runtime archive SHA-256: {CHECKSUMS[filename]}
''', encoding='utf-8')
    shutil.make_archive(str(dest), 'zip', OUT, dest.name)
    print(f'Built {dest.name}.zip', flush=True)
    return dest.with_suffix('.zip')

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run(['npm', 'run', 'build'], cwd=ROOT, check=True)
    CHECKSUMS = {line.split()[1]: line.split()[0] for line in download('SHASUMS256.txt').decode().splitlines()}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        archives = list(pool.map(build, TARGETS.items()))
    (OUT / 'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in archives))
