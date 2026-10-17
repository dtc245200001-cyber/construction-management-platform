'use strict';

/**
 * Helpers tạo các loại ảnh buffer để test T-109 / S-42
 */

const {
  createJpegWithExif,
  createPlainJpeg,
  createCorruptedExifJpeg,
  createPngWithExif,
  createPlainPng,
  createWebpWithExif,
  createPlainWebp,
} = require('./jpegWithExif');

/**
 * Tạo PNG buffer với kích thước tuỳ chỉnh (mô phỏng ảnh chụp màn hình điện thoại)
 */
function createPngBuffer(width = 1080, height = 2400) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = Buffer.alloc(25);
  ihdrChunk.writeUInt32BE(13, 0); // data length
  ihdrChunk.write('IHDR', 4, 4, 'ascii');
  ihdrChunk.writeUInt32BE(width, 8);
  ihdrChunk.writeUInt32BE(height, 12);
  ihdrChunk.writeUInt8(8, 16); // 8-bit depth
  ihdrChunk.writeUInt8(6, 17); // RGBA
  ihdrChunk.writeUInt8(0, 18); // deflate
  ihdrChunk.writeUInt8(0, 19); // no filter
  ihdrChunk.writeUInt8(0, 20); // no interlace
  ihdrChunk.writeUInt32BE(0, 21); // crc
  return Buffer.concat([header, ihdrChunk]);
}

/**
 * Tạo JPEG buffer có kích thước tùy biến thông qua marker SOF0
 */
function createJpegWithDimensions(width = 1080, height = 2400, exifBuffer = null) {
  const soi = Buffer.from([0xff, 0xd8]);
  const sof0 = Buffer.alloc(19);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(17, 2);
  sof0[4] = 8;
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0[9] = 3;
  sof0[10] = 1; sof0[11] = 0x22; sof0[12] = 0;
  sof0[13] = 2; sof0[14] = 0x11; sof0[15] = 1;
  sof0[16] = 3; sof0[17] = 0x11; sof0[18] = 1;
  const eoi = Buffer.from([0xff, 0xd9]);

  if (exifBuffer) {
    // Tách phần giữa SOI và EOI của exifBuffer
    const exifMiddle = exifBuffer.slice(2, exifBuffer.length - 2);
    return Buffer.concat([soi, exifMiddle, sof0, eoi]);
  }

  return Buffer.concat([soi, sof0, eoi]);
}

module.exports = {
  createJpegWithExif,
  createPlainJpeg,
  createCorruptedExifJpeg,
  createPngBuffer,
  createJpegWithDimensions,
  createPngWithExif,
  createPlainPng,
  createWebpWithExif,
  createPlainWebp,
};
