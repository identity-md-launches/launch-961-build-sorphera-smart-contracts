#!/usr/bin/env python3
"""Hash delivered source, interfaces, tools and unchanged offline build inputs. No git writes."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
paths = []
for directory in ("src", "script", "test", "integration", "tools", "ops", "deployments", "frontend", "lib"):
    paths.extend(p for p in (root / directory).rglob("*") if p.is_file()
                 and not any(part in p.parts for part in ("__pycache__", "scratch", "node_modules", ".git"))
                 and not p.name.startswith(".env"))
paths.extend(root / name for name in ("foundry.toml", "foundry.lock", "remappings.txt", "launch.json")
             if (root / name).is_file())
files, aggregate = {}, hashlib.sha256()
for path in sorted(paths, key=lambda p: p.relative_to(root).as_posix()):
    relative = path.relative_to(root).as_posix()
    content = path.read_bytes()
    files[relative] = hashlib.sha256(content).hexdigest()
    aggregate.update(relative.encode() + b"\0" + content + b"\0")
report = {
    "baselineCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
    "candidate": "baseline plus delivered working tree; platform publication commit not assigned by worker",
    "algorithm": "SHA256; aggregate is sorted UTF8 path + NUL + file bytes + NUL for each listed file",
    "aggregateSHA256": aggregate.hexdigest(),
    "files": files,
}
target = root / "docs" / "evidence" / "continuation" / "source-content.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"files": len(files), "aggregateSHA256": aggregate.hexdigest()}))
