const express = require('express');
const router = express.Router();
const { 
    returnMaterial, 
    noReturnMaterial, 
    setPaymentType, 
    setRealQuantity, 
    setTax,
    getReturnedPackagingHistory,
    getReturnedRawMaterialHistory
} = require('../controllers/purchaseController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.post('/returnMaterial/:id', authenticate, authorize(['Purchase']), returnMaterial);
router.post('/noReturnMaterial/:id', authenticate, authorize(['Purchase']), noReturnMaterial);
router.post('/setPaymentType/:id', authenticate, authorize(['Purchase']), setPaymentType);
router.post('/setRealQuantity/:id', authenticate, authorize(['Purchase']), setRealQuantity);
router.post('/setTax/:id', authenticate, authorize(['Purchase']), setTax);

// Return History Routes
router.get('/returned-packaging-history', authenticate, authorize(['Purchase']), getReturnedPackagingHistory);
router.get('/returned-raw-material-history', authenticate, authorize(['Purchase']), getReturnedRawMaterialHistory);


module.exports = router;
