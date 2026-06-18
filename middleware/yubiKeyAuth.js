const Yub = require('yub');
const Yubikey = require('../models/yubikey');
const { verifyAuthenticationResponse } = require('@simplewebauthn/server');
const { hotp } = require('otplib');

// Configure HOTP settings
hotp.options = { 
    algorithm: 'sha1',
    digits: 6,
    counter: 0
};

// The secret is stored on the YubiKey itself
// We only need to track the counter
let hotpCounter = 0;

// Store verified Yubikey sessions with encryption
const crypto = require('crypto');
const verifiedSessions = new Map();

// Initialize Yubico client
const yub = new Yub(
    process.env.YUBIKEY_CLIENT_ID,
    process.env.YUBIKEY_SECRET_KEY
);

// Function to encrypt session data
const encryptSession = (sessionId) => {
    const key = crypto.scryptSync(process.env.SESSION_SECRET || 'your-secret-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(sessionId, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + encrypted + ':' + authTag.toString('hex');
};

// Function to decrypt session data
const decryptSession = (encryptedData) => {
    const [ivHex, encryptedHex, authTagHex] = encryptedData.split(':');
    const key = crypto.scryptSync(process.env.SESSION_SECRET || 'your-secret-key', 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

// WebAuthn configuration
const rpName = 'MIB Flow';
const rpID = process.env.RPID || 'localhost';
const origin = process.env.ORIGIN || `https://${rpID}`;

const yubiKeyAuth = (req, res, next) => {
    // Temporarily bypass Yubikey authentication
    req.session.yubikeyVerified = true;
    req.session.yubikeyVerifiedAt = new Date();
    next();

    /* Original authentication code (commented out temporarily)
    // Skip verification for YubiKey verification, management pages, and successful responses
    if (req.originalUrl === '/yubikey-verify' || 
        req.originalUrl.startsWith('/yubikey-management') ||
        req.session.yubikeyVerified) {
        return next();
    }

    // Check YubiKey verification for login
    if (!req.session.yubikeyVerified) {
        return res.redirect('/yubikey-verify');
    }

    // Check verification expiry (30 minutes)
    const verifiedAt = new Date(req.session.yubikeyVerifiedAt);
    if (Date.now() - verifiedAt.getTime() > 30 * 60 * 1000) {
        req.session.yubikeyVerified = false;
        delete req.session.yubikeyVerifiedAt;
        delete req.session.authMethod;
        return res.redirect('/yubikey-verify');
    }
    */
};

// Verify WebAuthn authentication
const verifyWebAuthn = async (authData, ip) => {
    try {
        // Find the corresponding YubiKey
        const yubikey = await Yubikey.findOne({
            where: {
                keyId: authData.id,
                authType: 'webauthn',
                isActive: true
            }
        });

        if (!yubikey) {
            console.error('WebAuthn YubiKey not found or not active');
            return false;
        }

        // Verify the authentication response
        const verification = await verifyAuthenticationResponse({
            response: authData,
            expectedChallenge: req.session.currentChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            authenticator: {
                credentialPublicKey: Buffer.from(yubikey.credentialPublicKey, 'base64'),
                credentialID: Buffer.from(yubikey.keyId, 'base64'),
                counter: yubikey.credentialCounter
            }
        });

        if (verification.verified) {
            // Update counter and last used timestamp
            yubikey.credentialCounter = verification.authenticationInfo.newCounter;
            yubikey.lastUsed = new Date();
            yubikey.lastUsedIP = ip;
            await yubikey.save();
            return true;
        }

        return false;
    } catch (error) {
        console.error('WebAuthn verification error:', error);
        return false;
    }
};

const verifyYubiKey = async (otp, ip, method = 'usb') => {
    console.log('Starting YubiKey verification:', { method, ip });
    try {
        if (!otp || typeof otp !== 'string') {
            console.log('Invalid OTP format');
            return false;
        }

        // Handle different verification methods
        if (method === 'app') {
            console.log('Using authenticator app method');
            // Verify 6-digit TOTP code
            if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
                console.log('Invalid app code format');
                return false;
            }

            // For OATH/HOTP verification
            console.log('OATH/HOTP code received:', otp);
            
            try {
                // For HOTP, we need to try a window of counter values
                // This handles cases where the counter might be out of sync
                const window = 10;
                for (let i = 0; i < window; i++) {
                    const currentCounter = hotpCounter + i;
                    // The YubiKey generates the code using the secret stored on it
                    // We just need to verify the code matches our counter
                    if (otp === hotp.generate('', currentCounter)) {
                        hotpCounter = currentCounter + 1;
                        console.log('OATH/HOTP code verification successful');
                        return true;
                    }
                }
                console.log('Invalid OATH/HOTP code');
                return false;
            } catch (error) {
                console.error('HOTP verification error:', error);
                return false;
            }
        } else {
            console.log('Using USB YubiKey method');
            // USB YubiKey OTP verification
            if (otp.length !== 44) {
                console.log('Invalid USB OTP length');
                return false;
            }

            // Handle NFC data format
            const finalOTP = otp.startsWith('nfc:') ? otp.substring(4) : otp;
            console.log('Processed OTP:', finalOTP);

            // First 12 characters of OTP is the Yubikey ID
            const keyId = finalOTP.substring(0, 12);
            console.log('Extracted YubiKey ID:', keyId);

            // Check if this Yubikey is registered and active
            let yubikey = await Yubikey.findOne({
                where: {
                    keyId: keyId,
                    isActive: true
                }
            });
            console.log('Found YubiKey in database:', !!yubikey);

            // Auto-register YubiKey if it's valid but not registered
            if (!yubikey) {
                console.log('YubiKey not registered, attempting auto-registration');
                // Verify with Yubico servers first
                const isValidKey = await new Promise((resolve) => {
                    yub.verify(otp, (err, data) => {
                        resolve(err ? false : (data && data.status === 'OK'));
                    });
                });

                if (!isValidKey) return false;

                // Auto-register YubiKey
                yubikey = await Yubikey.create({
                    keyId: keyId,
                    assignedTo: 'Auto-registered user',
                    isActive: true,
                    lastUsed: new Date(),
                    lastUsedIP: ip
                });
            }

            // Prevent rapid consecutive attempts
            const lastUsedTime = yubikey.lastUsed ? new Date(yubikey.lastUsed).getTime() : 0;
            if (Date.now() - lastUsedTime < 2000) {
                console.log('Rate limit exceeded');
                return false;
            }

            // Verify with Yubico servers
            const isValid = await new Promise((resolve) => {
                yub.verify(otp, (err, data) => {
                    resolve(err ? false : (data && data.status === 'OK'));
                });
            });

            if (!isValid) return false;

            // Update last used timestamp and IP
            yubikey.lastUsed = new Date();
            yubikey.lastUsedIP = ip;
            await yubikey.save();
            return true;
        }
    } catch (error) {
        return false;
    }
};

const markSessionAsVerified = (sessionId, ip) => {
    const encryptedSessionId = encryptSession(sessionId);
    verifiedSessions.set(encryptedSessionId, {
        timestamp: Date.now(),
        ip: ip
    });

    // Clean up old sessions
    for (const [key, value] of verifiedSessions.entries()) {
        if (Date.now() - value.timestamp > 30 * 60 * 1000) {
            verifiedSessions.delete(key);
        }
    }
};

module.exports = {
    yubiKeyAuth,
    verifyYubiKey,
    verifyWebAuthn,
    markSessionAsVerified
};
