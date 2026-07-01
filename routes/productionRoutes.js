const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { getScheduleProductionForm, scheduleProduction, produceBatch, getStockUpdatedProductions, getProductionScheduleData, getProductionSchedule, renderEquipmentPage, addBalance, addForklift, setBGReceived } = require('../controllers/productionController');

const router = express.Router();

// NOTE: production stock completion is handled solely by productionRequestController.updateStock
// (mounted at POST /production/updateStock/:id). The old divergent productionController.updateStock
// endpoint was removed to avoid two code paths mutating the same Production without an Inbound/guard.
router.post('/produceBatch/:id', authenticate, authorize(['Production']), produceBatch);
router.get('/productions/stock-updated', authenticate, authorize(['Production']), getStockUpdatedProductions);
router.get('/productionSchedule', authenticate, authorize(['Production']), getProductionSchedule);
router.get('/productionSchedule/data', authenticate, authorize(['Production']), getProductionScheduleData);
router.get('/equipment', authenticate, authorize(['Finance']), renderEquipmentPage);
router.post('/add-balance', authenticate, authorize(['Finance']), addBalance);
router.post('/add-forklift', authenticate, authorize(['Finance']), addForklift);




module.exports = router;
