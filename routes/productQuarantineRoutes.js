const express = require('express');
const router = express.Router();
const productQuarantineController = require('../controllers/productQuarantineController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(authenticate);

// Product Warehouse routes
router.get('/list', authorize(['Product Warehouse']), productQuarantineController.listQuarantinedProducts);

module.exports = router;
