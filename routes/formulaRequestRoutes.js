const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { getFormulaRequestList } = require('../controllers/formulaRequestController');

router.get('/list', authenticate, authorize(['R&D']), getFormulaRequestList);

module.exports = router;
