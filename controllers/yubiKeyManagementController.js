const Yubikey = require('../models/yubikey');
const { 
    generateRegistrationOptions,
    verifyRegistrationResponse
} = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');
const crypto = require('crypto');

// WebAuthn configuration
const rpName = 'MIB Flow';
const rpID = 'localhost';
const origin = 'http://localhost:3000'; // Use fixed values for local development

const listYubikeys = async (req, res) => {
    try {
        const yubikeys = await Yubikey.findAll();
        res.render('yubikey-management', { yubikeys });
    } catch (error) {
        console.error('Error fetching Yubikeys:', error);
        res.status(500).send('Error fetching Yubikeys');
    }
};

const addYubikey = async (req, res) => {
    const { keyId, assignedTo, authType } = req.body;
    
    try {
        if (authType === 'webauthn') {
            // For WebAuthn, initiate registration process
            // Generate a random user ID
            const userID = crypto.randomBytes(16);

            // Generate registration options
            const options = await generateRegistrationOptions({
                rpName,
                rpID,
                userID,
                userName: assignedTo,
                attestationType: 'none',
                authenticatorSelection: {
                    authenticatorAttachment: 'cross-platform',
                    requireResidentKey: false,
                    userVerification: 'discouraged'
                },
                supportedAlgorithmIDs: [-7]
            });

            // Store challenge for verification
            req.session.registration = {
                challenge: options.challenge,
                assignedTo
            };

            // Convert challenge to base64url for client
            options.challenge = isoBase64URL.fromBuffer(options.challenge);
            options.user.id = isoBase64URL.fromBuffer(options.user.id);

            return res.json(options);
        } else {
            // For traditional OTP
            const actualKeyId = keyId.length > 12 ? keyId.substring(0, 12) : keyId;
            
            await Yubikey.create({
                keyId: actualKeyId,
                assignedTo,
                isActive: true,
                authType: 'otp'
            });
            
            return res.redirect('/yubikey-management');
        }
    } catch (error) {
        console.error('Error adding Yubikey:', error);
        if (authType === 'webauthn') {
            res.status(500).json({ error: 'Failed to generate registration options' });
        } else {
            res.status(500).send('Error adding Yubikey');
        }
    }
};

// Handle WebAuthn registration verification
const verifyRegistration = async (req, res) => {
    try {
        const expectedChallenge = req.session.registration?.challenge;
        const assignedTo = req.session.registration?.assignedTo;

        if (!req.body || !expectedChallenge || !assignedTo) {
            return res.status(400).json({ error: 'Invalid registration data' });
        }

        // Verify the registration response
        const verification = await verifyRegistrationResponse({
            response: req.body,
            expectedChallenge: Buffer.from(expectedChallenge, 'base64url'),
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: false
        });

        console.log('Verification result:', {
            verified: verification.verified,
            info: verification.registrationInfo ? {
                fmt: verification.registrationInfo.fmt,
                counter: verification.registrationInfo.counter,
                credentialID: isoBase64URL.fromBuffer(verification.registrationInfo.credentialID)
            } : null
        });

        if (!verification.verified) {
            throw new Error('Verification failed');
        }

        const { credentialID, credentialPublicKey } = verification.registrationInfo;
        
        // Format credential data
        const keyId = isoBase64URL.fromBuffer(credentialID).slice(0, 12); // First 12 chars as required
        const publicKey = isoBase64URL.fromBuffer(credentialPublicKey);

        // Create new YubiKey record
        const yubikey = await Yubikey.create({
            keyId,
            assignedTo,
            isActive: true,
            authType: 'webauthn',
            credentialPublicKey: publicKey,
            credentialCounter: 0,
            lastUsed: new Date()
        });

        console.log('Saving YubiKey with data:', {
            keyId,
            assignedTo,
            authType: 'webauthn',
            hasPublicKey: !!publicKey
        });

        // Clear registration data
        delete req.session.registration;

        console.log('Created WebAuthn YubiKey:', {
            id: yubikey.id,
            keyId: yubikey.keyId,
            assignedTo: yubikey.assignedTo
        });

        return res.json({ success: true });
    } catch (error) {
        console.error('Registration verification error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
};

const toggleYubikey = async (req, res) => {
    const { id } = req.params;
    
    try {
        const yubikey = await Yubikey.findByPk(id);
        if (!yubikey) {
            return res.status(404).send('Yubikey not found');
        }
        
        yubikey.isActive = !yubikey.isActive;
        await yubikey.save();
        
        res.redirect('/yubikey-management');
    } catch (error) {
        console.error('Error toggling Yubikey:', error);
        res.status(500).send('Error updating Yubikey');
    }
};

const deleteYubikey = async (req, res) => {
    const { id } = req.params;
    
    try {
        const yubikey = await Yubikey.findByPk(id);
        if (!yubikey) {
            return res.status(404).send('Yubikey not found');
        }
        
        await yubikey.destroy();
        res.redirect('/yubikey-management');
    } catch (error) {
        console.error('Error deleting Yubikey:', error);
        res.status(500).send('Error deleting Yubikey');
    }
};

module.exports = {
    listYubikeys,
    addYubikey,
    toggleYubikey,
    deleteYubikey,
    verifyRegistration
};
