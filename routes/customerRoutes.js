const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.get('/list', authenticate, authorize(['Marketing']), customerController.getCustomerList);
router.get('/edit/:id', authenticate, authorize(['Marketing']), customerController.getEditCustomerForm);
router.post('/edit/:id', authenticate, authorize(['Marketing']), customerController.postEditCustomer);
router.post('/delete/:id', authenticate, authorize(['Marketing']), customerController.deleteCustomer);

module.exports = router;
