const express = require('express');
const { signupForm, loginForm, signup, login, logout } = require('../controllers/authController');
const { yubiKeyAuth } = require('../middleware/yubiKeyAuth');

const router = express.Router();

// YubiKey verification required for login routes
router.get('/login', yubiKeyAuth, loginForm);
router.post('/login', yubiKeyAuth, login);

// Other auth routes
router.get('/signup', signupForm);
router.post('/signup', signup);
router.get('/logout', (req, res) => {
    // Clear YubiKey verification first
    if (req.session) {
        delete req.session.yubikeyVerified;
        req.session.save((err) => {
            if (err) console.error('Error saving session:', err);
            logout(req, res);
        });
    } else {
        logout(req, res);
    }
});

module.exports = router;
