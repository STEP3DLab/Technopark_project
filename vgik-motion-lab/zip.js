/** Minimal ZIP writer: stored entries, UTF-8 names, no external dependencies. */
const MAX_FILES = 2048;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const UTF8_FLAG = 0x0800;
const encoder = new TextEncoder();

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function validateName(name) {
  if (typeof name !== 'string' || !name || name.length > 1024) {
    throw new Error('ZIP: имя файла должно содержать от 1 до 1024 символов.');
  }
  if (name.startsWith('/') || /[\u0000-\u001f\u007f<>:"\\|?*]/.test(name)) {
    throw new Error('ZIP: разрешены только относительные пути с безопасными именами файлов.');
  }
  const segments = name.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..' || part !== part.trim() || /[. ]$/.test(part))) {
    throw new Error('ZIP: путь не должен содержать пустые части, «.» или «..».');
  }
  const bytes = encoder.encode(name);
  if (bytes.length > 4096) throw new Error('ZIP: имя файла слишком длинное.');
  return bytes;
}

async function readBytes(data, name) {
  let bytes;
  if (typeof data === 'string') {
    if (data.length > MAX_FILE_BYTES) throw new Error(`ZIP: файл «${name}» превышает 64 МБ.`);
    bytes = encoder.encode(data);
  } else if (data instanceof Uint8Array) {
    if (data.byteLength > MAX_FILE_BYTES) throw new Error(`ZIP: файл «${name}» превышает 64 МБ.`);
    // Snapshot caller-owned views; subsequent mutations cannot invalidate CRC.
    bytes = new Uint8Array(data);
  } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
    if (data.size > MAX_FILE_BYTES) throw new Error(`ZIP: файл «${name}» превышает 64 МБ.`);
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    throw new Error(`ZIP: данные файла «${name}» должны быть строкой, Blob или Uint8Array.`);
  }
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`ZIP: файл «${name}» превышает 64 МБ.`);
  return bytes;
}

function header(size) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

/**
 * Build an archive suitable for browser downloads.
 * @param {{name:string,data:Uint8Array|Blob|string}[]} files
 * @returns {Promise<Blob>} application/zip, ZIP method 0 (store).
 */
export async function buildZip(files) {
  if (!Array.isArray(files) || files.length > MAX_FILES) {
    throw new Error(`ZIP: требуется список не более чем из ${MAX_FILES} файлов.`);
  }
  const localParts = [];
  const directoryParts = [];
  const names = new Set();
  let offset = 0;
  let totalBytes = 0;
  let directoryBytes = 0;
  const now = new Date();
  const year = Math.max(1980, Math.min(2107, now.getUTCFullYear()));
  const dosTime = (now.getUTCHours() << 11) | (now.getUTCMinutes() << 5) | (now.getUTCSeconds() >>> 1);
  const dosDate = ((year - 1980) << 9) | ((now.getUTCMonth() + 1) << 5) | now.getUTCDate();

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    if (!file || typeof file !== 'object') throw new Error(`ZIP: неверное описание файла ${index + 1}.`);
    const nameBytes = validateName(file.name);
    const canonicalName = file.name.toLocaleLowerCase('en-US');
    if (names.has(canonicalName)) throw new Error(`ZIP: имя «${file.name}» повторяется.`);
    names.add(canonicalName);
    const bytes = await readBytes(file.data, file.name);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('ZIP: общий объём файлов превышает 256 МБ. Сократите число кадров.');
    const checksum = crc32(bytes);

    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, UTF8_FLAG, true);
    local.view.setUint16(8, 0, true);
    local.view.setUint16(10, dosTime, true);
    local.view.setUint16(12, dosDate, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, bytes.byteLength, true);
    local.view.setUint32(22, bytes.byteLength, true);
    local.view.setUint16(26, nameBytes.byteLength, true);
    local.view.setUint16(28, 0, true);
    localParts.push(local.bytes, nameBytes, bytes);

    const central = header(46);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, UTF8_FLAG, true);
    central.view.setUint16(10, 0, true);
    central.view.setUint16(12, dosTime, true);
    central.view.setUint16(14, dosDate, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, bytes.byteLength, true);
    central.view.setUint32(24, bytes.byteLength, true);
    central.view.setUint16(28, nameBytes.byteLength, true);
    central.view.setUint16(30, 0, true);
    central.view.setUint16(32, 0, true);
    central.view.setUint16(34, 0, true);
    central.view.setUint16(36, 0, true);
    central.view.setUint32(38, 0, true);
    central.view.setUint32(42, offset, true);
    directoryParts.push(central.bytes, nameBytes);
    directoryBytes += central.bytes.byteLength + nameBytes.byteLength;
    offset += local.bytes.byteLength + nameBytes.byteLength + bytes.byteLength;

    // Keep longer exports responsive without introducing worker dependencies.
    if (index % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(4, 0, true);
  end.view.setUint16(6, 0, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, directoryBytes, true);
  end.view.setUint32(16, offset, true);
  end.view.setUint16(20, 0, true);
  return new Blob([...localParts, ...directoryParts, end.bytes], { type: 'application/zip' });
}
