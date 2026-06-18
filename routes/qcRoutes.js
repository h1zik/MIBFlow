const express = require('express');
const { 
    getQCProductionList, 
    updateQCStatus, 
    updateQCStatusRawMaterial,
    updateQCStatusPackaging,
    retainSample,
    getSampleRetainedProductions,
    generateSamplePDF,
    proceedToRework,
    rejectComplainItem,
    updateReworkStatus,
    retainReworkSample,
    generateReworkPDF,
    getRawMaterialHistory,
    getPackagingHistory,
    getProductionHistory
} = require('../controllers/qcController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/fileUpload');

const router = express.Router();

router.get('/list', authenticate, authorize(['QC']), getQCProductionList);
router.post('/updateStatus/:id', authenticate, authorize(['QC']), updateQCStatus);
router.post('/updateStatusRawMaterial/:id', authenticate, authorize(['QC']), updateQCStatusRawMaterial);
router.post('/retainSample/:id', authenticate, authorize(['QC']), upload.single('bgscan'), retainSample);
router.get('/sampleRetainedProductions', authenticate, authorize(['QC']), getSampleRetainedProductions);
router.get('/generatePDF/:id', authenticate, authorize(['QC']), generateSamplePDF);
router.post('/updateStatusPackaging/:id', authenticate, authorize(['QC']), updateQCStatusPackaging);
router.post('/proceed-to-rework', authenticate, authorize(['QC']), proceedToRework);
router.post('/reject-complain', authenticate, authorize(['QC']), rejectComplainItem);

// Rework QC routes
router.post('/updateReworkStatus/:id', authenticate, authorize(['QC']), updateReworkStatus);
router.post('/retainReworkSample/:id', authenticate, authorize(['QC']), retainReworkSample);
router.get('/generateReworkPDF/:id', authenticate, authorize(['QC']), generateReworkPDF);

// QC History routes
router.get('/raw-material-history', authenticate, authorize(['QC']), getRawMaterialHistory);
router.get('/packaging-history', authenticate, authorize(['QC']), getPackagingHistory);
router.get('/production-history', authenticate, authorize(['QC']), getProductionHistory);

module.exports = router;
