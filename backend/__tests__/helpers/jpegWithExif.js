/**
 * Helper tạo JPEG buffer với cấu trúc APP1 / TIFF EXIF hợp lệ cho unit/integration testing
 * Story S-40
 */

/**
 * Tạo một buffer JPEG hợp lệ với metadata EXIF tuỳ chỉnh (TIFF Little-Endian 'II')
 *
 * @param {Object} options
 * @param {string} [options.dateTimeOriginal] - Ví dụ "2026:03:15 14:30:00"
 * @param {string} [options.offsetTimeOriginal] - Ví dụ "+07:00"
 * @param {number} [options.latitude] - Ví dụ 10.762622
 * @param {number} [options.longitude] - Ví dụ 106.660172
 * @param {number} [options.accuracy] - Ví dụ 5.25
 * @param {string} [options.gpsDateStamp] - Ví dụ "2026:03:15"
 * @param {number[]} [options.gpsTimeStamp] - Ví dụ [7, 30, 0]
 * @returns {Buffer}
 */
function createJpegWithExif(options = {}) {
  const {
    dateTimeOriginal,
    offsetTimeOriginal,
    latitude,
    longitude,
    accuracy,
    gpsDateStamp,
    gpsTimeStamp,
  } = options;

  // Xây dựng TIFF buffer
  // Cấu trúc Little-Endian:
  // 0..3: 'II\x2a\x00'
  // 4..7: 0x08, 0x00, 0x00, 0x00 (Offset IFD0 = 8)

  const ifd0Entries = [];
  const exifEntries = [];
  const gpsEntries = [];
  const dataHeap = [];

  // Helper đẩy dữ liệu chuỗi vào heap, trả về vị trí logic sẽ tính sau
  let heapOffset = 0;
  function addData(buf) {
    const start = heapOffset;
    dataHeap.push(buf);
    heapOffset += buf.length;
    // Align 2-byte
    if (buf.length % 2 !== 0) {
      dataHeap.push(Buffer.from([0]));
      heapOffset += 1;
    }
    return start;
  }

  // 1. Exif SubIFD Entries
  if (dateTimeOriginal) {
    const strBuf = Buffer.from(dateTimeOriginal + '\0', 'ascii');
    const relOffset = addData(strBuf);
    exifEntries.push({
      tag: 0x9003, // DateTimeOriginal
      type: 2, // ASCII
      count: strBuf.length,
      relOffset,
    });
  }

  if (offsetTimeOriginal) {
    const strBuf = Buffer.from(offsetTimeOriginal + '\0', 'ascii');
    const relOffset = addData(strBuf);
    exifEntries.push({
      tag: 0x9011, // OffsetTimeOriginal
      type: 2, // ASCII
      count: strBuf.length,
      relOffset,
    });
  }

  // 2. GPS SubIFD Entries
  if (latitude !== undefined && latitude !== null) {
    const isSouth = latitude < 0;
    const absLat = Math.abs(latitude);
    const d = Math.floor(absLat);
    const mFloat = (absLat - d) * 60;
    const m = Math.floor(mFloat);
    const s = Math.round((mFloat - m) * 60 * 100);

    // GPSLatitudeRef (ASCII, 2 bytes: 'N\0' hoặc 'S\0')
    const refChar = isSouth ? 'S' : 'N';
    gpsEntries.push({
      tag: 0x0001,
      type: 2,
      count: 2,
      val: Buffer.from(`${refChar}\0\0\0`, 'ascii'), // direct in value field
    });

    // GPSLatitude (RATIONAL x 3 = 24 bytes)
    const latBuf = Buffer.alloc(24);
    latBuf.writeUInt32LE(d, 0);
    latBuf.writeUInt32LE(1, 4);
    latBuf.writeUInt32LE(m, 8);
    latBuf.writeUInt32LE(1, 12);
    latBuf.writeUInt32LE(s, 16);
    latBuf.writeUInt32LE(100, 20);
    const relOffset = addData(latBuf);

    gpsEntries.push({
      tag: 0x0002,
      type: 5, // RATIONAL
      count: 3,
      relOffset,
    });
  }

  if (longitude !== undefined && longitude !== null) {
    const isWest = longitude < 0;
    const absLon = Math.abs(longitude);
    const d = Math.floor(absLon);
    const mFloat = (absLon - d) * 60;
    const m = Math.floor(mFloat);
    const s = Math.round((mFloat - m) * 60 * 100);

    // GPSLongitudeRef (ASCII)
    const refChar = isWest ? 'W' : 'E';
    gpsEntries.push({
      tag: 0x0003,
      type: 2,
      count: 2,
      val: Buffer.from(`${refChar}\0\0\0`, 'ascii'),
    });

    // GPSLongitude (RATIONAL x 3 = 24 bytes)
    const lonBuf = Buffer.alloc(24);
    lonBuf.writeUInt32LE(d, 0);
    lonBuf.writeUInt32LE(1, 4);
    lonBuf.writeUInt32LE(m, 8);
    lonBuf.writeUInt32LE(1, 12);
    lonBuf.writeUInt32LE(s, 16);
    lonBuf.writeUInt32LE(100, 20);
    const relOffset = addData(lonBuf);

    gpsEntries.push({
      tag: 0x0004,
      type: 5,
      count: 3,
      relOffset,
    });
  }

  if (accuracy !== undefined && accuracy !== null) {
    const accBuf = Buffer.alloc(8);
    accBuf.writeUInt32LE(Math.round(accuracy * 100), 0);
    accBuf.writeUInt32LE(100, 4);
    const relOffset = addData(accBuf);
    gpsEntries.push({
      tag: 0x001f, // GPSHPositioningError
      type: 5,
      count: 1,
      relOffset,
    });
  }

  if (gpsDateStamp) {
    const strBuf = Buffer.from(gpsDateStamp + '\0', 'ascii');
    const relOffset = addData(strBuf);
    gpsEntries.push({
      tag: 0x001d, // GPSDateStamp
      type: 2,
      count: strBuf.length,
      relOffset,
    });
  }

  if (gpsTimeStamp && Array.isArray(gpsTimeStamp)) {
    const timeBuf = Buffer.alloc(24);
    timeBuf.writeUInt32LE(gpsTimeStamp[0] || 0, 0);
    timeBuf.writeUInt32LE(1, 4);
    timeBuf.writeUInt32LE(gpsTimeStamp[1] || 0, 8);
    timeBuf.writeUInt32LE(1, 12);
    timeBuf.writeUInt32LE(gpsTimeStamp[2] || 0, 16);
    timeBuf.writeUInt32LE(1, 20);
    const relOffset = addData(timeBuf);
    gpsEntries.push({
      tag: 0x0007, // GPSTimeStamp
      type: 5,
      count: 3,
      relOffset,
    });
  }

  // Pointer entries in IFD0
  let ifd0Count = 0;
  if (exifEntries.length > 0) ifd0Count++;
  if (gpsEntries.length > 0) ifd0Count++;

  // Tính layout bộ nhớ TIFF:
  // Offset 0: Header (8 bytes)
  // Offset 8: IFD0: 2 bytes (count) + ifd0Count * 12 bytes + 4 bytes (next IFD = 0)
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  let currentOffset = 8 + ifd0Size;

  let exifIfdOffset = 0;
  if (exifEntries.length > 0) {
    exifIfdOffset = currentOffset;
    const exifIfdSize = 2 + exifEntries.length * 12 + 4;
    currentOffset += exifIfdSize;
  }

  let gpsIfdOffset = 0;
  if (gpsEntries.length > 0) {
    gpsIfdOffset = currentOffset;
    const gpsIfdSize = 2 + gpsEntries.length * 12 + 4;
    currentOffset += gpsIfdSize;
  }

  const heapBaseOffset = currentOffset;

  // Lắp ráp IFD0 entries
  if (exifEntries.length > 0) {
    ifd0Entries.push({
      tag: 0x8769, // ExifIFDPointer
      type: 4, // LONG
      count: 1,
      offset: exifIfdOffset,
    });
  }
  if (gpsEntries.length > 0) {
    ifd0Entries.push({
      tag: 0x8825, // GPSInfoIFDPointer
      type: 4, // LONG
      count: 1,
      offset: gpsIfdOffset,
    });
  }

  // Helper serialize 1 IFD entry (12 bytes)
  function writeEntry(buf, pos, entry) {
    buf.writeUInt16LE(entry.tag, pos);
    buf.writeUInt16LE(entry.type, pos + 2);
    buf.writeUInt32LE(entry.count, pos + 4);
    if (entry.val) {
      entry.val.copy(buf, pos + 8, 0, 4);
    } else if (entry.offset !== undefined) {
      buf.writeUInt32LE(entry.offset, pos + 8);
    } else if (entry.relOffset !== undefined) {
      buf.writeUInt32LE(heapBaseOffset + entry.relOffset, pos + 8);
    } else {
      buf.writeUInt32LE(0, pos + 8);
    }
  }

  // Tạo TIFF buffer hoàn chỉnh
  const fullHeapBuf = Buffer.concat(dataHeap);
  const totalTiffSize = heapBaseOffset + fullHeapBuf.length;
  const tiffBuf = Buffer.alloc(totalTiffSize);

  // TIFF Header
  tiffBuf.write('II', 0, 2, 'ascii');
  tiffBuf.writeUInt16LE(42, 2);
  tiffBuf.writeUInt32LE(8, 4); // IFD0 at offset 8

  // IFD0
  let p = 8;
  tiffBuf.writeUInt16LE(ifd0Entries.length, p);
  p += 2;
  for (const e of ifd0Entries) {
    writeEntry(tiffBuf, p, e);
    p += 12;
  }
  tiffBuf.writeUInt32LE(0, p); // Next IFD = 0
  p += 4;

  // Exif SubIFD
  if (exifEntries.length > 0) {
    p = exifIfdOffset;
    tiffBuf.writeUInt16LE(exifEntries.length, p);
    p += 2;
    for (const e of exifEntries) {
      writeEntry(tiffBuf, p, e);
      p += 12;
    }
    tiffBuf.writeUInt32LE(0, p);
    p += 4;
  }

  // GPS SubIFD
  if (gpsEntries.length > 0) {
    p = gpsIfdOffset;
    tiffBuf.writeUInt16LE(gpsEntries.length, p);
    p += 2;
    for (const e of gpsEntries) {
      writeEntry(tiffBuf, p, e);
      p += 12;
    }
    tiffBuf.writeUInt32LE(0, p);
    p += 4;
  }

  // Copy Heap
  fullHeapBuf.copy(tiffBuf, heapBaseOffset);

  // Đóng gói vào APP1 marker của JPEG
  // APP1 header: FF E1 + length (2 bytes BE, length tính cả 2 byte length) + 'Exif\0\0' + tiffBuf
  const app1Length = 2 + 6 + tiffBuf.length;
  const app1Header = Buffer.alloc(10);
  app1Header[0] = 0xff;
  app1Header[1] = 0xe1;
  app1Header.writeUInt16BE(app1Length, 2);
  app1Header.write('Exif\0\0', 4, 6, 'ascii');

  const soi = Buffer.from([0xff, 0xd8]);
  const eoi = Buffer.from([0xff, 0xd9]);

  return Buffer.concat([soi, app1Header, tiffBuf, eoi]);
}

/**
 * Tạo JPEG trơn không có EXIF
 */
function createPlainJpeg() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
}

/**
 * Tạo JPEG có EXIF marker nhưng nội dung bên trong hỏng
 */
function createCorruptedExifJpeg() {
  const soi = Buffer.from([0xff, 0xd8]);
  const app1 = Buffer.from([0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef, 0x12, 0x34]);
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([soi, app1, eoi]);
}

module.exports = {
  createJpegWithExif,
  createPlainJpeg,
  createCorruptedExifJpeg,
};
