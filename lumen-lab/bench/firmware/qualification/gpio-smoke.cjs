// A host-only pin-level fixture. The UF2 contains only main.py and MicroPython.
// Usage: node gpio-smoke.cjs firmware.uf2 rp2040js /path/to/bootrom.ts [capture.jsonl]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { Simulator, USBCDC, GPIOPinState, ConsoleLogger, LogLevel } = require(process.argv[3]);

function crc8(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0x8c : 0);
  }
  return crc;
}

function withCrc(bytes) {
  return [...bytes, crc8(bytes)];
}

function device(serial, raw) {
  const rom = withCrc([0x28, serial, 0, 0, 0, 0, 0]);
  return { rom, id: Buffer.from(rom).toString('hex'), raw };
}

function bitAt(bytes, index) {
  return (bytes[index >>> 3] >>> (index & 7)) & 1;
}

class SensorBus {
  constructor(sim, number, connected) {
    this.clock = sim.clock;
    this.pin = sim.rp2040.gpio[number];
    this.device = connected;
    this.masterLow = false;
    this.sensorLow = false;
    this.mode = 'idle';
    this.pin.setInputValue(true);
    this.pin.addListener((state) => this.edge(state));
  }

  drive() {
    this.pin.setInputValue(!(this.masterLow || this.sensorLow));
  }

  occupy(low) {
    this.sensorLow = low;
    this.drive();
  }

  after(us, fn) {
    this.clock.createAlarm(fn).schedule(us * 1000);
  }

  edge(state) {
    if (state === GPIOPinState.Low && !this.masterLow) {
      this.startedLow = this.clock.micros;
      this.masterLow = true;
      this.drive();
      return;
    }
    if (!this.masterLow || state === GPIOPinState.Low) return;
    const width = this.clock.micros - this.startedLow;
    this.masterLow = false;
    this.drive();
    if (width > 400) {
      this.mode = 'rom';
      this.index = 0;
      this.byte = 0;
      this.selected = false;
      if (this.device) {
        this.after(20, () => this.occupy(true));
        this.after(140, () => this.occupy(false));
      }
      return;
    }
    if (!this.device) return;
    const written = width < 35 ? 1 : 0;
    if (this.mode === 'search') {
      const pos = Math.floor(this.index / 3);
      const phase = this.index++ % 3;
      const bit = bitAt(this.device.rom, pos);
      if (phase < 2) this.reply(bit ^ phase);
      else if (written !== bit) this.mode = 'idle';
    } else if (this.mode === 'power') {
      this.reply(1);
    } else if (this.mode === 'conversion') {
      this.reply(this.clock.micros >= this.readyAt ? 1 : 0);
    } else if (this.mode === 'scratch') {
      this.reply(bitAt(this.data, this.index++));
    } else if (['rom', 'match', 'function'].includes(this.mode)) {
      this.byte |= written << (this.index++ & 7);
      if ((this.index & 7) === 0) {
        const value = this.byte;
        this.byte = 0;
        this.accept(value);
      }
    }
  }

  reply(bit) {
    if (bit) return;
    this.occupy(true);
    this.after(36, () => this.occupy(false));
  }

  accept(value) {
    if (this.mode === 'rom') {
      if (value === 0xf0) this.mode = 'search';
      else if (value === 0x55) {
        this.mode = 'match';
        this.address = [];
      } else throw new Error('Unexpected ROM command ' + value);
      this.index = 0;
    } else if (this.mode === 'match') {
      this.address.push(value);
      if (this.address.length === 8) {
        this.selected = this.address.every((v, i) => this.device.rom[i] === v);
        this.mode = this.selected ? 'function' : 'idle';
        this.index = 0;
      }
    } else if (value === 0xb4) {
      this.mode = 'power';
    } else if (value === 0x44) {
      this.mode = 'conversion';
      this.readyAt = this.clock.micros + 750000;
    } else if (value === 0xbe) {
      this.mode = 'scratch';
      this.index = 0;
      const raw = this.device.raw;
      this.data = withCrc([raw & 255, (raw >> 8) & 255, 75, 70, 0x7f, 255, 12, 16]);
    } else throw new Error('Unexpected DS18B20 command ' + value);
  }
}

