// routes/productCustomerRoutes.js
const express = require('express');
const router = express.Router();
const { Product, Customer, ProductCustomer } = require('../models/associations');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// GET - Show assign customer page for a specific product
router.get('/assignCustomer/:id', authenticate, authorize(['Marketing']), async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findByPk(productId, {
            include: [{
                model: Customer,
                through: {
                    model: ProductCustomer,
                    attributes: ['price', 'updatedAt', 'createdAt']
                }
            }]
        });

        if (!product) {
            return res.status(404).send('Product not found');
        }

        const customers = await Customer.findAll({
            order: [['name', 'ASC']]
        });

        res.render('products/assignCustomer', {
            product,
            customers,
            userRole: req.user.role,
            path: '/products/listProduct'
        });
    } catch (error) {
        console.error('Error loading assign customer page:', error);
        res.status(500).send('Server error');
    }
});

// POST - Assign a customer to a product with price
router.post('/assignCustomer/:id', authenticate, authorize(['Marketing']), async (req, res) => {
    try {
        const productId = req.params.id;
        const { customerId, price } = req.body;

        // Check if product exists
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        // Check if customer exists
        const customer = await Customer.findByPk(customerId);
        if (!customer) {
            return res.status(404).send('Customer not found');
        }

        // Check if association already exists
        const existingAssociation = await ProductCustomer.findOne({
            where: {
                ProductId: productId,
                CustomerId: customerId
            }
        });

        if (existingAssociation) {
            return res.redirect(`/productCustomer/assignCustomer/${productId}?error=Customer already assigned to this product`);
        }

        // Create new association
        await ProductCustomer.create({
            ProductId: productId,
            CustomerId: customerId,
            price: price
        });

        res.redirect(`/productCustomer/assignCustomer/${productId}`);
    } catch (error) {
        console.error('Error assigning customer to product:', error);
        res.status(500).send('Server error');
    }
});

// POST - Update customer price for a product
router.post('/updateCustomerPrice/:productId/:customerId', authenticate, authorize(['Marketing']), async (req, res) => {
    try {
        const { productId, customerId } = req.params;
        const { price } = req.body;

        // Find the association
        const association = await ProductCustomer.findOne({
            where: {
                ProductId: productId,
                CustomerId: customerId
            }
        });

        if (!association) {
            return res.status(404).send('Association not found');
        }

        // Update price
        association.price = price;
        await association.save();

        res.redirect(`/productCustomer/assignCustomer/${productId}`);
    } catch (error) {
        console.error('Error updating customer price:', error);
        res.status(500).send('Server error');
    }
});

// POST - Remove customer from product
router.post('/removeCustomer/:productId/:customerId', authenticate, authorize(['Marketing']), async (req, res) => {
    try {
        const { productId, customerId } = req.params;

        // Delete the association
        await ProductCustomer.destroy({
            where: {
                ProductId: productId,
                CustomerId: customerId
            }
        });

        res.redirect(`/productCustomer/assignCustomer/${productId}`);
    } catch (error) {
        console.error('Error removing customer from product:', error);
        res.status(500).send('Server error');
    }
});

module.exports = router;
