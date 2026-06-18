const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const tdsmsdsRequestController = require('../controllers/tdsmsdsRequestController');
const upload = require('../middleware/fileUpload');

// Create a new request
router.post('/create', authenticate, authorize(['Marketing']), tdsmsdsRequestController.createRequest);

// Approve a request
router.post('/approve/:id', authenticate, authorize(['R&D']), tdsmsdsRequestController.approveRequest);

// Decline a request
router.post('/decline/:id', authenticate, authorize(['R&D']), tdsmsdsRequestController.declineRequest);

router.post(
    '/upload/:id',
    authenticate,
    authorize(['R&D']),
    upload.fields([
        { name: 'tds', maxCount: 1 },
        { name: 'msds', maxCount: 1 }
    ]),
    tdsmsdsRequestController.uploadFile
);

module.exports = router;
