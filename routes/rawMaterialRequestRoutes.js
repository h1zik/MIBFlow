const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { requestRawMaterialForm, requestRawMaterial, getRawMaterialRequestsForPpic, assignVendor, forwardRawMaterialRequestToFinance, getPaidRawMaterialRequests, updateRawMaterialStock, testToQC, markAsReceived, receivedFailedMaterial, getCompletedRawMaterialRequests, createRawMaterialRequest, submitSplitQuantities, markRequestAsCompleted, updatePoNumber} = require('../controllers/rawMaterialRequestController');

const router = express.Router();

router.get('/requestRawMaterial', authenticate, authorize(['PPIC']), requestRawMaterialForm);
router.post('/requestRawMaterial', authenticate, authorize(['PPIC']), requestRawMaterial);
router.get('/dashboard/ppic', authenticate, authorize(['PPIC']), getRawMaterialRequestsForPpic);
router.post('/ppic/assignVendor/:id', authenticate, authorize(['Purchase']), assignVendor);
router.post('/ppic/forwardToFinance/:id', authenticate, authorize(['Purchase']), forwardRawMaterialRequestToFinance);

router.get('/dashboard/rawMaterialWarehouse', authenticate, authorize(['Raw Material Warehouse']), getPaidRawMaterialRequests);
router.post('/updateStock/:id', authenticate, authorize(['Raw Material Warehouse']), updateRawMaterialStock);
router.post('/testToQC/:id', authenticate, authorize(['Raw Material Warehouse']), testToQC);

router.post('/received/:id', authenticate, authorize(['Raw Material Warehouse']), markAsReceived);
router.post('/receivedFailedMaterial/:id', authenticate, authorize(['Raw Material Warehouse']), receivedFailedMaterial);
router.get('/completed', authenticate, authorize(['Purchase']), getCompletedRawMaterialRequests);

router.post('/raw-material-request', authenticate, authorize(['PPIC']), createRawMaterialRequest);

router.post('/splitQuantity/:id', authenticate, authorize(['Purchase']), submitSplitQuantities);

// Route for marking raw material request as completed
router.post('/complete/:id', authenticate, authorize(['PPIC']), markRequestAsCompleted);

// Route for viewing raw material request history
router.get('/history', authenticate, authorize(['PPIC', 'Purchase']), require('../controllers/financeController').getRawMaterialRequestHistory);

// Route for updating PO number for vendor requests
router.post('/updatePoNumber/:id', authenticate, authorize(['Purchase']), updatePoNumber);

module.exports = router;
