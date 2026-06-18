const express = require('express');
const router = express.Router();
const { 
    generateAuthenticationOptions,
    verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');
const Yubikey = require('../models/yubikey');

// WebAuthn configuration
const rpName = 'MIB Flow';
const rpID = process.env.RPID || 'localhost';
const origin = process.env.ORIGIN || `https://${rpID}`;

// Generate authentication options
router.get('/challenge', async (req, res) => {
    try {
        // Get all active WebAuthn credentials
        const activeKeys = await Yubikey.findAll({
            where: {
                isActive: true,
                authType: 'webauthn'
            }
        });

        // Format credentials for WebAuthn
        const allowCredentials = activeKeys.map(key => ({
            id: Buffer.from(key.keyId, 'base64'),
            type: 'public-key',
            transports: ['nfc', 'internal', 'usb']
        }));

        const options = await generateAuthenticationOptions({
            rpID,
            timeout: 60000,
            allowCredentials,
            userVerification: 'discouraged',
            authenticatorAttachment: 'platform',
            requireResidentKey: false
        });

        // Save challenge in session for verification
        req.session.currentChallenge = options.challenge;
        
        res.json(options);
    } catch (error) {
        console.error('Error generating authentication options:', error);
        res.status(500).json({ error: 'Failed to start authentication' });
    }
});

// Verify authentication response
router.post('/verify', async (req, res) => {
    try {
        const { authData } = req.body;
        const expectedChallenge = req.session.currentChallenge;

        if (!authData || !expectedChallenge) {
            return res.status(400).json({ error: 'Invalid authentication data' });
        }

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
                throw new Error('YubiKey not found or not active');
            }

        const verification = await verifyAuthenticationResponse({
            response: authData,
            expectedChallenge: req.session.currentChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            authenticator: {
                credentialPublicKey: Buffer.from(yubikey.credentialPublicKey, 'base64'),
                credentialID: Buffer.from(yubikey.keyId, 'base64'),
                counter: yubikey.credentialCounter,
                transports: ['nfc', 'internal', 'usb']
            },
            requireUserVerification: false
        });

            if (verification.verified) {
                // Update counter and last used timestamp
                await yubikey.incrementCounter();

                // Set session data
                req.session.authenticated = true;
                req.session.authMethod = 'webauthn';
                req.session.yubikey = {
                    id: yubikey.id,
                    assignedTo: yubikey.assignedTo
                };
                delete req.session.currentChallenge;

                req.session.save((err) => {
                    if (err) {
                        console.error('Session save error:', err);
                        return res.status(500).json({ error: 'Failed to save session' });
                    }
                    res.json({ success: true, redirect: '/dashboard' });
                });
            } else {
                res.status(401).json({ error: 'Verification failed' });
            }
        } catch (error) {
            console.error('Verification error:', error);
            res.status(400).json({ error: error.message });
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Handle NFC verification
router.post('/nfc-verify', async (req, res) => {
    try {
        const { serialNumber } = req.body;

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
        req.session.yubikey = {
            id: yubikey.id,
            assignedTo: yubikey.assignedTo
        };

        res.json({ success: true, redirect: '/dashboard' });
    } catch (error) {
        console.error('NFC verification error:', error);
        res.status(500).json({ error: 'NFC verification failed' });
    }
});

module.exports = router;
