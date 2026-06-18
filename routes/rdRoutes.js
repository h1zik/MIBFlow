const express = require('express');
const { getRAndDOrders, uploadFormula, declineFormulaRequest } = require('../controllers/orderController');
const { requestFormula, getInsertRawMaterials, submitRawMaterials } = require('../controllers/rdController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/fileUpload');

const router = express.Router();

router.post('/uploadFormula/:id', authenticate, authorize(['R&D']), upload.single('formula'), uploadFormula);
router.post('/declineFormula/:id', authenticate, authorize(['R&D']), declineFormulaRequest);

// Raw materials routes
router.post('/request-formula/:complainItemId', authenticate, authorize(['PPIC']), requestFormula);
router.get('/insert-raw-materials/:complainItemId', authenticate, authorize(['R&D']), getInsertRawMaterials);
router.post('/submit-raw-materials', authenticate, authorize(['R&D']), submitRawMaterials);

module.exports = router;
