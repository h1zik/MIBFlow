const express = require('express');
const { showVerificationPage, verifyOTP, handleVerificationError } = require('../controllers/yubiKeyController');
const helmet = require('helmet');

const router = express.Router();

// Apply security middleware
router.use(helmet());

// Allow NFC API
router.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'nfc=*');
    next();
});

// Routes with proper error handling
router.get('/', showVerificationPage);
router.post('/', verifyOTP);

// Error handling middleware
router.use(handleVerificationError);

// Handle 404 errors
router.use((req, res) => {
    console.error('404 error:', {
        path: req.path,
        method: req.method
    });
    
    if (req.xhr || req.headers.accept?.includes('json')) {
        res.status(404).json({
            error: 'INVALID REQUEST'
        });
    } else {
        res.redirect('/yubikey-verify');
    }
});

// Handle other errors
router.use((err, req, res, next) => {
    console.error('YubiKey route error:', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });

    if (req.xhr || req.headers.accept?.includes('json')) {
        res.status(500).json({
            error: 'SYSTEM ERROR - PLEASE TRY AGAIN'
        });
    } else {
        res.redirect('/yubikey-verify?error=SYSTEM ERROR');
    }
});

module.exports = router;
