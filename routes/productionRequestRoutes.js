const express = require('express');
const { requestProductionForm, requestProduction, getProductionRequests, approveProductionRequest, declineProductionRequest, sendToQC, updateStock, renderRequestProductionPage, createProductionRequest, viewProductionRequest, clearProductionRequest, getCompletedProductionRequests, getRawMaterials, addRawMaterial, setRawMaterialChoice} = require('../controllers/productionRequestController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/fileUpload');
const { getScheduleProductionForm, scheduleProduction, produceBatch, printProduction, quarantineProduction, setBGReceived, getBlendingGuide} = require('../controllers/productionController');
const { retainSample} = require('../controllers/qcController');
const { createAutoRawMaterialRequest} = require('../controllers/rawMaterialRequestController');
const { deleteKanbanCard } = require('../controllers/ppicKanbanController');
const router = express.Router();

// Kanban: permanently delete a card's record (PPIC only)
router.post('/kanban/delete/:type/:id', authenticate, authorize(['PPIC']), deleteKanbanCard);

router.get('/requestProduction', authenticate, authorize(['PPIC']), requestProductionForm);
router.post('/requestProduction', authenticate, authorize(['PPIC']), upload.single('formula'), requestProduction);
router.post('/requestRawMaterial', authenticate, authorize(['PPIC']), createAutoRawMaterialRequest);


router.get('/rawMaterials', authenticate, authorize(['PPIC']), getRawMaterials);

router.get('/production', authenticate, authorize(['Production']), getProductionRequests);
router.post('/approve/:id', authenticate, authorize(['Production']), approveProductionRequest);
router.post('/decline/:id', authenticate, authorize(['Production']), declineProductionRequest);
router.post('/sendToQC/:id', authenticate, authorize(['Production']), sendToQC);
router.post('/updateStock/:id', authenticate, authorize(['Production']), updateStock);

router.get('/schedule/:id', authenticate, getScheduleProductionForm);
router.post('/schedule/:id', authenticate, scheduleProduction);

router.post('/produceBatch/:id', authenticate, authorize(['Production']), produceBatch);
router.post('/qc/retainSample/:id', retainSample);

router.get('/request/:orderId', authenticate, authorize(['PPIC']), renderRequestProductionPage);
router.post('/request', authenticate, authorize(['PPIC']), upload.any(), createProductionRequest);

router.get('/:id/view', authenticate, authorize(['Production','PPIC']), viewProductionRequest);

router.post('/:id/clear', authenticate, authorize(['PPIC']), clearProductionRequest);

router.get('/productionRequest/history', authenticate, authorize(['PPIC']), getCompletedProductionRequests);

router.post('/print/:id', authenticate, authorize(['Production','PPIC']), printProduction);
router.get('/blending-guide/:id', authenticate, authorize(['Production','PPIC']), getBlendingGuide);
router.post('/quarantine/:id', authenticate, authorize(['Production']), quarantineProduction);
router.post('/setRawMaterialChoice/:id', authenticate, authorize(['Production']), setRawMaterialChoice);
router.post('/addRawMaterial/:id', authenticate, authorize(['Production']), addRawMaterial);

router.post('/setBGReceived/:id', authenticate, authorize(['Production']), setBGReceived);

module.exports = router;
