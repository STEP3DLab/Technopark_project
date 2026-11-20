"""Install or read back the LM04B program on a classic Pico with MicroPython v1.25.0."""

import argparse
import hashlib
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path


HERE = Path(__file__).resolve().parent
CHECK_TARGET = """
import os, sys
if sys.platform != 'rp2' or sys.implementation.name != 'micropython':
    raise ValueError('Expected MicroPython on a classic Raspberry Pi Pico')
if os.uname().machine != 'Raspberry Pi Pico with RP2040' or sys.implementation.version[:3] != (1, 25, 0):
    raise ValueError('Requires the official RPI_PICO release v1.25.0')
"""


def install(port, verify_only):
    source = HERE / "main.py"
    expected = source.read_bytes()
    digest = hashlib.sha256(expected).hexdigest()
    command = [sys.executable, "-m", "mpremote", "connect", port, "exec", CHECK_TARGET]
    with tempfile.TemporaryDirectory() as tmp:
        readback = Path(tmp) / "pico-main.py"
        if not verify_only:
            staged = "/.lm04b-" + uuid.uuid4().hex + ".tmp"
            promote = f"""
import binascii, hashlib, os
with open({staged!r}, 'rb') as f:
    actual = binascii.hexlify(hashlib.sha256(f.read()).digest()).decode()
if actual != {digest!r}:
    os.remove({staged!r})
    raise ValueError('Staged program SHA-256 mismatch')
os.rename({staged!r}, '/main.py')
"""
            command += ["fs", "cp", str(source), ":" + staged, "+", "exec", promote]
        command += ["fs", "cp", ":/main.py", str(readback), "+", "reset"]
        subprocess.run(command, check=True)
        if readback.read_bytes() != expected:
            raise RuntimeError("Pico /main.py differs from the provided program")
    print(f"Verified /main.py on {port} (SHA-256 {digest}). The Pico was restarted.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, help="e.g. COM5 or /dev/ttyACM0")
    parser.add_argument("--verify-only", action="store_true", help="read and compare the installed app")
    args = parser.parse_args()
    install(args.port, args.verify_only)


if __name__ == "__main__":
    main()
