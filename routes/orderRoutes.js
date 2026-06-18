const express = require('express');
const { createOrderForm, createOrder, checkStockForm, checkStock, getOrders, approveOrder, processOrder, declineOrder, addCustomerForm, addCustomer, checkOrderStock, requestFormula, getOrderDetails, deliverOrder, getDeliveredOrders, updateSONumber, updateDate, handlePPICRework, getProductsForCustomer } = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const fileUpload = require('../middleware/fileUpload');

const router = express.Router();

router.get('/create', authenticate, authorize(['Marketing']), createOrderForm);
router.post('/create', authenticate, authorize(['Marketing']), fileUpload.single('po'), createOrder);
router.get('/checkStock', authenticate, authorize(['PPIC']), checkStockForm);
router.post('/checkStock', authenticate, authorize(['PPIC']), checkStock);
router.get('/all', authenticate, authorize(['PPIC', 'Finance']), getOrders);
router.post('/approve/:id', authenticate, authorize(['PPIC']), approveOrder);
router.post('/process/:id', authenticate, authorize(['PPIC']), processOrder);
router.post('/decline/:id', authenticate, authorize(['PPIC']), declineOrder);
router.post('/deliver/:id', authenticate, authorize(['Marketing']), deliverOrder);
router.get('/delivered', authenticate, authorize(['Marketing','PPIC','Finance']), getDeliveredOrders);
router.post('/handle-rework', authenticate, authorize(['PPIC']), handlePPICRework);

// Routes for adding a customer
router.get('/addCustomer', authenticate, authorize(['Marketing']), addCustomerForm);
router.post('/addCustomer', authenticate, authorize(['Marketing']), addCustomer);
router.post('/checkStock/:id', authenticate, authorize(['PPIC']), checkOrderStock); // New route for checking stock

// Route to get products for a specific customer
router.get('/customer-products/:customerId', authenticate, authorize(['Marketing']), getProductsForCustomer);

router.post('/requestFormula/:id', authenticate, authorize(['PPIC']), requestFormula);

router.post('/:id/updateSO', authenticate, authorize(['Marketing']), updateSONumber);
router.post('/:id/updateDate', authenticate, authorize(['Marketing']), updateDate);
router.get('/:id', authenticate, authorize(['Marketing','PPIC','Product Warehouse','Finance']), getOrderDetails);
module.exports = router;
