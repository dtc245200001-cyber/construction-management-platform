/**
 * Helper tạo JPEG / PNG / WebP buffer với cấu trúc metadata EXIF hợp lệ cho unit/integration testing
 * Story S-40: T-105, Story S-42: T-109
 */

'use strict';

const zlib = require('zlib');

/**
 * Xây dựng TIFF buffer chuẩn (Little-Endian 'II')
 */
function buildTiffBuffer(options = {}) {
  const {
    dateTimeOriginal,
    offsetTimeOriginal,
    latitude,
    longitude,
    accuracy,
    gpsDateStamp,
    gpsTimeStamp,
    make,
    model,
    software,
    iso,
    fNumber,
    exposureTime,
  } = options;

  const ifd0Entries = [];
  const exifEntries = [];
  const gpsEntries = [];
  const dataHeap = [];

  let heapOffset = 0;
  function addData(buf) {
    const start = heapOffset;
    dataHeap.push(buf);
    heapOffset += buf.length;
    if (buf.length % 2 !== 0) {
      dataHeap.push(Buffer.from([0]));
      heapOffset += 1;
    }
    return start;
  }

  function addDataOrInline(buf) {
    if (buf.length <= 4) {
      const inlineBuf = Buffer.alloc(4);
      buf.copy(inlineBuf, 0);
      return { val: inlineBuf };
    }
    const relOffset = addData(buf);
    return { relOffset };
  }

  // IFD0: Make, Model, Software
  if (make) {
    const strBuf = Buffer.from(make + '\0', 'ascii');
    const storage = addDataOrInline(strBuf);
    ifd0Entries.push({
      tag: 0x010f, // Make
      type: 2, // ASCII
      count: strBuf.length,
      ...storage,
    });
  }

  if (model) {
    const strBuf = Buffer.from(model + '\0', 'ascii');
    const storage = addDataOrInline(strBuf);
    ifd0Entries.push({
      tag: 0x0110, // Model
      type: 2, // ASCII
      count: strBuf.length,
      ...storage,
    });
  }

  if (software) {
    const strBuf = Buffer.from(software + '\0', 'ascii');
    const storage = addDataOrInline(strBuf);
    ifd0Entries.push({
      tag: 0x0131, // Software
      type: 2, // ASCII
      count: strBuf.length,
      ...storage,
    });
  }

  // Exif SubIFD: DateTimeOriginal, OffsetTimeOriginal, ISO, FNumber, ExposureTime
  if (dateTimeOriginal) {
    const strBuf = Buffer.from(dateTimeOriginal + '\0', 'ascii');
    const storage = addDataOrInline(strBuf);
    exifEntries.push({
      tag: 0x9003, // DateTimeOriginal
      type: 2, // ASCII
      count: strBuf.length,
      ...storage,
    });
  }

  if (offsetTimeOriginal) {
    const strBuf = Buffer.from(offsetTimeOriginal + '\0', 'ascii');
    const storage = addDataOrInline(strBuf);
    exifEntries.push({
      tag: 0x9011, // OffsetTimeOriginal
      type: 2, // ASCII
      count: strBuf.length,
      ...storage,
    });
  }

  if (iso !== undefined && iso !== null) {
    const isoVal = Buffer.alloc(4);
    isoVal.writeUInt16LE(Number(iso), 0);
    exifEntries.push({
      tag: 0x8827, // PhotographicSensitivity / ISO
      type: 3, // SHORT
      count: 1,
      val: isoVal,
    });
  }

  if (fNumber !== undefined && fNumber !== null) {
    const fnBuf = Buffer.alloc(8);
    fnBuf.writeUInt32LE(Math.round(fNumber * 10), 0);
    fnBuf.writeUInt32LE(10, 4);
    exifEntries.push({
      tag: 0x829d, // FNumber
      type: 5, // RATIONAL
      count: 1,
      relOffset: addData(fnBuf),
    });
  }

  if (exposureTime !== undefined && exposureTime !== null) {
    const expBuf = Buffer.alloc(8);
    if (exposureTime < 1) {
      expBuf.writeUInt32LE(1, 0);
      expBuf.writeUInt32LE(Math.round(1 / exposureTime), 4);
    } else {
      expBuf.writeUInt32LE(Math.round(exposureTime), 0);
      expBuf.writeUInt32LE(1, 4);
    }
    exifEntries.push({
      tag: 0x829a, // ExposureTime
      type: 5, // RATIONAL
      count: 1,
      relOffset: addData(expBuf),
    });
  }

  // GPS SubIFD: Latitude, Longitude, Accuracy, DateStamp, TimeStamp
  if (latitude !== undefined && latitude !== null) {
    const isSouth = latitude < 0;
    const absLat = Math.abs(latitude);
    const d = Math.floor(absLat);
    const mFloat = (absLat - d) * 60;
    const m = Math.floor(mFloat);
    const s = Math.round((mFloat - m) * 60 * 100);

    const refChar = isSouth ? 'S' : 'N';
    gpsEntries.push({
      tag: 0x0001,
      type: 2,
      count: 2,
      val: Buffer.from(`${refChar}\0\0\0`, 'ascii'),
    });

    const latBuf = Buffer.alloc(24);
    latBuf.writeUInt32LE(d, 0);
    latBuf.writeUInt32LE(1, 4);
    latBuf.writeUInt32LE(m, 8);
    latBuf.writeUInt32LE(1, 12);
    latBuf.writeUInt32LE(s, 16);
    latBuf.writeUInt32LE(100, 20);
    gpsEntries.push({
      tag: 0x0002,
      type: 5, // RATIONAL
      count: 3,
      relOffset: addData(latBuf),
    });
  }

  if (longitude !== undefined && longitude !== null) {
    const isWest = longitude < 0;
    const absLon = Math.abs(longitude);
    const d = Math.floor(absLon);
    const mFloat = (absLon - d) * 60;
    const m = Math.floor(mFloat);
    const s = Math.round((mFloat - m) * 60 * 100);

    const refChar = isWest ? 'W' : 'E';
    gpsEntries.push({
      tag: 0x0003,
      type: 2,
      count: 2,
      val: Buffer.from(`${refChar}\0\0\0`, 'ascii'),
    });

    const lonBuf = Buffer.alloc(24);
    lonBuf.writeUInt32LE(d, 0);
    lonBuf.writeUInt32LE(1, 4);
    lonBuf.writeUInt32LE(m, 8);
    lonBuf.writeUInt32LE(1, 12);
    lonBuf.writeUInt32LE(s, 16);
    lonBuf.writeUInt32LE(100, 20);
    gpsEntries.push({
      tag: 0x0004,
      type: 5,
      count: 3,
      relOffset: addData(lonBuf),
    });
  }

  if (accuracy !== undefined && accuracy !== null) {
    const accBuf = Buffer.alloc(8);
    accBuf.writeUInt32LE(Math.round(accuracy * 100), 0);
    accBuf.writeUInt32LE(100, 4);
    gpsEntries.push({
      tag: 0x001f, // GPSHPositioningError
      type: 5,
      count: 1,
      relOffset: addData(accBuf),
    });
  }

  if (gpsDateStamp) {
    const strBuf = Buffer.from(gpsDateStamp + '\0', 'ascii');
    gpsEntries.push({
      tag: 0x001d,
      type: 2,
      count: strBuf.length,
      relOffset: addData(strBuf),
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
    gpsEntries.push({
      tag: 0x0007,
      type: 5,
      count: 3,
      relOffset: addData(timeBuf),
    });
  }

  // Pointer entries in IFD0
  let ifd0Count = ifd0Entries.length;
  if (exifEntries.length > 0) ifd0Count++;
  if (gpsEntries.length > 0) ifd0Count++;

  const ifd0Size = 2 + ifd0Count * 12 + 4;
  let currentOffset = 8 + ifd0Size;

  let exifIfdOffset = 0;
  if (exifEntries.length > 0) {
    exifIfdOffset = currentOffset;
    const exifIfdSize = 2 + exifEntries.length * 12 + 4;
    currentOffset += exifIfdSize;
    ifd0Entries.push({
      tag: 0x8769, // ExifIFDPointer
      type: 4, // LONG
      count: 1,
      offset: exifIfdOffset,
    });
  }

  let gpsIfdOffset = 0;
  if (gpsEntries.length > 0) {
    gpsIfdOffset = currentOffset;
    const gpsIfdSize = 2 + gpsEntries.length * 12 + 4;
    currentOffset += gpsIfdSize;
    ifd0Entries.push({
      tag: 0x8825, // GPSInfoIFDPointer
      type: 4, // LONG
      count: 1,
      offset: gpsIfdOffset,
    });
  }

  const heapBaseOffset = currentOffset;

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

  const fullHeapBuf = Buffer.concat(dataHeap);
  const totalTiffSize = heapBaseOffset + fullHeapBuf.length;
  const tiffBuf = Buffer.alloc(totalTiffSize);

  // TIFF Header
  tiffBuf.write('II', 0, 2, 'ascii');
  tiffBuf.writeUInt16LE(42, 2);
  tiffBuf.writeUInt32LE(8, 4);

  // IFD0
  let p = 8;
  tiffBuf.writeUInt16LE(ifd0Entries.length, p);
  p += 2;
  for (const e of ifd0Entries) {
    writeEntry(tiffBuf, p, e);
    p += 12;
  }
  tiffBuf.writeUInt32LE(0, p);
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
  }

  fullHeapBuf.copy(tiffBuf, heapBaseOffset);
  return tiffBuf;
}

/**
 * Tạo JPEG buffer với EXIF
 */
function createJpegWithExif(options = {}) {
  const tiffBuf = buildTiffBuffer(options);

  const app1Length = 2 + 6 + tiffBuf.length;
  const app1Header = Buffer.alloc(10);
  app1Header[0] = 0xff;
  app1Header[1] = 0xe1;
  app1Header.writeUInt16BE(app1Length, 2);
  app1Header.write('Exif\0\0', 4, 6, 'ascii');

  const soi = Buffer.from([0xff, 0xd8]);

  // Thêm SOF0 marker để JPEG có kích thước width x height nếu được yêu cầu
  let sof0 = Buffer.alloc(0);
  if (options.width && options.height) {
    sof0 = Buffer.alloc(11);
    sof0[0] = 0xff;
    sof0[1] = 0xc0; // SOF0
    sof0.writeUInt16BE(9, 2); // Length
    sof0[4] = 8; // Precision
    sof0.writeUInt16BE(options.height, 5);
    sof0.writeUInt16BE(options.width, 7);
    sof0[9] = 1; // 1 component
    sof0[10] = 0;
  }

  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([soi, app1Header, tiffBuf, sof0, eoi]);
}

/**
 * Tạo JPEG trơn không có EXIF
 */
function createPlainJpeg(width = 800, height = 600) {
  const soi = Buffer.from([0xff, 0xd8]);
  const jfif = Buffer.from([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const sof0 = Buffer.alloc(11);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(9, 2);
  sof0[4] = 8;
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0[9] = 1;
  sof0[10] = 0;
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([soi, jfif, sof0, eoi]);
}

/**
 * Tạo JPEG có EXIF marker nhưng nội dung bên trong hỏng
 */
function createCorruptedExifJpeg() {
  const soi = Buffer.from([0xff, 0xd8]);
  const app1 = Buffer.from([
    0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef, 0x12, 0x34,
  ]);
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([soi, app1, eoi]);
}

/**
 * Tạo PNG buffer có metadata EXIF (qua chunk eXIf)
 */
function createPngWithExif(options = {}) {
  const width = options.width || 1280;
  const height = options.height || 720;
  const tiffBuf = buildTiffBuffer(options);

  // 1. Signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // 2. IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type RGB
  const ihdrTypeAndData = Buffer.concat([Buffer.from('IHDR'), ihdrData]);
  const ihdrCrc = zlib.crc32(ihdrTypeAndData);
  const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4);
  ihdrChunk.writeUInt32BE(13, 0);
  Buffer.from('IHDR').copy(ihdrChunk, 4);
  ihdrData.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(ihdrCrc, 21);

  // 3. eXIf Chunk
  const exifTypeAndData = Buffer.concat([Buffer.from('eXIf'), tiffBuf]);
  const exifCrc = zlib.crc32(exifTypeAndData);
  const exifChunk = Buffer.alloc(4 + 4 + tiffBuf.length + 4);
  exifChunk.writeUInt32BE(tiffBuf.length, 0);
  Buffer.from('eXIf').copy(exifChunk, 4);
  tiffBuf.copy(exifChunk, 8);
  exifChunk.writeUInt32BE(exifCrc, 8 + tiffBuf.length);

  // 4. IEND Chunk
  const iendType = Buffer.from('IEND');
  const iendCrc = zlib.crc32(iendType);
  const iendChunk = Buffer.alloc(12);
  iendChunk.writeUInt32BE(0, 0);
  iendType.copy(iendChunk, 4);
  iendChunk.writeUInt32BE(iendCrc, 8);

  return Buffer.concat([sig, ihdrChunk, exifChunk, iendChunk]);
}

/**
 * Tạo PNG trơn không có metadata EXIF
 */
function createPlainPng(width = 800, height = 600) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  const ihdrTypeAndData = Buffer.concat([Buffer.from('IHDR'), ihdrData]);
  const ihdrCrc = zlib.crc32(ihdrTypeAndData);
  const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4);
  ihdrChunk.writeUInt32BE(13, 0);
  Buffer.from('IHDR').copy(ihdrChunk, 4);
  ihdrData.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(ihdrCrc, 21);

  const iendType = Buffer.from('IEND');
  const iendCrc = zlib.crc32(iendType);
  const iendChunk = Buffer.alloc(12);
  iendChunk.writeUInt32BE(0, 0);
  iendType.copy(iendChunk, 4);
  iendChunk.writeUInt32BE(iendCrc, 8);

  return Buffer.concat([sig, ihdrChunk, iendChunk]);
}

