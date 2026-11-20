"""Validate the shipped UF2, the upstream runtime and the source-install command."""

import contextlib
import hashlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch


FIRMWARE = Path(__file__).resolve().parents[1] / "firmware"


def module(name):
    spec = importlib.util.spec_from_file_location(name, FIRMWARE / (name + ".py"))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


image = module("build_uf2")
installer = module("install")


class ImageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.uf2 = (FIRMWARE / image.IMAGE_NAME).read_bytes()
        cls.flash = image.unpack(cls.uf2)
        cls.runtime = image.pack(cls.flash[:0x51800])

    def test_all_8192_pages_restore_the_classic_pico_flash(self):
        self.assertEqual(len(self.uf2), 8192 * 512)
        self.assertEqual(len(self.flash), 2 * 1024 * 1024)
        self.assertEqual(self.flash[0x51800:0xA0000], b"\xff" * (0xA0000 - 0x51800))
        self.assertIn(b"littlefs", self.flash[0xA0000:0xA1000])

    def test_runtime_byte_for_byte_matches_the_pinned_official_release(self):
        self.assertEqual(hashlib.sha256(self.runtime).hexdigest(), image.BASE_SHA256)

    def test_malformed_page_number_target_or_family_is_rejected(self):
        for offset in [0, 8, 12, 16, 20, 24, 28, 508]:
            corrupted = bytearray(image.pack(bytes(512)))
            corrupted[512 + offset] ^= 1
            with self.assertRaises(ValueError):
                image.unpack(corrupted)
        with self.assertRaises(ValueError):
            image.build(bytes(512), b"")

    @unittest.skipUnless(importlib.util.find_spec("littlefs"), "build dependency littlefs-python==0.16.0")
    def test_remount_embedded_application_and_rebuild_identically(self):
        source = (FIRMWARE / "main.py").read_bytes()
        image.verify_source(self.flash, source)
        self.assertEqual(image.build(self.runtime, source), self.uf2)


class InstallerTest(unittest.TestCase):
    def simulate(self, verify_only, readback):
        commands = []

        def mpremote(command, check):
            self.assertIs(check, True)
            self.assertEqual(command[1:7], ["-m", "mpremote", "connect", "COM5", "exec",
                                           installer.CHECK_TARGET])
            pos = command.index(":/main.py")
            Path(command[pos + 1]).write_bytes(readback)
            commands.append(command)

        with patch.object(installer.subprocess, "run", mpremote):
            with contextlib.redirect_stdout(io.StringIO()):
                installer.install("COM5", verify_only)
        return commands[0]

    def test_readback_only_and_verified_staged_update(self):
        source = (FIRMWARE / "main.py").read_bytes()
        check = self.simulate(True, source)
        self.assertEqual(check.count("cp"), 1)
        self.assertEqual(check[-2:], ["+", "reset"])
        deploy = self.simulate(False, source)
        self.assertEqual(deploy.count("cp"), 2)
        self.assertEqual(deploy.count("exec"), 2)
        self.assertTrue(any("os.rename" in arg and hashlib.sha256(source).hexdigest() in arg
                            for arg in deploy))

    def test_mismatched_readback_is_an_error(self):
        with self.assertRaisesRegex(RuntimeError, "differs"):
            self.simulate(True, b"another application")


if __name__ == "__main__":
    unittest.main()
