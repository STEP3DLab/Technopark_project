"""Host tests of the actual Pico program with the v1.25.0 OneWire API."""

import importlib.util
import json
import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1] / "firmware"
spec = importlib.util.spec_from_file_location("lm04b_pico", ROOT / "main.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


def crc8(data):
    value = 0
    for octet in data:
        value ^= octet
        for _ in range(8):
            value = (value >> 1) ^ (0x8C if value & 1 else 0)
    return value


class Device:
    def __init__(self, serial, raw=16 * 22, resolution=12, family=0x28):
        prefix = bytes([family]) + serial.to_bytes(6, "little")
        self.rom = prefix + bytes([crc8(prefix)])
        config = 0x1F | ((resolution - 9) << 5)
        payload = bytes([raw & 255, (raw >> 8) & 255, 75, 70, config, 255, 12, 16])
        self.scratch = payload + bytes([crc8(payload)])
        self.external = True
        self.duration = 750
        self.began = None


class Timer:
    PERIOD = 4096

    def __init__(self, start=0):
        self.absolute = start
        self.events = []

    def ticks_ms(self):
        return self.absolute % self.PERIOD

    def ticks_diff(self, new, old):
        half = self.PERIOD // 2
        return (new - old + half) % self.PERIOD - half

    def sleep_ms(self, ms):
        self.absolute += ms
        due = [event for event in self.events if event[0] <= self.absolute]
        for event in due:
            self.events.remove(event)
            event[1]()


class Pin:
    def __init__(self):
        self.high = True
        self.releases = 0

    def value(self, value=None):
        if value is not None:
            assert value == 1
            self.releases += 1
        return int(self.high)


class Wire:
    """An independent wired-AND search, MATCH ROM and scratchpad state machine."""

    def __init__(self, timer, devices):
        self.timer = timer
        self.devices = list(devices)
        self.pin = Pin()
        self.failing_read = False
        self.broken_search = False
        self.starts = []
        self.resets = 0
        self.selected_rom = None
        self.mode = None

    def reset(self, required=False):
        assert not required
        self.resets += 1
        self.mode = "rom"
        self.selected_rom = None
        return bool(self.devices) or not self.pin.value()

    def selected(self):
        return next((dev for dev in self.devices if dev.rom == self.selected_rom), None)

    def writebyte(self, value):
        if self.mode == "rom" and value == 0xF0:
            self.mode = "search"
            self.bit = self.phase = 0
            self.active = list(self.devices)
        elif self.mode == "rom" and value == 0x55:
            self.mode = "selection"
        elif self.mode == "function" and value == 0xB4:
            self.mode = "power"
        elif self.mode == "function" and value == 0x44:
            self.mode = "conversion"
            dev = self.selected()
            if dev is not None:
                dev.began = self.timer.absolute
                self.starts.append(dev.began)
        elif self.mode == "function" and value == 0xBE:
            self.mode = "scratch"
        else:
            raise AssertionError((self.mode, value))

    def write(self, buf):
        assert self.mode == "selection" and len(buf) == 8
        self.selected_rom = bytes(buf)
        self.mode = "function"

    def rom_bit(self, dev):
        return (dev.rom[self.bit // 8] >> (self.bit % 8)) & 1

    def readbit(self):
        if self.mode == "search":
            assert self.bit < 64 and self.phase in (0, 1)
            phase = self.phase
            self.phase += 1
            if self.broken_search:
                return 1
            return int(all((self.rom_bit(dev) ^ phase) for dev in self.active))
        dev = self.selected()
        if self.mode == "power":
            return int(dev is None or dev.external)
        if self.mode == "conversion":
            return int(dev is None or dev.began is None or
                       self.timer.absolute - dev.began >= dev.duration)
        raise AssertionError(self.mode)

    def writebit(self, value):
        assert self.mode == "search" and self.phase == 2
        self.active = [dev for dev in self.active if self.rom_bit(dev) == value]
        self.bit += 1
        self.phase = 0

    def readinto(self, buf):
        assert self.mode == "scratch" and len(buf) == 9
        if self.failing_read:
            raise OSError("simulated sensor-side I/O error")
        dev = self.selected()
        buf[:] = dev.scratch if dev is not None else b"\xff" * 9

    def crc8(self, data):
        return crc8(data)


class FirmwareTest(unittest.TestCase):
    def setUp(self):
        self.timer = Timer()
        self.clock = app.Uptime(self.timer)
        self.first = Device(1, raw=-161)
        self.second = Device(2, raw=1999)
        self.wires = [Wire(self.timer, [self.first]), Wire(self.timer, [self.second])]
        self.channels = [app.Channel(wire) for wire in self.wires]
        self.board = "0123456789abcdef"
        self.boot = "0011223344556677"

    def sample(self, seq=0):
        return app.sample(self.channels, self.clock, self.board, self.boot, seq)

    def check_fault(self, status, expected=None, seq=0):
        frame = self.sample(seq)
        self.assertEqual(frame["t1"], {"s": status, "c": None, "id": expected})
        self.assertEqual(frame["t2"]["c"], 124.9375)
        return frame

    def test_two_conversions_overlap_and_records_are_strict_json(self):
        self.first.duration = 90
        frame = self.sample(7)
        self.assertEqual(self.wires[0].starts, [0])
        self.assertEqual(self.wires[1].starts, [0])
        self.assertEqual(frame, {
            "v": "LM04B/1", "board": self.board, "boot": self.boot, "seq": 7, "ms": 750,
            "t1": {"id": self.first.rom.hex(), "c": -10.0625, "s": "ok"},
            "t2": {"id": self.second.rom.hex(), "c": 124.9375, "s": "ok"}})
        with redirect_stdout(StringIO()) as output:
            app.send_record(frame)
        self.assertEqual(len(output.getvalue().splitlines()), 1)
        self.assertEqual(json.loads(output.getvalue()), frame)

    def test_missing_shorted_and_reconnection(self):
        self.wires[0].devices = []
        self.check_fault("no_sensor")
        self.wires[0].pin.high = False
        self.check_fault("bus_short")
        self.wires[0].pin.high = True
        self.wires[0].devices = [self.first]
        self.assertEqual(self.sample()["t1"]["c"], -10.0625)

    def test_mixed_family_extra_devices_and_bounded_collision(self):
        wrong = Device(3, family=0x10)
        self.wires[0].devices = [wrong]
        self.check_fault("wrong_family")
        for candidates in ([self.first, wrong], [self.first, Device(3)],
                           [Device(n) for n in range(100)]):
            self.wires[0].devices = candidates
            before = self.wires[0].resets
            self.check_fault("multiple_devices")
            self.assertEqual(self.wires[0].resets - before, 1)

    def test_rom_crc_and_no_devices_in_search_pair(self):
        self.first.rom = self.first.rom[:-1] + bytes([self.first.rom[-1] ^ 1])
        self.check_fault("rom_crc")
        self.wires[0].broken_search = True
        self.check_fault("bus_error")

    def test_parasite_power_has_no_conversion(self):
        self.first.external = False
        self.check_fault("parasite_power", self.first.rom.hex())
        self.assertEqual(self.wires[0].starts, [])

    def test_unobserved_busy_and_conversion_stuck(self):
        for duration in (0, 50000):
            self.first.duration = duration
            before = self.timer.absolute
            self.check_fault("conversion_timeout", self.first.rom.hex())
            self.assertLessEqual(self.timer.absolute - before, app.CONVERSION_LIMIT_MS + app.POLL_MS)

    def test_corrupt_and_degenerate_scratchpads(self):
        good = self.first.scratch
        self.first.scratch = good[:-1] + bytes([good[-1] ^ 0x80])
        self.check_fault("scratchpad_crc", self.first.rom.hex())
        for invalid in (bytes(9), Device(1, 2001).scratch, Device(1, -881).scratch):
            self.first.scratch = invalid
            self.check_fault("invalid_data", self.first.rom.hex())
        self.first.scratch = good
        self.assertEqual(self.sample()["t1"]["s"], "ok")

    def test_resolution_mask_ranges_and_all_reportable_increments(self):
        for bits, raw, expected in [(9, 39, 2.0), (10, -17, -1.25), (11, 39, 2.375),
                                    (12, 39, 2.4375), (12, -880, -55), (12, 2000, 125)]:
            buf = Device(1, raw, bits).scratch
            self.assertEqual(app.decode_scratchpad(self.wires[0], buf), expected)
        for raw in range(-880, 2001):
            if raw != 85 * 16:
                self.assertEqual(app.decode_scratchpad(self.wires[0], Device(1, raw).scratch),
                                 raw / 16)

    def test_exact_85_including_power_loss_after_busy(self):
        self.first.scratch = Device(1, 85 * 16).scratch
        self.check_fault("startup_85", self.first.rom.hex())
        self.first.scratch = Device(1, 22 * 16).scratch
        self.timer.events.append((self.timer.absolute + 100, self.brownout))
        self.check_fault("startup_85", self.first.rom.hex())
        self.first.scratch = Device(1, 85 * 16 + 1).scratch
        self.assertEqual(self.sample()["t1"]["c"], 85.0625)

    def brownout(self):
        self.first.scratch = Device(1, 85 * 16).scratch
        self.first.began = None

    def test_disconnection_and_short_during_conversion(self):
        self.timer.events.append((100, lambda: self.wires[0].devices.clear()))
        self.check_fault("no_sensor")
        self.wires[0].devices.append(self.first)
        self.timer.events.append((self.timer.absolute + 50,
                                  lambda: setattr(self.wires[0].pin, "high", False)))
        self.check_fault("bus_short")

    def test_replacement_during_and_between_samples(self):
        replacement = Device(42, 589)
        self.timer.events.append((100, lambda: setattr(self.wires[0], "devices", [replacement])))
        self.check_fault("sensor_changed", replacement.rom.hex())
        self.assertIsNone(replacement.began)
        self.assertEqual(self.sample(1)["t1"]["c"], 36.8125)
        self.wires[0].devices = [self.first]
        self.check_fault("sensor_changed", self.first.rom.hex(), 2)
        self.assertEqual(self.sample(3)["t1"]["c"], -10.0625)

    def test_new_device_added_during_conversion(self):
        self.timer.events.append((200, lambda: self.wires[0].devices.append(Device(90))))
        self.check_fault("multiple_devices")

    def test_per_channel_io_error_recovers(self):
        self.wires[0].failing_read = True
        self.check_fault("bus_error")
        self.wires[0].failing_read = False
        self.assertEqual(self.sample()["t1"]["c"], -10.0625)

    def test_multiple_time_counter_wraps_and_lost_usb_line(self):
        self.timer.absolute = self.timer.PERIOD - 40
        self.clock = app.Uptime(self.timer)
        records = []

        class StopCapture(Exception):
            pass

        def capture(record):
            records.append(record)
            if record["seq"] == 3:
                raise OSError("simulated USB disconnect")
            if record["seq"] == 10:
                raise StopCapture

        with self.assertRaises(StopCapture):
            app.run(self.channels, self.clock, self.board, self.boot, capture)
        self.assertEqual([r["ms"] for r in records], [750 + i * 1000 for i in range(11)])
        self.assertEqual([r["seq"] for r in records], list(range(11)))
        self.assertEqual({r["boot"] for r in records}, {self.boot})

    def test_real_boot_entrypoint_uses_two_pins_board_id_and_fresh_eight_bytes(self):
        ports, starts = [], []
        hardware = SimpleNamespace(Pin=lambda n: ports.append(n) or n,
                                   unique_id=lambda: bytes.fromhex(self.board))
        transport = SimpleNamespace(OneWire=lambda pin: self.wires[pin - 2])
        outputs = [b"\x01" * 8, b"\x02" * 8]
        os_stub = SimpleNamespace(urandom=lambda n: outputs.pop(0) if n == 8 else None)
        modules = {"machine": hardware, "onewire": transport, "os": os_stub, "time": self.timer}
        with patch.dict(sys.modules, modules), patch.object(app, "run", side_effect=lambda *a: starts.append(a)):
            app.main()
            app.main()
        self.assertEqual(ports, [2, 3, 2, 3])
        self.assertEqual([a[2:4] for a in starts],
                         [(self.board, "01" * 8), (self.board, "02" * 8)])
        self.assertEqual([wire.pin.releases for wire in self.wires], [2, 2])
        self.assertTrue(all(a[4] is app.send_record for a in starts))


if __name__ == "__main__":
    unittest.main()
