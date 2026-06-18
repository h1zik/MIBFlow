const express = require('express');
const { 
    listYubikeys, 
    addYubikey, 
    toggleYubikey, 
    deleteYubikey,
    verifyRegistration
} = require('../controllers/yubiKeyManagementController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticate);
router.use(authorize(['Marketing']));

// Only allow Marketing role to access these routes

router.get('/', listYubikeys);
router.post('/add', addYubikey);
router.post('/verify-registration', verifyRegistration); // WebAuthn registration verification
router.post('/toggle/:id', toggleYubikey);
router.post('/delete/:id', deleteYubikey);

module.exports = router;