/**
 * Tạo WebP buffer có metadata EXIF (qua container VP8X + chunk EXIF)
 */
function createWebpWithExif(options = {}) {
  const width = options.width || 1920;
  const height = options.height || 1080;
  const tiffBuf = buildTiffBuffer(options);

  // VP8X Chunk (extended format with EXIF flag bit 3)
  const vp8xData = Buffer.alloc(10);
  vp8xData.writeUInt32LE(0x08, 0); // EXIF flag bit set
  vp8xData.writeUIntLE(width - 1, 4, 3);
  vp8xData.writeUIntLE(height - 1, 7, 3);
  const vp8xChunk = Buffer.concat([Buffer.from('VP8X'), Buffer.from([10, 0, 0, 0]), vp8xData]);

  // EXIF Chunk
  const exifChunkHeader = Buffer.alloc(8);
  Buffer.from('EXIF').copy(exifChunkHeader, 0);
  exifChunkHeader.writeUInt32LE(tiffBuf.length, 4);

  let exifPayload = tiffBuf;
  if (tiffBuf.length % 2 !== 0) {
    exifPayload = Buffer.concat([tiffBuf, Buffer.from([0])]);
  }

  const exifChunk = Buffer.concat([exifChunkHeader, exifPayload]);

  const webpBody = Buffer.concat([vp8xChunk, exifChunk]);
  const riffHeader = Buffer.from('RIFF\0\0\0\0WEBP', 'ascii');
  riffHeader.writeUInt32LE(webpBody.length + 4, 4);

  return Buffer.concat([riffHeader, webpBody]);
}

