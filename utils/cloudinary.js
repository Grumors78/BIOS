const cloudinary = require('cloudinary').v2;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

let configured = false;

function ensureConfigured() {
  if (configured) return;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, ' +
      'CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your environment.'
    );
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });

  configured = true;
}

/**
 * Uploads a single image buffer to Cloudinary, scoped under a folder
 * per department so images stay organized and easy to list/delete by
 * department. Returns the Cloudinary result, which includes a
 * public_id (needed for delete) and secure_url.
 */
function uploadImageBuffer(buffer, department) {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `school-departments/${department}`,
        resource_type: 'image',
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

/**
 * Lists all images uploaded for a department, most recent first.
 */
async function listImages(department) {
  ensureConfigured();

  const result = await cloudinary.search
    .expression(`folder:school-departments/${department}`)
    .sort_by('created_at', 'desc')
    .max_results(200)
    .execute();

  return result.resources.map((r) => ({
    publicId: r.public_id,
    url: r.secure_url,
    filename: r.public_id.split('/').pop(),
    createdAt: r.created_at,
  }));
}

/**
 * Deletes an image from Cloudinary by its public_id.
 */
async function deleteImage(publicId) {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId);
}

module.exports = { uploadImageBuffer, listImages, deleteImage };
