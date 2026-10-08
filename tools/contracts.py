"""Read the compiled ABI instead of maintaining a second copy of Round tuple layouts."""
import json
from pathlib import Path
from runtime import calldata, number

ROOT = Path(__file__).resolve().parents[1]


def abi_type(item):
    kind = item["type"]
    if kind.startswith("tuple"):
        return "(" + ",".join(map(abi_type, item["components"])) + ")" + kind[5:]
    return kind


def normalize(item, value):
    kind = item["type"]
    if kind == "tuple":
        return {c["name"]: normalize(c, v) for c, v in zip(item["components"], value)}
    if kind.endswith("]"):
        base = dict(item, type=kind[:kind.rindex("[")])
        return [normalize(base, v) for v in value]
    if kind.startswith(("uint", "int")):
        return number(value)
    return value


class Contract:
    def __init__(self, engine, address, name):
        self.engine, self.address = engine, address
        path = ROOT / "frontend" / "abi" / (name + ".json")
        self.abi = json.loads(path.read_text())
        self.functions = {f["name"]: f for f in self.abi if f["type"] == "function"}

    def signature(self, name, output=False):
        fn = self.functions[name]
        sig = name + "(" + ",".join(map(abi_type, fn["inputs"])) + ")"
        if output:
            sig += "(" + ",".join(map(abi_type, fn["outputs"])) + ")"
        return sig

    def read(self, name, *args):
        output = self.functions[name]["outputs"]
        values = self.engine.read(self.address, self.signature(name, True), *args)
        parsed = [normalize(item, value) for item, value in zip(output, values)]
        return parsed[0] if len(parsed) == 1 else parsed

    def action(self, name, *args, label=None):
        return {"to": self.address, "data": calldata(self.signature(name), *args),
                "value": 0, "label": label or name}
