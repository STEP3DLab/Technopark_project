#!/usr/bin/env python3
"""Read-only LM04B/1 USB recorder. Python 3.9+, pyserial 3.5 for physical USB."""
import argparse
import json
import math
import re
import sys
import time
from pathlib import Path

HEX = re.compile(r"[0-9a-f]{16}")
LIMIT_INT = 2**53 - 1
FAULTS = set("ok no_sensor bus_short wrong_family multiple_devices rom_crc conversion_timeout scratchpad_crc invalid_data startup_85 bus_error sensor_changed parasite_power".split())

def valid_rom(value):
    if not isinstance(value, str) or not HEX.fullmatch(value) or not value.startswith("28"):
        return False
    crc = 0
    for b in bytes.fromhex(value):
        for _ in range(8):
            odd = (crc ^ b) & 1
            crc >>= 1
            if odd:
                crc ^= 0x8C
            b >>= 1
    return crc == 0

def decode(line):
    d = json.loads(line)
    if not isinstance(d, dict) or d.get("v") != "LM04B/1":
        raise ValueError("Версия протокола")
    for name in ("board", "boot"):
        if not isinstance(d.get(name), str) or not HEX.fullmatch(d[name]):
            raise ValueError(name)
    for name in ("seq", "ms"):
        if type(d.get(name)) is not int or not 0 <= d[name] <= LIMIT_INT:
            raise ValueError(name)
    for name in ("t1", "t2"):
        x = d.get(name)
        if not isinstance(x, dict) or not {"id", "c", "s"}.issubset(x) or x["s"] not in FAULTS:
            raise ValueError(name)
        if x["id"] is not None and not valid_rom(x["id"]):
            raise ValueError("ROM")
        if x["s"] == "ok":
            value = x["c"]
            if not valid_rom(x["id"]) or type(value) not in (int, float) or not math.isfinite(value) or value == 85 or not -55 <= value <= 125 or int(value*16) != value*16:
                raise ValueError("Температура")
        elif x["c"] is not None:
            raise ValueError("Ошибочный кадр содержит температуру")
    return d

def recorder(read, dest, count=0, idle_timeout=12, seconds=0):
    """Read raw bytes; `None` means end of input, empty reads may time out."""
    started = last = time.monotonic()
    prev = None
    valid = invalid = missing = 0
    buf = bytearray()
    dropping = False
    output = None
    try:
        while not count or valid < count:
            now = time.monotonic()
            if seconds and now - started >= seconds:
                break
            if now - last >= idle_timeout:
                raise TimeoutError("Нет новых кадров LM04B/1 в течение заданного времени.")
            chunk = read()
            if chunk is None:
                break
            if not chunk:
                continue
            for b in chunk:
                if b != 10:
                    if not dropping:
                        if len(buf) >= 2048:
                            buf.clear()
                            dropping = True
                            invalid += 1
                        else:
                            buf.append(b)
                    continue
                if dropping:
                    dropping = False
                    continue
                line = bytes(buf).strip()
                buf.clear()
                if not line:
                    continue
                try:
                    f = decode(line)
                except (ValueError, TypeError, OverflowError):
                    invalid += 1
                    continue
                if prev:
                    if (prev["board"], prev["boot"]) != (f["board"], f["boot"]):
                        raise ValueError("Смена платы или перезапуск. Первая запись сохранена; начните новый файл.")
                    if f["seq"] <= prev["seq"] or f["ms"] <= prev["ms"]:
                        invalid += 1
                        continue
                    missing += f["seq"] - prev["seq"] - 1
                if output is None:
                    output = Path(dest).open("xb")
                output.write(line + b"\n")
                output.flush()
                valid += 1
                last = time.monotonic()
                prev = f
                if count and valid >= count:
                    break
    finally:
        if output:
            output.close()
    if not valid:
        raise ValueError("Не получено ни одного кадра. Файл не создан.")
    return valid, invalid, missing

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--port", required=True, help="Например COM4 или /dev/ttyACM0")
    p.add_argument("--out", required=True, help="Новый файл .jsonl")
    p.add_argument("--count", type=int, default=0, help="Остановиться после N кадров")
    p.add_argument("--seconds", type=float, default=0, help="Предельное время записи")
    p.add_argument("--idle-timeout", type=float, default=12, help="Тайм-аут ожидания новых кадров, с")
    args = p.parse_args()
    if args.count < 0 or not math.isfinite(args.seconds) or args.seconds < 0 or not math.isfinite(args.idle_timeout) or args.idle_timeout <= 0:
        p.error("Неверное ограничение длительности.")
    if Path(args.out).exists():
        p.error("Файл уже существует. Задайте другое имя.")
    try:
        import serial
    except ImportError:
        p.exit(2, "Установите PySerial: python -m pip install pyserial==3.5\n")
    try:
        with serial.Serial(args.port,115200,timeout=0.3) as port:
            result = recorder(lambda:port.read(port.in_waiting or 1),args.out,args.count,args.idle_timeout,args.seconds)
        print("Кадров: %d. Отклонено: %d. Пропущено по счётчику: %d." % result)
    except KeyboardInterrupt:
        print("Запись остановлена. Все полученные полные кадры уже записаны.", file=sys.stderr)
    except (OSError, ValueError) as exc:
        p.exit(1, str(exc)+"\n")

if __name__ == "__main__":
    main()
