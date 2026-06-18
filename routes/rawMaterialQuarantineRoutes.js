const express = require('express');
const router = express.Router();
const rawMaterialQuarantineController = require('../controllers/rawMaterialQuarantineController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(authenticate);

// Raw Material Warehouse routes
router.get('/list', authorize(['Raw Material Warehouse']), rawMaterialQuarantineController.listQuarantinedRawMaterials);

// Destroy and Reuse routes
router.post('/:id/destroy', authorize(['Raw Material Warehouse']), rawMaterialQuarantineController.destroy);
router.post('/:id/reuse', authorize(['Raw Material Warehouse']), rawMaterialQuarantineController.reuse);

module.exports = router;
