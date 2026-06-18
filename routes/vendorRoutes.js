const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { getAddVendorForm, addVendor, getVendorList, getEditVendorForm, postEditVendor, deleteVendor } = require('../controllers/vendorController');
const { requestRawMaterialForm, requestRawMaterial, getRawMaterialRequestsForPpic, assignVendor, forwardRawMaterialRequestToFinance } = require('../controllers/rawMaterialRequestController');

const router = express.Router();

router.get('/ppic/addVendor', authenticate, authorize(['Purchase']), getAddVendorForm);
router.post('/ppic/addVendor', authenticate, authorize(['Purchase']), addVendor);
router.post('/ppic/forwardToFinance/:id', authenticate, authorize(['Purchase']), forwardRawMaterialRequestToFinance);
router.post('/ppic/assignVendor/:id', authenticate, authorize(['Purchase']), assignVendor);
// Route to display the vendor list
router.get('/vendorList', authenticate, authorize(['Purchase']), getVendorList);

// Route to display the edit vendor form
router.get('/edit/:id', authenticate, authorize(['Purchase']), getEditVendorForm);

// Route to handle the edit vendor form submission
router.post('/edit/:id', authenticate, authorize(['Purchase']), postEditVendor);

// Route to delete a vendor
router.post('/delete/:id', authenticate, authorize(['Purchase']), deleteVendor);

module.exports = router;
