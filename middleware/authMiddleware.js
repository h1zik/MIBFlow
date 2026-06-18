const jwt = require('jsonwebtoken');

const isApiRequest = (req) =>
    req.originalUrl.startsWith('/api/') ||
    req.xhr ||
    (req.headers.accept && req.headers.accept.includes('application/json'));

const authenticate = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        if (isApiRequest(req)) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/auth/login');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        res.clearCookie('token');
        if (isApiRequest(req)) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        return res.redirect('/auth/login?error=session_expired');
    }
};

const authorize = (roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        if (isApiRequest(req)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        return res.status(403).render('errors/403', {
            userRole: req.user.role,
            path: req.path
        });
    }
    next();
};

module.exports = { authenticate, authorize };
