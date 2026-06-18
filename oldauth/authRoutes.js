const express = require('express');
const { signupForm, loginForm, signup, login, logout } = require('../controllers/authController');

const router = express.Router();

router.get('/signup', signupForm);
router.get('/login', loginForm);
router.post('/signup', signup);
router.post('/login', login);
router.get('/logout', logout);  // Add this line

module.exports = router;
