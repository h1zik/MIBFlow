const express = require('express');
const router = express.Router();
const { 
    addPackagingForm, 
    addPackaging, 
    listPackagings, 
    renderEditPackagingPage, 
    updatePackaging, 
    deletePackaging,
    showAssignVendor,
    assignVendor,
    removeVendor,
    updateVendorPrice
} = require('../controllers/packagingController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.get('/add', authenticate, authorize(['Raw Material Warehouse']), addPackagingForm);
router.post('/add', authenticate, authorize(['Raw Material Warehouse']), addPackaging);
router.get('/list', authenticate, authorize(['Raw Material Warehouse', 'PPIC', 'Purchase']), listPackagings);
router.get('/edit/:id', authenticate, authorize(['Raw Material Warehouse','Purchase']), renderEditPackagingPage);
router.post('/edit/:id', authenticate, authorize(['Raw Material Warehouse','Purchase']), updatePackaging);
router.post('/delete/:id', authenticate, authorize(['Raw Material Warehouse']), deletePackaging);

// Vendor assignment routes
router.get('/assignVendor/:id', authenticate, authorize(['Purchase']), showAssignVendor);
router.post('/assignVendor/:id', authenticate, authorize(['Purchase']), assignVendor);
router.post('/removeVendor/:packagingId/:vendorId', authenticate, authorize(['Purchase']), removeVendor);
router.post('/updateVendorPrice/:packagingId/:vendorId', authenticate, authorize(['Purchase']), updateVendorPrice);

module.exports = router;