const sim = new Simulator();
const mcu = sim.rp2040;
const romFile = fs.readFileSync(process.argv[4]);
assert.equal(createHash('sha256').update(romFile).digest('hex'),
             '99f8a1f813ce3aa9415884de3fb6c5b962d3c6fa0394b05413ad3c7b3c39ec62');
const words = romFile.toString().split('new Uint32Array([')[1].split('])')[0];
mcu.loadBootrom(new Uint32Array(words.match(/0x[0-9a-f]+/gi).map(Number)));
mcu.logger = new ConsoleLogger(LogLevel.Error);
const uf2 = fs.readFileSync(process.argv[2]);
assert.equal(uf2.length, 4194304);
for (let off = 0; off < uf2.length; off += 512) {
  mcu.flash.set(uf2.subarray(off + 32, off + 288), uf2.readUInt32LE(off + 12) - 0x10000000);
}

const left = new SensorBus(sim, 2, device(1, -161));
const right = new SensorBus(sim, 3, device(2, 1999));
const replacement = device(9, 589);
const cdc = new USBCDC(mcu.usbCtrl);
const timeout = setTimeout(() => {
  sim.stop();
  console.error('Timed out waiting for four emulated USB records');
  process.exit(1);
}, 120000);

let line = '';
let previous = null;
let count = 0;
const received = [];
function validate(record, text) {
  assert.equal(record.v, 'LM04B/1');
  assert.match(record.board, /^[a-f0-9]{16}$/);
  assert.match(record.boot, /^[a-f0-9]{16}$/);
  if (previous) {
    assert.equal(record.seq, previous.seq + 1);
    assert.equal(record.board, previous.board);
    assert.equal(record.boot, previous.boot);
    assert(record.ms > previous.ms);
  }
  previous = record;
  const expected = (id, c, s) => ({ id, c, s });
  if (count === 0) {
    assert.deepEqual(record.t1, expected(left.device.id, -10.0625, 'ok'));
    assert.deepEqual(record.t2, expected(right.device.id, 124.9375, 'ok'));
    left.device = null;
  } else if (count === 1) {
    assert.deepEqual(record.t1, expected(null, null, 'no_sensor'));
    assert.deepEqual(record.t2, expected(right.device.id, 124.9375, 'ok'));
    left.device = replacement;
    right.device.raw = 85 * 16;
  } else if (count === 2) {
    assert.deepEqual(record.t1, expected(replacement.id, null, 'sensor_changed'));
    assert.deepEqual(record.t2, expected(right.device.id, null, 'startup_85'));
    right.device.raw = 339;
  } else {
    assert.deepEqual(record.t1, expected(replacement.id, 36.8125, 'ok'));
    assert.deepEqual(record.t2, expected(right.device.id, 21.1875, 'ok'));
  }
  received.push(text);
  console.log(text);
  if (++count === 4) {
    sim.stop();
    clearTimeout(timeout);
    if (process.argv[5]) {
      const header = '{"type":"LM04B-file","synthetic":true}';
      fs.writeFileSync(process.argv[5], [header, ...received, ''].join('\n'));
    }
    console.log('PASS: four USB CDC records from the packaged UF2 on emulated RP2040 GPIO.');
  }
}

cdc.onSerialData = (data) => {
  for (const ch of Buffer.from(data).toString('ascii')) {
    if (ch === '\n') {
      const text = line.replace(/\r$/, '');
      validate(JSON.parse(text), text);
      line = '';
    } else line += ch;
  }
};
mcu.core.PC = 0x10000000;
sim.execute();
