const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { getApprovedOrders, printInvoice } = require('../controllers/orderController');
const { getFinanceRawMaterialRequests, approveRawMaterialRequest, declineRawMaterialRequest, payRawMaterialRequest, markAsPaid, proceedDelivery, deliverRawMaterial, getTopList, getRawMaterialRequestHistory, getOrderHistory, approvePackaging, declinePackaging, payPackaging, deliverPackaging, markOrderPaid } = require('../controllers/financeController');
const { markRawMaterialPaid } = require('../controllers/rawMaterialRequestController');
const consumableController = require('../controllers/consumableController');

const router = express.Router();

router.get('/finance', authenticate, authorize(['Finance']), getApprovedOrders);
router.get('/finance/print/:id', authenticate, authorize(['Finance']), printInvoice);

router.get('/finance/rawMaterialRequests', authenticate, authorize(['Finance']), getFinanceRawMaterialRequests);
router.post('/finance/approveRawMaterial/:id', authenticate, authorize(['Finance']), approveRawMaterialRequest);
router.post('/finance/declineRawMaterial/:id', authenticate, authorize(['Finance']), declineRawMaterialRequest);
router.post('/finance/payRawMaterial/:id', authenticate, authorize(['Finance']), payRawMaterialRequest);
router.post('/finance/markAsPaid/:orderId', authenticate, authorize(['Finance']), markAsPaid);
router.post('/finance/markOrderPaid/:id', authenticate, authorize(['Finance']), markOrderPaid);
router.post('/finance/proceedDelivery/:orderId', authenticate, authorize(['Finance']), proceedDelivery);
router.post('/finance/deliverRawMaterial/:id', authenticate, authorize(['Finance']), deliverRawMaterial);

// Packaging routes
router.post('/finance/approvePackaging/:id', authenticate, authorize(['Finance']), approvePackaging);
router.post('/finance/declinePackaging/:id', authenticate, authorize(['Finance']), declinePackaging);
router.post('/finance/payPackaging/:id', authenticate, authorize(['Finance']), payPackaging);
router.post('/finance/deliverPackaging/:id', authenticate, authorize(['Finance']), deliverPackaging);

router.get('/finance/top-list', authenticate, authorize(['Finance']), getTopList);
router.get('/finance/rawMaterialRequestHistory', authenticate, authorize(['Finance','PPIC','Purchase']), getRawMaterialRequestHistory);
router.get('/finance/orderHistory', authenticate, authorize(['Finance']), getOrderHistory);
router.post('/finance/markRawMaterialPaid/:id', authenticate, authorize(['Finance']), markRawMaterialPaid);
router.get('/finance/consumables', authenticate, authorize(['Finance']), consumableController.renderConsumablesPage);
router.post('/consumables/update/:id', authenticate, authorize(['Finance']), consumableController.updateConsumablePrice);



module.exports = router;
