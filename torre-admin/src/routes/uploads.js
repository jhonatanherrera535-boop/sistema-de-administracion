const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();

router.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo (campo "file")' });

  const url = `/uploads/${req.file.filename}`;
  res.status(201).json({
    ok: true,
    url,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// Manejador de errores específico de multer
router.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo supera los 10 MB' });
  }
  res.status(400).json({ error: err.message || 'Error al subir el archivo' });
});

module.exports = router;