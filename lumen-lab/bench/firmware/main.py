"""LM04B/1 USB thermometer for the classic Raspberry Pi Pico, MicroPython 1.25.0."""

import binascii
import json


PROTOCOL = "LM04B/1"
PERIOD_MS = 1000
CONVERSION_LIMIT_MS = 850
POLL_MS = 10
NO_CONFIRMED_ID = ("no_sensor", "bus_short", "multiple_devices", "wrong_family",
                   "rom_crc", "bus_error")


class SensorFault(Exception):
    pass


def hex_id(value):
    return binascii.hexlify(value).decode()


class Uptime:
    """Elapsed milliseconds in this application boot, including ticks_ms rollovers."""

    def __init__(self, timer):
        self.timer = timer
        self.previous = timer.ticks_ms()
        self.elapsed = 0

    def now(self):
        current = self.timer.ticks_ms()
        self.elapsed += self.timer.ticks_diff(current, self.previous)
        self.previous = current
        return self.elapsed

    def sleep(self, ms):
        self.timer.sleep_ms(ms)


def require_idle(wire):
    if not wire.pin.value():
        raise SensorFault("bus_short")


def reset(wire):
    require_idle(wire)
    present = wire.reset()
    require_idle(wire)
    if not present:
        raise SensorFault("no_sensor")


def discover_one(wire):
    # A single Search ROM pass can prove uniqueness. Stop at the first differing
    # bit; never enumerate an unbounded or noisy bus at the other port's expense.
    reset(wire)
    wire.writebyte(0xF0)
    rom = bytearray(8)
    for offset in range(64):
        bit = wire.readbit()
        opposite = wire.readbit()
        if bit == opposite:
            require_idle(wire)
            raise SensorFault("bus_error" if bit else "multiple_devices")
        rom[offset >> 3] |= bit << (offset & 7)
        wire.writebit(bit)
    if wire.crc8(rom):
        raise SensorFault("rom_crc")
    if rom[0] != 0x28:
        raise SensorFault("wrong_family")
    return bytes(rom)


def match(wire, rom):
    reset(wire)
    wire.writebyte(0x55)
    wire.write(rom)


def decode_scratchpad(wire, data):
    if wire.crc8(data):
        raise SensorFault("scratchpad_crc")
    config = data[4]
    if (config & 0x9F) != 0x1F:
        raise SensorFault("invalid_data")
    bits_unused = 3 - ((config >> 5) & 3)
    raw = (data[0] | (data[1] << 8)) & ~((1 << bits_unused) - 1)
    if raw & 0x8000:
        raw -= 65536
    if raw < -55 * 16 or raw > 125 * 16:
        raise SensorFault("invalid_data")
    # A brownout after the observed busy bit resets the scratchpad to +85.
    # Both cases can have a valid CRC and the same ROM ID.
    if raw == 85 * 16:
        raise SensorFault("startup_85")
    return raw / 16


class Channel:
    def __init__(self, wire):
        self.wire = wire
        self.last_rom = None
        self.new_cycle()

    def new_cycle(self):
        self.rom = None
        self.started = None
        self.result = None

    def identify(self):
        found = discover_one(self.wire)
        self.rom = found
        previous = self.last_rom
        self.last_rom = found
        if previous is not None and found != previous:
            raise SensorFault("sensor_changed")

    def start(self, clock):
        self.identify()
        match(self.wire, self.rom)
        self.wire.writebyte(0xB4)  # Read Power Supply
        if not self.wire.readbit():
            require_idle(self.wire)
            raise SensorFault("parasite_power")
        match(self.wire, self.rom)
        self.wire.writebyte(0x44)  # Convert T
        self.started = clock.now()
        if self.wire.readbit():
            # A missing device also reads as ready. Require one actual busy slot.
            self.identify()
            raise SensorFault("conversion_timeout")

    def poll(self, clock):
        require_idle(self.wire)
        if clock.now() - self.started > CONVERSION_LIMIT_MS:
            raise SensorFault("conversion_timeout")
        if not self.wire.readbit():
            return
        # A new device or a disconnected line can also release DQ. Verify the
        # unique ROM again, then address that exact ROM for the scratchpad.
        self.identify()
        match(self.wire, self.rom)
        self.wire.writebyte(0xBE)  # Read Scratchpad
        data = bytearray(9)
        self.wire.readinto(data)
        require_idle(self.wire)
        value = decode_scratchpad(self.wire, data)
        self.result = {"id": hex_id(self.rom), "c": value, "s": "ok"}

    def advance(self, clock):
        try:
            if self.started is None:
                self.start(clock)
            else:
                self.poll(clock)
            return
        except SensorFault as exc:
            status = exc.args[0]
        except OSError:
            status = "bus_error"
        rom = None if status in NO_CONFIRMED_ID or self.rom is None else hex_id(self.rom)
        self.result = {"id": rom, "c": None, "s": status}


def sample(channels, clock, board, boot, sequence):
    for channel in channels:
        channel.new_cycle()
    while True:
        waiting = False
        for channel in channels:
            if channel.result is None:
                channel.advance(clock)
            if channel.result is None:
                waiting = True
        if not waiting:
            return {"v": PROTOCOL, "board": board, "boot": boot, "seq": sequence,
                    "ms": clock.now(), "t1": channels[0].result, "t2": channels[1].result}
        clock.sleep(POLL_MS)


def run(channels, clock, board, boot, emit):
    sequence = 0
    while True:
        start = clock.now()
        record = sample(channels, clock, board, boot, sequence)
        try:
            emit(record)
        except OSError:
            # A USB disconnect can lose this line. Sampling and seq continue.
            pass
        sequence += 1
        remaining = PERIOD_MS - (clock.now() - start)
        if remaining > 0:
            clock.sleep(remaining)


def send_record(record):
    print(json.dumps(record))


def main():
    import machine
    import onewire
    import os
    import time

    clock = Uptime(time)
    channels = []
    for gpio in (2, 3):
        wire = onewire.OneWire(machine.Pin(gpio))
        wire.pin.value(1)  # Open-drain release; each DQ has its own external pull-up.
        channels.append(Channel(wire))
    run(channels, clock, hex_id(machine.unique_id()), hex_id(os.urandom(8)), send_record)


if __name__ == "__main__":
    main()
