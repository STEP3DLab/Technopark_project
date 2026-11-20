"""Rebuild the classic 2 MiB RPI_PICO application UF2 from pinned MicroPython."""

import argparse
import hashlib
import struct
from pathlib import Path
from urllib.request import urlopen


HERE = Path(__file__).resolve().parent
BASE_URL = "https://micropython.org/resources/firmware/RPI_PICO-20250415-v1.25.0.uf2"
BASE_SHA256 = "e0c40eacf1afc550a6add74888c48bb981b28788a6d75a62a0e2444e997b9864"
XIP_BASE = 0x10000000
FLASH_SIZE = 2 * 1024 * 1024
FS_SIZE = 1408 * 1024
FS_OFFSET = FLASH_SIZE - FS_SIZE
PAGE_SIZE = 256
UF2_MAGIC = (0x0A324655, 0x9E5D5157)
UF2_END = 0x0AB16F30
UF2_FAMILY_FLAG = 0x2000
RP2040_FAMILY = 0xE48BFF56
IMAGE_NAME = "LM04B-Pico-v1.uf2"
FILESYSTEM = dict(block_size=4096, block_count=352, read_size=32, prog_size=256,
                  cache_size=1024, lookahead_size=32, block_cycles=100, disk_version=0x00020001)


def unpack(data):
    if not data or len(data) % 512:
        raise ValueError("incomplete UF2")
    count = len(data) // 512
    if count * PAGE_SIZE > FLASH_SIZE:
        raise ValueError("UF2 exceeds classic Pico flash")
    flash = bytearray(count * PAGE_SIZE)
    for number in range(count):
        frame = number * 512
        start = number * PAGE_SIZE
        expected = (*UF2_MAGIC, UF2_FAMILY_FLAG, XIP_BASE + start, PAGE_SIZE,
                    number, count, RP2040_FAMILY)
        if (struct.unpack_from("<8I", data, frame) != expected or
                struct.unpack_from("<I", data, frame + 508)[0] != UF2_END):
            raise ValueError(f"invalid RP2040 UF2 block {number}")
        flash[start:start + PAGE_SIZE] = data[frame + 32:frame + 32 + PAGE_SIZE]
    return bytes(flash)


def pack(flash):
    if not flash or len(flash) > FLASH_SIZE or len(flash) % PAGE_SIZE:
        raise ValueError("invalid flash length")
    count = len(flash) // PAGE_SIZE
    image = bytearray(512 * count)
    for number in range(count):
        frame = number * 512
        start = number * PAGE_SIZE
        struct.pack_into("<8I", image, frame, *UF2_MAGIC, UF2_FAMILY_FLAG, XIP_BASE + start,
                         PAGE_SIZE, number, count, RP2040_FAMILY)
        image[frame + 32:frame + 32 + PAGE_SIZE] = flash[start:start + PAGE_SIZE]
        struct.pack_into("<I", image, frame + 508, UF2_END)
    return bytes(image)


def filesystem(buffer=None):
    import littlefs

    if littlefs.__version__ != "0.16.0":
        raise ValueError("install littlefs-python==0.16.0 for a reproducible UF2")
    context = littlefs.UserContext(FS_SIZE)
    if buffer is not None:
        if len(buffer) != FS_SIZE:
            raise ValueError("incorrect filesystem length")
        context.buffer[:] = buffer
    return littlefs.LittleFS(context=context, mount=False, **FILESYSTEM)


def verify_source(flash, source):
    disk = filesystem(flash[FS_OFFSET:])
    disk.mount()  # Never auto-format an image under verification.
    try:
        if disk.listdir("/") != ["main.py"]:
            raise ValueError("unexpected root directory")
        with disk.open("/main.py", "rb") as handle:
            if handle.read() != source:
                raise ValueError("on-image main.py does not match the supplied source")
    finally:
        disk.unmount()


def build(base, source):
    if hashlib.sha256(base).hexdigest() != BASE_SHA256:
        raise ValueError("official RPI_PICO v1.25.0 UF2 SHA-256 mismatch")
    stock = unpack(base)
    if len(stock) > FS_OFFSET:
        raise ValueError("runtime overlaps the filesystem")
    disk = filesystem()
    disk.format()
    disk.mount()
    with disk.open("/main.py", "wb") as handle:
        handle.write(source)
    disk.unmount()
    flash = stock + b"\xff" * (FS_OFFSET - len(stock)) + bytes(disk.context.buffer)
    result = pack(flash)
    recovered = unpack(result)
    if recovered != flash:
        raise ValueError("UF2 readback mismatch")
    verify_source(recovered, source)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, help="local copy of the official, hash-pinned UF2")
    parser.add_argument("--output", type=Path, default=HERE / IMAGE_NAME)
    parser.add_argument("--verify", action="store_true", help="compare against this existing output")
    args = parser.parse_args()
    if args.base:
        base = args.base.read_bytes()
    else:
        with urlopen(BASE_URL, timeout=30) as response:
            base = response.read()
    result = build(base, (HERE / "main.py").read_bytes())
    if args.verify:
        if args.output.read_bytes() != result:
            parser.exit(1, "UF2 differs from the verified rebuild\n")
    else:
        args.output.write_bytes(result)
    print(hashlib.sha256(result).hexdigest(), args.output.name)


if __name__ == "__main__":
    main()
