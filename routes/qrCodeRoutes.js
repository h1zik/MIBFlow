const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { authenticator } = require('otplib');

// Generate a secret key for the user
const generateSecret = () => {
    return authenticator.generateSecret();
};

// Generate QR code for authenticator app
router.get('/generate-qr', async (req, res) => {
    try {
        // Generate a new secret
        const secret = generateSecret();
        
        // Store the secret in the session for verification
        req.session.totpSecret = secret;
        
        // Create the otpauth URL
        const otpauthUrl = authenticator.keyuri(
            'user@mib-flow.com',  // User identifier
            'MIB Flow',           // Service name
            secret
        );

        // Generate QR code
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
        
        res.json({
            qrCode: qrCodeDataUrl,
            secret: secret // This is shown to the user as a backup
        });
    } catch (error) {
        console.error('QR Code generation error:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Verify TOTP code
router.post('/verify-totp', (req, res) => {
    const { token } = req.body;
    const secret = req.session.totpSecret;

    if (!secret) {
        return res.status(400).json({ error: 'No secret found. Please generate a new QR code.' });
    }

    try {
        // Configure TOTP options
        authenticator.options = { 
            window: 1,        // Allow 1 step before/after for time drift
            step: 30,         // 30 second time step
            digits: 6         // 6 digit code
        };

        // For TOTP verification:
        // 1. token is the user-provided code
        // 2. secret is what we stored in the session
        const isValid = authenticator.check(token, secret);
        
        console.log('TOTP Verification:', {
            token,
            secret,
            isValid,
            currentTime: Math.floor(Date.now() / 1000),
            expectedToken: authenticator.generate(secret)
        });

        if (isValid) {
            // Mark session as verified
            req.session.yubikeyVerified = true;
            req.session.yubikeyVerifiedAt = new Date();
            req.session.authMethod = 'totp';
            
            res.json({ 
                success: true, 
                redirect: '/',
                message: 'TOTP verification successful'
            });
        } else {
            res.status(401).json({ error: 'Invalid code' });
        }
    } catch (error) {
        console.error('TOTP verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

module.exports = router;
