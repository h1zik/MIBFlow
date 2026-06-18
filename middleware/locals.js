module.exports = (req, res, next) => {
    res.locals.path = req.path;
    res.locals.userRole = req.user?.role || null;
    res.locals.userId = req.user?.id || null;
    next();
};
