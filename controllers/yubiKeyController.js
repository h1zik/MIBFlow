const { verifyYubiKey, verifyWebAuthn, markSessionAsVerified } = require('../middleware/yubiKeyAuth');
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

const showVerificationPage = [csrfProtection, async (req, res) => {
    // Generate a nonce for CSP
    const nonce = Buffer.from(Math.random().toString()).toString('base64');
    
    // Set security headers
    res.setHeader('Content-Security-Policy', 
        `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.yubico.com`
    );

    res.render('yubikey-verify', { 
        error: req.query.error,
        csrfToken: req.csrfToken()
    });
}];

const verifyOTP = [csrfProtection, async (req, res) => {
    console.log('Received verification request:', {
        body: req.body,
        method: req.method,
        headers: req.headers,
        csrfToken: req.csrfToken(),
        sessionID: req.sessionID
    });

    // Check if this is a WebAuthn verification
    if (req.body.authData) {
        console.log('WebAuthn verification request detected');
        return verifyWebAuthnResponse(req, res);
    }

    // Log session state
    console.log('Current session state:', {
        id: req.sessionID,
        yubikeyVerified: req.session.yubikeyVerified,
        yubikeyVerifiedAt: req.session.yubikeyVerifiedAt,
        authMethod: req.session.authMethod
    });

    const otp = req.body.otp || (req.body.data && JSON.parse(req.body.data).otp);
    console.log('Extracted OTP:', otp);

    try {
        // Get client IP with proxy support
        const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

        // Get the verification method from request body
        const method = req.body.method || 'usb';
        console.log('Using verification method:', method);

        // Input validation and sanitization
        if (!otp || typeof otp !== 'string') {
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(400).json({ error: 'INVALID OTP FORMAT' });
            }
            return res.redirect('/yubikey-verify?error=INVALID OTP FORMAT');
        }

        // Validate based on method
        if (method === 'usb' && otp.length !== 44) {
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(400).json({ error: 'INVALID USB OTP FORMAT' });
            }
            return res.redirect('/yubikey-verify?error=INVALID USB OTP FORMAT');
        }

        if (method === 'app' && (otp.length !== 6 || !/^\d{6}$/.test(otp))) {
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(400).json({ error: 'INVALID APP CODE FORMAT' });
            }
            return res.redirect('/yubikey-verify?error=INVALID APP CODE FORMAT');
        }

        // Clean the OTP based on method
        const finalOTP = method === 'usb' ? otp.replace(/[^a-zA-Z0-9]/g, '') : otp;
        if (method === 'usb' && finalOTP !== otp) {
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(400).json({ error: 'INVALID USB OTP FORMAT' });
            }
            return res.redirect('/yubikey-verify?error=INVALID USB OTP FORMAT');
        }
        
        // Verify the Yubikey OTP
        console.log('Attempting verification with:', { finalOTP, clientIP, method });
        const isValid = await verifyYubiKey(finalOTP, clientIP, method);
        console.log('Verification result:', isValid);
        
        if (isValid) {
            console.log('Verification successful, saving session');
            // Mark the session as verified
            markSessionAsVerified(req.sessionID, clientIP);
            
            // Store YubiKey verification status in session
            req.session.yubikeyVerified = true;
            req.session.yubikeyVerifiedAt = new Date();
            req.session.authMethod = method; // Store the authentication method used
            
            // Save session before redirecting
            req.session.save((err) => {
                console.log('Session saved with:', {
                    verified: req.session.yubikeyVerified,
                    verifiedAt: req.session.yubikeyVerifiedAt,
                    authMethod: req.session.authMethod
                });
                if (err) {
                    console.error('Error saving session:', err);
                    return res.redirect('/yubikey-verify?error=SESSION ERROR');
                }
                // Set headers to prevent caching
                res.set({
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                });

                // Send success response before redirecting
                if (req.xhr || req.headers.accept?.includes('application/json')) {
                    return res.json({ success: true, redirect: '/auth/login' });
                }
                
                // For non-AJAX requests, redirect
                return res.redirect(303, '/auth/login');
            });
        } else {
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(401).json({ error: 'VERIFICATION FAILED - PLEASE TRY AGAIN' });
            }
            return res.redirect('/yubikey-verify?error=VERIFICATION FAILED - PLEASE TRY AGAIN');
        }
    } catch (error) {
        res.redirect('/yubikey-verify?error=VERIFICATION FAILED - PLEASE TRY AGAIN');
    }
}];

// Handle verification page errors
const handleVerificationError = (err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            error: 'SECURITY VIOLATION - INVALID SESSION TOKEN'
        });
    }
    next(err);
};

// Handle WebAuthn verification response
const verifyWebAuthnResponse = async (req, res) => {
    try {
        const { authData } = req.body;
        const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

        const isValid = await verifyWebAuthn(authData, clientIP);
        
        if (isValid) {
            // Mark the session as verified
            markSessionAsVerified(req.sessionID, clientIP);
            
            // Store verification status in session
            req.session.yubikeyVerified = true;
            req.session.yubikeyVerifiedAt = new Date();
            req.session.authMethod = 'webauthn';
            
            // Save session before redirecting
            req.session.save((err) => {
                if (err) {
                    console.error('Error saving session:', err);
                    return res.status(500).json({ error: 'SESSION ERROR' });
                }
                res.json({ success: true, redirect: '/auth/login' });
            });
        } else {
            res.status(401).json({ error: 'VERIFICATION FAILED - PLEASE TRY AGAIN' });
        }
    } catch (error) {
        res.status(500).json({ error: 'VERIFICATION ERROR' });
    }
};

// Handle NFC YubiKey verification
const verifyNFC = async (req, res) => {
    const { serialNumber } = req.body;

    try {
        // Find YubiKey by serial number
        const yubikey = await Yubikey.findOne({
            where: {
                keyId: serialNumber,
                isActive: true,
                authType: 'webauthn'
            }
        });

        if (!yubikey) {
            return res.status(401).json({ error: 'YubiKey not found or inactive' });
        }

        // Update last used timestamp
        yubikey.lastUsed = new Date();
        await yubikey.save();

        // Set session authentication
        req.session.authenticated = true;
        req.session.authMethod = 'nfc';

        res.json({ success: true, redirect: '/dashboard' });
    } catch (error) {
        res.status(500).json({ error: 'VERIFICATION FAILED - PLEASE TRY AGAIN' });
    }
};

module.exports = {
    showVerificationPage,
    verifyOTP,
    handleVerificationError,
    verifyWebAuthnResponse,
    verifyNFC
};
