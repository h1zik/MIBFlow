const express = require('express');
const { getRawMaterialStock, editRawMaterial, updateRawMaterial, deleteRawMaterial, assignVendorPage, assignVendor, removeVendor, updateVendorPrice, testUpdateVendorPrice} = require('../controllers/rawMaterialController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/rawMaterialStock', authenticate, authorize(['PPIC','Raw Material Warehouse','Purchase']), getRawMaterialStock);
router.get('/edit/:id', authenticate, authorize(['Raw Material Warehouse','Purchase']), editRawMaterial);
router.post('/update/:id', authenticate, authorize(['Raw Material Warehouse','Purchase']), updateRawMaterial);
router.post('/delete/:id', authenticate, authorize(['Raw Material Warehouse','Purchase']), deleteRawMaterial);
router.get('/assignVendor/:id', authenticate, authorize(['Purchase']), assignVendorPage);
router.post('/assignVendor/:id', authenticate, authorize(['Purchase']), assignVendor);
router.post('/removeVendor/:rawMaterialId/:vendorId', authenticate, authorize(['Purchase']), removeVendor);
router.post('/updateVendorPrice/:rawMaterialId/:vendorId', authenticate, authorize(['Purchase']), updateVendorPrice);

// Test route without authentication for debugging
router.post('/testUpdateVendorPrice/:rawMaterialId/:vendorId', testUpdateVendorPrice);

module.exports = router;
