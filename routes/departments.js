const express = require('express');
const { verifyAccess } = require('../utils/access-token');
const { listImages } = require('../utils/cloudinary');

const router = express.Router();

const DEPARTMENTS = {
  pharmacy: { name: 'Pharmacy', color: '#8A5A3B' },
  medicine: { name: 'Medicine', color: '#1B2A4A' },
  agriculture: { name: 'Agriculture', color: '#6B7D5E' },
  medlab: { name: 'Medical Laboratory Science', color: '#7A3B4A' },
  biochemistry: { name: 'Biochemistry', color: '#B8935F' },
};

function requireDept(req, res, next) {
  const dept = req.params.dept;
  if (!DEPARTMENTS[dept]) {
    return res.status(404).send('Department not found.');
  }
  req.deptInfo = DEPARTMENTS[dept];
  req.deptSlug = dept;
  next();
}

/**
 * GET /:dept
 * Shows either the paywall (if not paid) or the gallery (if paid),
 * decided purely server-side from the signed cookie — never trusts
 * anything the client claims about payment status.
 */
router.get('/:dept', requireDept, (req, res) => {
  const token = req.cookies[`access_${req.deptSlug}`];
  const hasAccess = verifyAccess(token, req.deptSlug);

  if (!hasAccess) {
    return res.render('paywall', {
      dept: req.deptSlug,
      deptName: req.deptInfo.name,
      deptColor: req.deptInfo.color,
    });
  }

  return res.render('gallery', {
    dept: req.deptSlug,
    deptName: req.deptInfo.name,
    deptColor: req.deptInfo.color,
  });
});

/**
 * GET /:dept/api/images
 * Returns the list of image URLs for a department — only if the
 * request carries a valid access token for that exact department.
 * Images themselves are hosted on Cloudinary; this route only gates
 * who receives the list of URLs, not the raw files.
 */
router.get('/:dept/api/images', requireDept, async (req, res) => {
  const token = req.cookies[`access_${req.deptSlug}`];
  if (!verifyAccess(token, req.deptSlug)) {
    return res.status(403).json({ error: 'Payment required.' });
  }

  try {
    const images = await listImages(req.deptSlug);
    res.json(images.map((img) => img.url));
  } catch (err) {
    console.error('[departments] Failed to list images:', err);
    res.status(500).json({ error: 'Could not load images right now.' });
  }
});

module.exports = router;
