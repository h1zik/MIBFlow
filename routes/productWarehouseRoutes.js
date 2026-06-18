const express = require('express');
const { getProductWarehouse, deliverOrder, proceedToQC, proceedToPPIC, getUndeliveredOrders, deliverRemaining } = require('../controllers/productWarehouseController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticate, authorize(['Product Warehouse']), getProductWarehouse);
router.post('/deliver', authenticate, authorize(['Product Warehouse']), deliverOrder);
router.post('/proceed-to-qc', authenticate, authorize(['Product Warehouse']), proceedToQC);
router.post('/proceed-to-ppic', authenticate, authorize(['Product Warehouse']), proceedToPPIC);
router.get('/undelivered', authenticate, authorize(['Product Warehouse','PPIC']), getUndeliveredOrders);
router.post('/deliver-remaining/:id', authenticate, authorize(['Product Warehouse','PPIC']), deliverRemaining);

module.exports = router;
