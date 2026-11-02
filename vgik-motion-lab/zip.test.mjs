import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildZip } from './zip.js';

test('Python zipfile extracts UTF-8, binary, Blob and empty entries with correct CRC', async () => {
  const archive = await buildZip([
    { name: 'кадры/кадр-0001.txt', data: 'Привет, ВГИК!\n' },
    { name: 'frames/frame-0002.bin', data: Uint8Array.from({ length: 256 }, (_, i) => i) },
    { name: 'project.json', data: new Blob(['{"version":1}'], { type: 'application/json' }) },
    { name: 'empty.bin', data: new Uint8Array() },
  ]);
  assert.equal(archive.type, 'application/zip');
  const directory = await mkdtemp(join(tmpdir(), 'vgik-zip-test-'));
  const path = join(directory, 'test.zip');
  try {
    await writeFile(path, new Uint8Array(await archive.arrayBuffer()));
    const verification = spawnSync('python3', ['-c', [
      'import sys, zipfile',
      'with zipfile.ZipFile(sys.argv[1]) as z:',
      '    assert z.testzip() is None',
      '    assert len(z.infolist()) == 4',
      '    assert all(i.compress_type == zipfile.ZIP_STORED for i in z.infolist())',
      '    assert all(i.flag_bits & 0x800 for i in z.infolist())',
      '    assert z.read("кадры/кадр-0001.txt").decode("utf-8") == "Привет, ВГИК!\\n"',
      '    assert z.read("frames/frame-0002.bin") == bytes(range(256))',
      '    assert z.read("project.json") == b\'{"version":1}\'',
      '    assert z.read("empty.bin") == b""',
      '    print("ZIP extraction and CRC verified")',
    ].join('\n'), path], { encoding: 'utf8' });
    assert.equal(verification.status, 0, verification.stderr);
    assert.match(verification.stdout, /CRC verified/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive rejects traversal, absolute and cross-platform unsafe paths', async () => {
  for (const name of ['../escape.txt', '/absolute.txt', 'C:/escape.txt', 'a\\..\\b', 'a/../../b', 'a//b', 'a/./b', 'a/.. /b', 'x\0y', 'a/b.']) {
    await assert.rejects(buildZip([{ name, data: 'x' }]), /ZIP/);
  }
});

test('archive rejects duplicate names, invalid payload types and excessive file count', async () => {
  await assert.rejects(buildZip([{ name: 'A.png', data: '' }, { name: 'a.png', data: '' }]), /повторяется/);
  await assert.rejects(buildZip([{ name: 'x', data: { bytes: [1] } }]), /Uint8Array/);
  await assert.rejects(buildZip(Array.from({ length: 2049 }, (_, i) => ({ name: `x${i}`, data: '' }))), /2048/);
});

test('empty archives use a complete standard end-of-central-directory record', async () => {
  const archive = await buildZip([]);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  assert.equal(bytes.length, 22);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x06054b50);
});