/**
 * Tạo WebP trơn không có metadata (dùng VP8 lossy header chuẩn)
 */
function createPlainWebp(width = 800, height = 600) {
  // VP8 lossy header (30 bytes tối thiểu để extractImageDimensions đọc được)
  const vp8Data = Buffer.alloc(18);
  // Bytes 0..2: frame tag, 3..5: start code 9d 01 2a
  vp8Data[3] = 0x9d;
  vp8Data[4] = 0x01;
  vp8Data[5] = 0x2a;
  vp8Data.writeUInt16LE(width & 0x3fff, 6);
  vp8Data.writeUInt16LE(height & 0x3fff, 8);

  const vp8Chunk = Buffer.alloc(4 + 4 + vp8Data.length);
  Buffer.from('VP8 ').copy(vp8Chunk, 0);
  vp8Chunk.writeUInt32LE(vp8Data.length, 4);
  vp8Data.copy(vp8Chunk, 8);

  const riffHeader = Buffer.from('RIFF\0\0\0\0WEBP', 'ascii');
  riffHeader.writeUInt32LE(vp8Chunk.length + 4, 4);

  return Buffer.concat([riffHeader, vp8Chunk]);
}

module.exports = {
  buildTiffBuffer,
  createJpegWithExif,
  createPlainJpeg,
  createCorruptedExifJpeg,
  createPngWithExif,
  createPlainPng,
  createWebpWithExif,
  createPlainWebp,
};
