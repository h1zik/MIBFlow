const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { getDashboardForRole } = require('../utils/roleRoutes');

exports.signupForm = (req, res) => {
    res.render('auth/signup', {
        userRole: req.user ? req.user.role : null,
        path: '/auth/signup'
    });
};

exports.loginForm = (req, res) => {
    if (!req.session.yubikeyVerified) {
        return res.redirect('/yubikey-verify');
    }

    res.render('auth/login', {
        userRole: null,
        path: '/auth/login',
        error: req.query.error || null
    });
};

exports.signup = async (req, res) => {
    const { username, role, password } = req.body;

    if (!username || !role || !password) {
        return res.status(400).render('auth/signup', {
            error: 'All fields are required',
            userRole: null,
            path: '/auth/signup'
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, role, password: hashedPassword });
        res.redirect('/auth/login?error=Account created. Please sign in.');
    } catch (error) {
        console.error('Signup error:', error);
        res.status(400).render('auth/signup', {
            error: 'Could not create account. Username may already exist.',
            userRole: null,
            path: '/auth/signup'
        });
    }
};

exports.login = async (req, res) => {
    if (!req.session.yubikeyVerified) {
        return res.redirect('/yubikey-verify');
    }

    const { username, password } = req.body;

    if (!username || !password) {
        return res.render('auth/login', {
            error: 'Username and password are required',
            userRole: null,
            path: '/auth/login'
        });
    }

    try {
        const user = await User.findOne({ where: { username } });
        if (!user) {
            return res.render('auth/login', {
                error: 'user_not_found',
                userRole: null,
                path: '/auth/login'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('auth/login', {
                error: 'invalid_credentials',
                userRole: null,
                path: '/auth/login'
            });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 8 * 60 * 60 * 1000
        });

        return res.redirect(getDashboardForRole(user.role));
    } catch (error) {
        console.error('Login error:', error);
        return res.render('auth/login', {
            error: 'An error occurred. Please try again.',
            userRole: null,
            path: '/auth/login'
        });
    }
};

exports.logout = (req, res) => {
    if (req.session) {
        delete req.session.yubikeyVerified;
    }
    res.clearCookie('token');
    res.redirect('/auth/login');
};
