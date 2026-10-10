"use strict";

const cloudinary = require("cloudinary").v2;

const isConfigured = Boolean(
  process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET)
);

if (isConfigured) {
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config();
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
}

/**
 * Kiểm tra xem Cloudinary đã được cấu hình đầy đủ chưa.
 */
function isCloudinaryConfigured() {
  return isConfigured;
}

/**
 * Upload buffer ảnh lên Cloudinary qua upload_stream
 * @param {Buffer} buffer - Buffer dữ liệu nhị phân của ảnh
 * @param {Object} [options] - Tuỳ chọn thêm (folder, filename,...)
 * @returns {Promise<{url: string, public_id: string, bytes: number, format: string}>}
 */
function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    if (!isConfigured) {
      return reject(new Error("Cloudinary chưa được cấu hình"));
    }

    const uploadOptions = {
      folder: options.folder || "construction_management/task_logs",
      resource_type: "image",
      ...options,
    };

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve({
          url: result.secure_url || result.url,
          public_id: result.public_id,
          bytes: result.bytes,
          format: result.format,
        });
      }
    );

    stream.end(buffer);
  });
}

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
  uploadToCloudinary,
};
