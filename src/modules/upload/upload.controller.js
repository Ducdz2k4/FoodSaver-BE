import { uploadBufferToCloudinary } from '../../shared/utils/cloudinary.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const UploadController = {
  uploadSingle: asyncHandler(async (req, res) => {
    if (!req.file) {
      throw ApiError.badRequest('Vui lòng chọn một tệp hình ảnh để tải lên');
    }

    const folder = req.body.folder || 'foodsaver/uploads';
    const result = await uploadBufferToCloudinary(req.file.buffer, folder);

    return ApiResponse.created(res, {
      message: 'Tải lên hình ảnh thành công',
      data: {
        url: result.url,
        publicId: result.publicId
      }
    });
  }),

  uploadMultiple: asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      throw ApiError.badRequest('Vui lòng chọn ít nhất một tệp hình ảnh để tải lên');
    }

    const folder = req.body.folder || 'foodsaver/uploads';
    const uploadPromises = req.files.map((file) =>
      uploadBufferToCloudinary(file.buffer, folder)
    );

    const results = await Promise.all(uploadPromises);

    return ApiResponse.created(res, {
      message: 'Tải lên danh sách hình ảnh thành công',
      data: results.map((r) => ({
        url: r.url,
        publicId: r.publicId
      }))
    });
  })
};
