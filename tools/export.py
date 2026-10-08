#!/usr/bin/env python3
"""Export compiled Sorphera ABIs and bytecode sizes; no network, private configuration, or signing."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
abi_dir = root / "frontend" / "abi"
abi_dir.mkdir(parents=True, exist_ok=True)
sizes = {}
for name in ("Sorphera", "SorpheraRouter", "SorpheraVaultFactory", "SorpheraVault"):
    artifact = json.loads((root / "out" / f"{name}.sol" / f"{name}.json").read_text())
    (abi_dir / f"{name}.json").write_text(json.dumps(artifact["abi"], indent=2) + "\n")
    runtime = artifact["deployedBytecode"]["object"].removeprefix("0x")
    init = artifact["bytecode"]["object"].removeprefix("0x")
    sizes[name] = {"runtimeBytes": len(runtime) // 2, "initBytesWithoutArgs": len(init) // 2}
    assert len(runtime) // 2 <= 24576, f"{name}: EIP-170"
    assert len(init) // 2 <= 49152, f"{name}: EIP-3860"
(root / "frontend" / "bytecode-sizes.json").write_text(json.dumps(sizes, indent=2) + "\n")
print(json.dumps(sizes, indent=2))
