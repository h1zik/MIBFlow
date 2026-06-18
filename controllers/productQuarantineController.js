const Production = require('../models/production').Production;
const Product = require('../models/product');
const ComplainItem = require('../models/complainItem');
const Complain = require('../models/complain');
const Order = require('../models/order');
const OrderItem = require('../models/orderItem');
const ProductionRequest = require('../models/productionRequest');

exports.listQuarantinedProducts = async (req, res) => {
    try {
        // Fetch productions that are in quarantine
        const quarantinedProductions = await Production.findAll({
            where: { status: 'Quarantined' },
            include: [
                { model: Product },
                { model: ProductionRequest }
            ],
            order: [['createdAt', 'DESC']]
        });

        // Fetch complain items that are in quarantine
        const quarantinedComplainItems = await ComplainItem.findAll({
            where: { status: 'Quarantined' },
            include: [
                { 
                    model: Complain,
                    include: [
                        { model: Order }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.render('productQuarantine/list', {
            quarantinedProductions,
            quarantinedComplainItems,
            userRole: req.user.role,
            path: '/product-quarantine/list'
        });
    } catch (error) {
        console.error('Error fetching quarantined products:', error);
        res.status(500).send('Internal Server Error');
    }
};
