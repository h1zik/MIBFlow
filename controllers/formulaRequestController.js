const FormulaRequest = require('../models/formulaRequest');
const Product = require('../models/product');
exports.getFormulaRequestList = async (req, res) => {
    try {
        const formulaRequests = await FormulaRequest.findAll({
            include: [Product]
        });
        const userRole = req.user.role;
        res.render('formulaRequests/list', { 
            formulaRequests,
            userRole,
            path: '/formula-requests/list'
        });
    } catch (error) {
        console.error('Error fetching formula requests:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.getFormulaRequestDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const formulaRequest = await FormulaRequest.findByPk(id, {
            include: [Product]
        });

        if (!formulaRequest) {
            return res.status(404).send('Formula request not found');
        }

        const userRole = req.user.role;
        res.render('formulaRequests/details', {
            formulaRequest,
            userRole,
            path: '/formula-requests/details'
        });
    } catch (error) {
        console.error('Error fetching formula request details:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.createFormulaRequest = async (req, res) => {
    try {
        const { productId, notes } = req.body;

        const formulaRequest = await FormulaRequest.create({
            productId,
            notes,
            status: 'Pending'
        });

        res.redirect('/formulaRequests');
    } catch (error) {
        console.error('Error creating formula request:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.approveFormulaRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const formulaRequest = await FormulaRequest.findByPk(id);

        if (!formulaRequest) {
            return res.status(404).send('Formula request not found');
        }

        if (req.file) {
            await formulaRequest.update({
                status: 'Approved',
                formula: req.file.filename
            });
        } else {
            await formulaRequest.update({
                status: 'Approved'
            });
        }

        res.redirect('/formulaRequests');
    } catch (error) {
        console.error('Error approving formula request:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.rejectFormulaRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const formulaRequest = await FormulaRequest.findByPk(id);

        if (!formulaRequest) {
            return res.status(404).send('Formula request not found');
        }

        await formulaRequest.update({
            status: 'Rejected'
        });

        res.redirect('/formulaRequests');
    } catch (error) {
        console.error('Error rejecting formula request:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.getCreateFormulaRequest = async (req, res) => {
    try {
        const products = await Product.findAll();
        const userRole = req.user.role;
        
        res.render('formulaRequests/create', {
            products,
            userRole,
            path: '/formula-requests/create'
        });
    } catch (error) {
        console.error('Error loading create formula request form:', error);
        res.status(500).send('Internal Server Error');
    }
};
