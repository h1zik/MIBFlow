const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { 
    requestPackagingForm, 
    requestPackaging, 
    getPackagingRequestsForPpic,
    getPackagingRequests, 
    updatePackagingStock, 
    testToQC, 
    markAsReceived, 
    createPackagingRequest,
    submitSplitQuantities,
    setRealQuantity,
    forwardToFinance,
    returnPackagingVendor,
    noReturnPackagingVendor,
    updatePoNumber,
    receivedFailedPackaging,
    completePackagingRequest,
    getPackagingRequestHistory
} = require('../controllers/packagingRequestController');

const {
    approvePackaging,
    declinePackaging,
    payPackaging,
    deliverPackaging
} = require('../controllers/financeController');

const {
    updateQCStatusPackaging
} = require('../controllers/qcController');

const router = express.Router();

// PPIC routes
router.get('/requestPackaging', authenticate, authorize(['PPIC']), requestPackagingForm);
router.post('/requestPackaging', authenticate, authorize(['PPIC']), requestPackaging);
router.get('/dashboard/ppic', authenticate, authorize(['PPIC']), getPackagingRequestsForPpic);
router.post('/', authenticate, authorize(['PPIC']), createPackagingRequest);
router.post('/complete/:id', authenticate, authorize(['PPIC']), completePackagingRequest);

// Purchase routes
router.post('/purchase/setRealQuantity/:id', authenticate, authorize(['Purchase']), setRealQuantity);
router.post('/purchase/submitSplitQuantities/:id', authenticate, authorize(['Purchase']), submitSplitQuantities);
router.post('/purchase/forwardToFinance/:id', authenticate, authorize(['Purchase']), forwardToFinance);
router.post('/vendor/:id/return', authenticate, authorize(['Purchase']), returnPackagingVendor);
router.post('/vendor/:id/no-return', authenticate, authorize(['Purchase']), noReturnPackagingVendor);
router.post('/purchase/updatePoNumber/:id', authenticate, authorize(['Purchase']), updatePoNumber);

// Raw Material Warehouse routes
router.get('/dashboard/rawMaterialWarehouse', authenticate, authorize(['Raw Material Warehouse']), getPackagingRequests);
router.post('/updateStock/:id', authenticate, authorize(['Raw Material Warehouse']), updatePackagingStock);
router.post('/testToQC/:id', authenticate, authorize(['Raw Material Warehouse']), testToQC);
router.post('/received/:id', authenticate, authorize(['Raw Material Warehouse']), markAsReceived);
router.post('/receivedFailedPackaging/:id', authenticate, authorize(['Raw Material Warehouse']), receivedFailedPackaging);

// Finance routes
router.post('/finance/approve/:id', authenticate, authorize(['Finance']), approvePackaging);
router.post('/finance/decline/:id', authenticate, authorize(['Finance']), declinePackaging);
router.post('/finance/pay/:id', authenticate, authorize(['Finance']), payPackaging);
router.post('/finance/deliver/:id', authenticate, authorize(['Finance']), deliverPackaging);

// QC routes
router.post('/qc/updateStatus/:id', authenticate, authorize(['QC']), updateQCStatusPackaging);

// History route (accessible by PPIC and Purchase)
router.get('/history', authenticate, authorize(['PPIC', 'Purchase']), getPackagingRequestHistory);

module.exports = router;
