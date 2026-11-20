"""Byte framing, refusal to overwrite and real PySerial CLI over a Linux PTY."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("lm04b_recorder", ROOT / "desktop" / "record.py")
rec = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rec)
frames = (ROOT / "data" / "temperature-example.jsonl").read_bytes().splitlines()[1:]


class RecorderTests(unittest.TestCase):
    def test_value_and_status(self):
        self.assertTrue(rec.valid_rom(rec.decode(frames[0])["t1"]["id"]))
        for invalid in (85, 120.01, 126, None, True):
            f = json.loads(frames[0])
            f["t1"]["c"] = invalid
            with self.assertRaises(ValueError):
                rec.decode(json.dumps(f))

    def test_partial_line_and_file_protection(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "data.jsonl"
            chunks = iter([b"boot noise\n",frames[0]+b"\n",frames[1],None])
            self.assertEqual(rec.recorder(lambda: next(chunks),out),(1,1,0))
            self.assertEqual(out.read_bytes(),frames[0]+b"\n")
            with self.assertRaises(FileExistsError):
                rec.recorder(lambda: frames[1]+b"\n",out)
            self.assertEqual(out.read_bytes(),frames[0]+b"\n")

    def test_restart_keeps_first_boot(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "data.jsonl"
            f = json.loads(frames[1])
            f["boot"] = "eeeeeeeeeeeeeeee"
            chunks = iter([frames[0]+b"\n"+json.dumps(f).encode()+b"\n",None])
            with self.assertRaisesRegex(ValueError,"перезапуск"):
                rec.recorder(lambda: next(chunks),out)
            self.assertEqual(out.read_bytes(),frames[0]+b"\n")

    @unittest.skipUnless(sys.platform.startswith("linux") and importlib.util.find_spec("serial"),"Requires Linux PTY + PySerial 3.5")
    def test_cli_pyserial_tty(self):
        import pty
        import termios
        master,slave=pty.openpty()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                out=Path(tmp)/"roundtrip.jsonl"
                proc=subprocess.Popen([sys.executable,str(ROOT/"desktop"/"record.py"),"--port",os.ttyname(slave),"--out",str(out),"--count","6","--idle-timeout","4"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
                try:
                    deadline=time.monotonic()+4
                    while termios.tcgetattr(slave)[3] & termios.ICANON:
                        if time.monotonic()>deadline or proc.poll() is not None:self.fail("PySerial did not open the test port")
                        time.sleep(.01)
                    payload=b"first-fragment\n"+b"X"*2050+b"\n"+b"\r\n".join(frames)+b"\r\n"
                    for i in range(0,len(payload),11):os.write(master,payload[i:i+11])
                    stdout,stderr=proc.communicate(timeout=6)
                    self.assertEqual(proc.returncode,0,stderr)
                    self.assertIn("Кадров: 6. Отклонено: 2. Пропущено по счётчику: 1.",stdout)
                    self.assertEqual(out.read_bytes().splitlines(),frames)
                finally:
                    if proc.poll() is None:proc.kill();proc.communicate()
        finally:
            os.close(master);os.close(slave)


if __name__=="__main__":
    unittest.main()
