const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

exports.signupForm = (req, res) => {
    res.render('auth/signup', {
        userRole: req.user ? req.user.role : null,
        path: '/auth/signup'
    });
};

exports.loginForm = (req, res) => {
    res.render('auth/login', {
        userRole: req.user ? req.user.role : null,
        path: '/auth/login'
    });
};

exports.signup = async (req, res) => {
    const { username, role, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 8);

    try {
        const user = await User.create({ username, role, password: hashedPassword });
        res.status(201).send({ user });
    } catch (error) {
        res.status(400).send(error);
    }
};

exports.login = async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ where: { username } });
        if (!user) {
            return res.render('auth/login', { 
                error: 'User not found',
                userRole: null,
                path: '/auth/login'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('auth/login', { 
                error: 'Invalid credentials',
                userRole: null,
                path: '/auth/login'
            });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
        res.cookie('token', token, { httpOnly: true });

        // Redirect based on user role
        switch (user.role) {
            case 'Marketing':
                return res.redirect('/dashboard/marketing');
            case 'PPIC':
                return res.redirect('/dashboard/ppic');
            case 'Finance':
                return res.redirect('/dashboard/finance');
            case 'Production':
                return res.redirect('/dashboard/production');
            case 'R&D':
                return res.redirect('/dashboard/rd');
            case 'Raw Material Warehouse':
                return res.redirect('/dashboard/raw-material-warehouse');
            case 'QC':
                return res.redirect('/dashboard/qc');
            case 'Product Warehouse':
                return res.redirect('/dashboard/productWarehouse');
            case 'Purchase':
                return res.redirect('/dashboard/purchase');
            default:
                return res.redirect('/');
        }
    } catch (error) {
        return res.render('auth/login', { 
            error: 'An error occurred',
            userRole: null,
            path: '/auth/login'
        });
    }
};



// Add the logout function
exports.logout = (req, res) => {
    res.clearCookie('token');
    res.redirect('/auth/login');
};
