import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env.js';

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret
});

/**
 * Upload buffer to Cloudinary
 * @param {Buffer} fileBuffer
 * @param {string} folder
 * @returns {Promise<{ url: string, public_id: string }>}
 */
export const uploadBufferToCloudinary = (fileBuffer, folder = 'foodsaver') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto'
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id
        });
      }
    );
    uploadStream.end(fileBuffer);
  });
};

export { cloudinary };
