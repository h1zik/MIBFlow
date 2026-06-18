// routes/overheadRoutes.js
const express = require('express');
const router = express.Router();
const { calculateOverhead, renderOverheadCalculationPage, renderAddLaborPage, addLabor, renderAddUtilityPage, addUtility, renderCogsCalculatorPage, calculateCogs, getProductFormulas } = require('../controllers/overheadController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.get('/calculate-overhead', authenticate, authorize(['Finance']), renderOverheadCalculationPage);
router.post('/calculate-overhead', authenticate, authorize(['Finance']), calculateOverhead);
router.get('/labor/add', authenticate, authorize(['Finance']), renderAddLaborPage);
router.post('/labor/add', authenticate, authorize(['Finance']), addLabor);
router.get('/utility/add', authenticate, authorize(['Finance']), renderAddUtilityPage);
router.post('/utility/add', authenticate, authorize(['Finance']), addUtility);
router.get('/cogs-calculator', authenticate, authorize(['Finance']), renderCogsCalculatorPage);
router.post('/calculate-cogs', authenticate, authorize(['Finance']), calculateCogs);
router.get('/api/product-formulas', authenticate, authorize(['Finance']), getProductFormulas);


module.exports = router;
