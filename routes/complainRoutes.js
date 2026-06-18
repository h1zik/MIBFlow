const express = require('express');
const router = express.Router();
const complainController = require('../controllers/complainController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const productWarehouseController = require('../controllers/productWarehouseController');

// Apply authentication middleware to all routes
router.use(authenticate);

// Marketing routes
router.get('/create', authorize(['Marketing']), complainController.getCreateComplain);
router.post('/create', authorize(['Marketing']), complainController.createComplain);
router.post('/update-status', authorize(['Marketing']), complainController.updateComplainStatus);

// Production routes for rework scheduling
router.get('/scheduleRework/:id', authorize(['Production', 'Production Head', 'QC']), complainController.getScheduleReworkForm);
router.post('/scheduleRework/:id', authorize(['Production', 'Production Head', 'QC']), complainController.scheduleRework);
router.post('/request-rework/:complainItemId', authorize(['PPIC']), complainController.requestRework);

// Rework production routes
router.post('/produceBatch/:id', authorize(['Production', 'Production Head']), complainController.produceBatch);
router.post('/sendToQC/:id', authorize(['Production', 'Production Head']), complainController.sendToQC);
router.post('/updateStock/:id', authorize(['Production', 'Production Head']), complainController.updateStock);
// Raw material handling for rework
router.post('/setRawMaterialChoice/:id', authorize(['Production', 'Production Head']), complainController.setRawMaterialChoice);
router.post('/addRawMaterial/:id', authorize(['Production', 'Production Head']), complainController.addRawMaterial);
router.post('/quarantine/:id', authorize(['Production', 'Production Head']), complainController.quarantine);

router.post('/proceedToDeliver/:id', authorize(['Production', 'Production Head']), complainController.proceedToDeliver);
router.post('/deliver-rework/:id', authorize(['Product Warehouse']), productWarehouseController.deliverRework);

// Shared routes
router.get('/', authorize(['Marketing', 'Production', 'Production Head', 'QC', 'PPIC']), complainController.getComplains);
router.get('/view/:id', authorize(['Marketing', 'Production', 'Production Head', 'QC', 'PPIC']), complainController.viewComplain);

// PPIC routes
router.post('/complete/:complainId', authorize(['PPIC']), complainController.completeComplain);

module.exports = router;
