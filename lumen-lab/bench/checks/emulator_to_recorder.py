"""Run the packaged ARM image; route its four virtual USB frames through a real POSIX TTY and the desktop CLI."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pty
import subprocess
import sys
import tempfile
import termios
import time

BASE=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rp2040js",required=True,help="Installed pinned package directory")
    parser.add_argument("--bootrom",required=True,help="Boot ROM TypeScript fixture listed in the firmware guide")
    parser.add_argument("--capture",type=Path,help="New JSONL file, marked as emulator data")
    args=parser.parse_args()
    image=BASE/"firmware"/"LM04B-Pico-v1.uf2"
    master,slave=pty.openpty()
    try:
        with tempfile.TemporaryDirectory() as directory:
            dest=Path(directory)/"recorded.jsonl"
            cli=subprocess.Popen([sys.executable,str(BASE/"desktop"/"record.py"),"--port",os.ttyname(slave),"--out",str(dest),"--count","4","--idle-timeout","125"],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            try:
                deadline=time.monotonic()+5
                while termios.tcgetattr(slave)[3] & termios.ICANON:
                    if cli.poll() is not None or time.monotonic()>deadline:raise RuntimeError("PySerial did not open the pseudo-terminal")
                    time.sleep(.01)
                arm_command=["node",str(BASE/"firmware"/"qualification"/"gpio-smoke.cjs"),str(image),str(Path(args.rp2040js).resolve()),str(Path(args.bootrom).resolve())]
                with subprocess.Popen(arm_command,stdout=subprocess.PIPE) as arm:
                    expected=[]
                    for line in arm.stdout:
                        if line.startswith(b"{"):
                            expected.append(line)
                            os.write(master,line)
                    if arm.wait()!=0:raise RuntimeError("ARM emulator failed")
                out,err=cli.communicate(timeout=5)
                if cli.returncode:raise RuntimeError(err.decode())
                actual=dest.read_bytes()
                if len(expected)!=4 or actual!=b"".join(expected):raise RuntimeError("Desktop bytes differ from emulated CDC")
                frames=[json.loads(x) for x in expected]
                if args.capture:
                    with args.capture.open("xb") as f:
                        f.write(b'{"type":"LM04B-file","synthetic":true}\n'+actual)
                print(json.dumps({"imageSha256":hashlib.sha256(image.read_bytes()).hexdigest(),
                      "framesRecorded":len(frames),"sequence":[f["seq"] for f in frames],
                      "rawBytesMatch":True,"desktop":out.decode().strip(),"physicalHardware":False},ensure_ascii=False,indent=2))
            finally:
                if cli.poll() is None:cli.kill();cli.communicate()
    finally:
        os.close(master);os.close(slave)

if __name__=="__main__":
    main()
