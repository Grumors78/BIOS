const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { issueAdminToken, verifyAdminToken, ADMIN_SESSION_SECONDS } = require('../utils/admin-token');
const { listAllPayments } = require('../utils/store');
const { uploadImageBuffer, listImages, deleteImage } = require('../utils/cloudinary');

const router = express.Router();

const DEPARTMENTS = {
  pharmacy: { name: 'Pharmacy', color: '#8A5A3B' },
  medicine: { name: 'Medicine', color: '#1B2A4A' },
  agriculture: { name: 'Agriculture', color: '#6B7D5E' },
  medlab: { name: 'Medical Laboratory Science', color: '#7A3B4A' },
  biochemistry: { name: 'Biochemistry', color: '#B8935F' },
};

const VALID_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function isValidDept(dept) {
  return Object.prototype.hasOwnProperty.call(DEPARTMENTS, dept);
}

/**
 * Constant-time string comparison to avoid leaking how many characters
 * of a guessed username/password matched via response-timing.
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdmin(req, res, next) {
  const token = req.cookies.admin_session;
  if (!verifyAdminToken(token)) {
    return res.redirect('/admin/login');
  }
  next();
}

// Images are held in memory only long enough to stream to Cloudinary —
// never written to local disk, which wouldn't survive a redeploy anyway.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per image
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, VALID_EXT.includes(ext));
  },
});

// ---- Login ----

router.get('/login', (req, res) => {
  if (verifyAdminToken(req.cookies.admin_session)) {
    return res.redirect('/admin');
  }
  res.render('admin-login', { error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.render('admin-login', {
      error: 'Admin login is not configured yet. Set ADMIN_USERNAME and ADMIN_PASSWORD on the server.',
    });
  }

  const validUser = username && safeEqual(username, ADMIN_USERNAME);
  const validPass = password && safeEqual(password, ADMIN_PASSWORD);

  if (!validUser || !validPass) {
    return res.render('admin-login', { error: 'Incorrect username or password.' });
  }

  const token = issueAdminToken();
  res.cookie('admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ADMIN_SESSION_SECONDS * 1000,
  });
  res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_session');
  res.redirect('/admin/login');
});

// ---- Dashboard ----

router.get('/', requireAdmin, async (req, res) => {
  try {
    const depts = await Promise.all(
      Object.entries(DEPARTMENTS).map(async ([slug, info]) => {
        let count = 0;
        try {
          const images = await listImages(slug);
          count = images.length;
        } catch (err) {
          console.error(`[admin] Failed to count images for ${slug}:`, err);
        }
        return { slug, name: info.name, color: info.color, count };
      })
    );

    res.render('admin-dashboard', { depts });
  } catch (err) {
    console.error('[admin] Dashboard load error:', err);
    res.status(500).send('Could not load the dashboard right now. Please try again shortly.');
  }
});

// ---- Payments ----
// Must be registered before GET /:dept, or Express will match
// "/admin/payments" as if "payments" were a department slug.

router.get('/payments', requireAdmin, async (req, res) => {
  try {
    const payments = await listAllPayments(); // already sorted most-recent-first
    res.render('admin-payments', { payments, deptNames: DEPARTMENTS });
  } catch (err) {
    console.error('[admin] Failed to load payments:', err);
    res.status(500).send('Could not load payment records right now. Please try again shortly.');
  }
});

router.get('/:dept', requireAdmin, async (req, res) => {
  const dept = req.params.dept;
  if (!isValidDept(dept)) return res.status(404).send('Department not found.');

  try {
    const images = await listImages(dept);
    res.render('admin-department', {
      dept,
      deptName: DEPARTMENTS[dept].name,
      deptColor: DEPARTMENTS[dept].color,
      images,
    });
  } catch (err) {
    console.error(`[admin] Failed to load images for ${dept}:`, err);
    res.status(500).send('Could not load images right now. Please try again shortly.');
  }
});

// ---- Upload ----

router.post('/:dept/upload', requireAdmin, (req, res) => {
  const dept = req.params.dept;
  if (!isValidDept(dept)) return res.status(404).send('Department not found.');

  upload.array('images', 20)(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.redirect(`/admin/${dept}?error=upload_failed`);
    }

    const files = req.files || [];

    try {
      await Promise.all(files.map((file) => uploadImageBuffer(file.buffer, dept)));
      return res.redirect(`/admin/${dept}`);
    } catch (uploadErr) {
      console.error('Cloudinary upload error:', uploadErr);
      return res.redirect(`/admin/${dept}?error=upload_failed`);
    }
  });
});

// ---- Delete ----

router.post('/:dept/delete', requireAdmin, async (req, res) => {
  const dept = req.params.dept;
  const { publicId } = req.body;
  if (!isValidDept(dept)) return res.status(404).send('Department not found.');

  if (publicId) {
    try {
      await deleteImage(publicId);
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  res.redirect(`/admin/${dept}`);
});

module.exports = router;
