const Product = require('../models/product');
const RawMaterial = require('../models/rawMaterial');
const ProductFormula = require('../models/productFormula');
const ProductCheck = require('../models/productCheck');
const Outbound = require('../models/outbound');
const Customer = require('../models/customer');
const ProductCustomer = require('../models/productCustomer');
const sequelize = require('../config/database');
const { adjustStock } = require('../utils/stock');

exports.addProductForm = async (req, res) => {
    const userRole = req.user.role;
    
    try {
        // Fetch all available raw materials from the database
        const rawMaterials = await RawMaterial.findAll();

        // Render the addProduct page, passing the list of raw materials
        res.render('products/addProduct', { 
            userRole, 
            rawMaterials,
            path: '/products/add'
        });
    } catch (error) {
        console.error('Error fetching raw materials:', error);
        res.status(500).send('Internal Server Error');
    }
};


exports.addRawMaterialForm = (req, res) => {
    const success = req.query.success || false;
    const error = req.query.error || null;
    const userRole = req.user.role;
    res.render('products/addRawMaterial', {
        userRole,
        success,
        error,
        path: '/products/addRawMaterial'
    });
};

exports.addProduct = async (req, res) => {
    const { name, density, rawMaterials } = req.body;

    try {
        // Debug: Log uploaded files
        console.log('Uploaded Files:', req.files);

        // Create the product and save file paths if available
        const newProduct = await Product.create({
            name,
            density,
            tds: req.files?.tds?.[0]?.path || null,
            msds: req.files?.msds?.[0]?.path || null
        });

        // Validate and save the formula for the product
        let totalPercentage = 0;
        for (const materialData of rawMaterials) {
            const { id, percentage } = materialData;
            totalPercentage += parseFloat(percentage);
            await ProductFormula.create({
                productId: newProduct.id,
                rawMaterialId: id,
                percentage: parseFloat(percentage)
            });
        }

        totalPercentage = Math.round(totalPercentage * 1000) / 1000;
        const tolerance = 0.001;
        if (Math.abs(totalPercentage - 100) > tolerance) {
            throw new Error(`Total percentage of raw materials must equal 100%. Currently, it is ${totalPercentage}%.`);
        }

        res.redirect('/dashboard/rd');
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(400).send(error.message);
    }
};

exports.addRawMaterial = async (req, res) => {
    const { name, stock, form, density, unit, quantity } = req.body;
    const userRole = req.user.role;

    try {
        // Check if raw material with same name already exists
        const existingMaterial = await RawMaterial.findOne({
            where: { name: name }
        });

        if (existingMaterial) {
            return res.render('products/addRawMaterial', {
                userRole,
                error: 'A raw material with this name already exists',
                path: '/products/addRawMaterial'
            });
        }

        // If the form is not "Liquid", set density to null
        const materialDensity = form === 'Liquid' ? density : null;

        // Calculate the actual stock in KG
        let actualStock = parseFloat(stock);
        if (unit === 'L' && form === 'Liquid' && density) {
            // Convert L to KG using density
            actualStock = parseFloat(stock) * parseFloat(density);
        }

        const newRawMaterial = await RawMaterial.create({
            name,
            stock: actualStock, // Use the converted value
            form,
            density: materialDensity
        });

        // Redirect back to the form with a success message
        res.redirect('/products/addRawMaterial?success=true');
    } catch (error) {
        console.error('Error adding raw material:', error);
        res.render('products/addRawMaterial', {
            userRole,
            error: 'Failed to add raw material. Please try again.',
            path: '/products/addRawMaterial'
        });
    }
};




exports.listStock = async (req, res) => {
    try {
        // Include Customer and ProductCustomer associations if user is Marketing
        let queryOptions = {};
        if (req.user.role === 'Marketing') {
            queryOptions = {
                include: [{
                    model: Customer,
                    through: {
                        model: ProductCustomer,
                        attributes: ['price', 'updatedAt']
                    }
                }]
            };
        }
        
        const products = await Product.findAll(queryOptions);
        const userRole = req.user.role;
        
        // Calculate average customer prices for each product
        if (userRole === 'Marketing') {
            products.forEach(product => {
                // Calculate average price if there are assigned customers
                if (product.Customers && product.Customers.length > 0) {
                    let totalPrice = 0;
                    let customerCount = 0;
                    
                    product.Customers.forEach(customer => {
                        if (customer.ProductCustomer && customer.ProductCustomer.price) {
                            totalPrice += parseFloat(customer.ProductCustomer.price);
                            customerCount++;
                        }
                    });
                    
                    if (customerCount > 0) {
                        product.avgCustomerPrice = totalPrice / customerCount;
                    } else {
                        product.avgCustomerPrice = product.price || 0;
                    }
                } else {
                    product.avgCustomerPrice = product.price || 0;
                }
            });
        }
        
        res.status(200).render('products/listProduct', { 
            products, 
            userRole,
            path: '/products/listProduct'
        });
    } catch (error) {
        console.error('Error listing products:', error);
        res.status(400).send(error);
    }
};

// Display the edit form
exports.editProductForm = async (req, res) => {
    const { id } = req.params;

    try {
        const product = await Product.findByPk(id);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        const userRole = req.user.role;
        res.render('products/editProduct', { 
            product, 
            userRole,
            path: '/products/edit'
        });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Update the product's price
exports.updateProduct = async (req, res) => {
    const { id } = req.params;
    const { name, price, stock } = req.body;

    try {
        const product = await Product.findByPk(id);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        // Update based on role
        const userRole = req.user.role;
        if (userRole === 'Marketing') {
            product.price = parseFloat(price);
        } else if (userRole === 'Product Warehouse') {
            product.stock = parseInt(stock, 10);
        } else if (userRole === 'R&D') {
            product.name = name;
        }

        await product.save();
        if (userRole === 'Marketing') {
            res.redirect('/dashboard/marketing');
        } else if (userRole === 'Product Warehouse') {
            res.redirect('/dashboard/productWarehouse');
        } else if (userRole === 'R&D') {
            res.redirect('/dashboard/rd');
        }
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).send('Internal Server Error');
    }
};


// Delete a product
exports.deleteProduct = async (req, res) => {
    const { id } = req.params;

    try {
        const product = await Product.findByPk(id);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        await product.destroy();

        res.redirect('/dashboard/rd');
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.renderEditFormulaPage = async (req, res) => {
    try {
        const { id } = req.params;

        // Include RawMaterial along with ProductFormula
        const product = await Product.findByPk(id, {
            include: [
                {
                    model: ProductFormula,
                    include: [RawMaterial] // Ensure RawMaterial is included
                }
            ]
        });

        if (!product) {
            return res.status(404).send('Product not found');
        }

        res.render('products/editFormula', { 
            product,
            userRole: req.user.role,
            path: '/products/editFormula'
        });
    } catch (error) {
        console.error('Error rendering edit formula page:', error);
        res.status(500).send('Internal Server Error');
    }
};


exports.updateFormula = async (req, res) => {
    const { id } = req.params;
    const { formulas, density } = req.body;

    try {
        // Fetch the product and its associated formulas
        const product = await Product.findByPk(id, {
            include: [ProductFormula]
        });

        if (!product) {
            return res.status(404).send('Product not found');
        }

        // Update the product's density
        product.density = parseFloat(density);
        await product.save();

        // Calculate the total percentage of the new formula
        let totalPercentage = 0;
        for (let formula of formulas) {
            totalPercentage += parseFloat(formula.percentage);
        }

        // Ensure the total percentage is exactly 100%
        if (totalPercentage !== 100) {
            return res.status(400).send('Total percentage of raw materials must equal 100%.');
        }

        // Update each formula
        for (let formula of formulas) {
            const existingFormula = await ProductFormula.findByPk(formula.id);

            if (existingFormula) {
                existingFormula.percentage = parseFloat(formula.percentage);
                await existingFormula.save();
            } else {
                await ProductFormula.create({
                    productId: id,
                    rawMaterialId: formula.rawMaterialId,
                    percentage: parseFloat(formula.percentage)
                });
            }
        }

        res.redirect(`/products/listProduct`);
    } catch (error) {
        console.error('Error updating formula:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Save the per-product Blending Guide xlsx template (authored once by RnD).
// The narrative sections (PPE, preparation, production steps, QC spec, packaging,
// label) live in this template; production only stamps batch-dynamic fields onto it.
exports.uploadBlendingGuideTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findByPk(id);
        if (!product) {
            return res.status(404).send('Product not found');
        }
        if (!req.file) {
            return res.status(400).send('No template file uploaded');
        }
        product.blendingGuideTemplate = req.file.filename;
        await product.save();
        res.redirect(`/products/${id}/editFormula`);
    } catch (error) {
        console.error('Error uploading blending guide template:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Add a product check
// Pass QC check
exports.passQC = async (req, res) => {
    try {
        const { id } = req.params;
        
        const productCheck = await ProductCheck.findByPk(id);
        if (!productCheck) {
            req.flash('error', 'Product check not found');
            return res.redirect('/dashboard/ppic');
        }

        if (productCheck.qcStatus !== 'Pending') {
            req.flash('error', 'Can only update pending QC checks');
            return res.redirect('/dashboard/ppic');
        }

        await productCheck.update({
            qcStatus: 'Pass',
            qcComment: 'QC Passed'
        });

        req.flash('success', 'Product check passed successfully');
        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error passing QC:', error);
        req.flash('error', 'Failed to pass QC check');
        res.redirect('/dashboard/ppic');
    }
};

// Fail QC check
exports.failQC = async (req, res) => {
    try {
        const { id } = req.params;
        const { qcComment } = req.body;

        if (!qcComment) {
            req.flash('error', 'QC comment is required when failing a check');
            return res.redirect('/dashboard/ppic');
        }

        const productCheck = await ProductCheck.findByPk(id);
        if (!productCheck) {
            req.flash('error', 'Product check not found');
            return res.redirect('/dashboard/ppic');
        }

        if (productCheck.qcStatus !== 'Pending') {
            req.flash('error', 'Can only update pending QC checks');
            return res.redirect('/dashboard/ppic');
        }

        await productCheck.update({
            qcStatus: 'Fail',
            qcComment: qcComment
        });

        req.flash('success', 'Product check marked as failed');
        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error failing QC:', error);
        req.flash('error', 'Failed to update QC check');
        res.redirect('/dashboard/ppic');
    }
};

exports.completeProductCheck = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const transaction = await sequelize.transaction();

    try {
        const { id } = req.params;
        const { qcStatus, quantity, productId } = req.body;

        const productCheck = await ProductCheck.findByPk(id, { transaction });
        if (!productCheck) {
            await transaction.rollback();
            if (wantsJson) return res.status(404).json({ success: false, message: 'Product check not found' });
            req.flash('error', 'Product check not found');
            return res.redirect('/dashboard/ppic');
        }

        // If QC status is Fail, subtract the quantity from product stock
        if (qcStatus === 'Fail') {
            const product = await Product.findByPk(productId, { transaction });
            if (!product) {
                await transaction.rollback();
                if (wantsJson) return res.status(404).json({ success: false, message: 'Product not found' });
                req.flash('error', 'Product not found');
                return res.redirect('/dashboard/ppic');
            }

            // Subtract failed quantity from product stock (atomic, locked, never negative)
            await adjustStock(Product, productId, -parseFloat(quantity), { transaction });

            // Create outbound record for failed QC product
            await Outbound.create({
                date: new Date(),
                soPrn: 'N/A',
                batchNumber: 'N/A',
                customer: 'Internal QC',
                product: product.name,
                item: product.name,
                quantity: parseFloat(quantity),
                type: 'Product',
                reason: 'Failed QC',
                notes: `Product failed QC check and removed from stock`
            }, { transaction });
        }

        // Update product check status to Completed
        await productCheck.update({ qcStatus: 'Completed' }, { transaction });

        await transaction.commit();
        if (wantsJson) return res.json({ success: true });
        req.flash('success', 'Product check completed successfully');
        res.redirect('/dashboard/ppic');
    } catch (error) {
        await transaction.rollback();
        console.error('Error completing product check:', error);
        if (wantsJson) return res.status(500).json({ success: false, message: 'Failed to complete product check' });
        req.flash('error', 'Failed to complete product check');
        res.redirect('/dashboard/ppic');
    }
};

exports.updateProductCheckStock = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { id } = req.params;
        const { productId, rejectQuantity } = req.body;

        // Validate input
        if (!productId || !rejectQuantity || parseFloat(rejectQuantity) <= 0) {
            await transaction.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid input. Please provide a valid reject quantity.' 
            });
        }

        // Find the product check
        const productCheck = await ProductCheck.findByPk(id, { transaction });
        if (!productCheck) {
            await transaction.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'Product check not found' 
            });
        }

        // Verify the product check has Reject Sebagian status
        if (productCheck.qcStatus !== 'Reject Sebagian') {
            await transaction.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'This product check is not marked for partial rejection' 
            });
        }

        // Find the product
        const product = await Product.findByPk(productId, { transaction });
        if (!product) {
            await transaction.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found' 
            });
        }

        // Ensure reject quantity doesn't exceed the product check quantity
        if (parseFloat(rejectQuantity) > parseFloat(productCheck.quantity)) {
            await transaction.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'Reject quantity cannot exceed the total product check quantity' 
            });
        }

        // Subtract rejected quantity from product stock (atomic, locked, never negative)
        await adjustStock(Product, productId, -parseFloat(rejectQuantity), { transaction });

        // Create outbound record for partially rejected product
        await Outbound.create({
            date: new Date(),
            soPrn: 'N/A',
            batchNumber: 'N/A',
            customer: 'Internal QC',
            product: product.name,
            item: product.name,
            quantity: parseFloat(rejectQuantity),
            type: 'Product',
            reason: 'Partial Rejection',
            notes: `Product partially rejected in QC check and ${rejectQuantity} KG removed from stock`
        }, { transaction });

        // Update product check status to Completed
        await productCheck.update({ qcStatus: 'Completed' }, { transaction });

        await transaction.commit();
        
        // Send notification
        req.app.locals.sendNotification({
            type: 'productCheckCompleted',
            productName: productCheck.productName,
            status: 'Reject Sebagian',
            quantity: rejectQuantity,
            audio: 'production.mp3'
        });

        return res.json({ 
            success: true, 
            message: 'Stock updated successfully for partially rejected product' 
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error updating stock for partially rejected product:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while updating stock' 
        });
    }
};

exports.addProductCheck = async (req, res) => {
    try {
        const { productId, productName, quantity, qcStatus, qcComment } = req.body;
        
        console.log('Received product check request:', {
            productId,
            productName,
            quantity,
            qcStatus,
            qcComment
        });
        
        // Validate productId
        if (!productId || isNaN(productId)) {
            console.log('Invalid product ID:', productId);
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid product ID' 
            });
        }

        // Validate quantity
        if (!quantity || isNaN(quantity) || quantity <= 0) {
            console.log('Invalid quantity:', quantity);
            return res.status(400).json({
                success: false,
                error: 'Invalid quantity. Must be a positive number.'
            });
        }

        // First verify that the product exists
        const product = await Product.findByPk(productId);
        if (!product) {
            console.log('Product not found with ID:', productId);
            return res.status(404).json({ 
                success: false, 
                error: `Product with ID ${productId} not found` 
            });
        }

        console.log('Found product:', product.toJSON());

        // Validate product name matches
        if (product.name !== productName) {
            console.log('Product name mismatch:', { expected: product.name, received: productName });
            return res.status(400).json({
                success: false,
                error: 'Product name does not match the ID'
            });
        }

        const productCheck = await ProductCheck.create({
            productId: product.id,
            productName: product.name, // Use the name from the database to ensure consistency
            quantity: parseFloat(quantity),
            qcStatus: qcStatus || 'Pending',
            qcComment: qcComment || ''
        });

        console.log('Created product check:', productCheck.toJSON());

        // Send notification to QC
        req.app.locals.sendNotification({
            type: 'newProductCheck',
            productName: product.name,
            quantity: quantity,
            audio: 'production.mp3'
        });

        res.status(201).json({ success: true, productCheck });
    } catch (error) {
        console.error('Error adding product check:', error);
        res.json({ success: false, error: error.message });
    }
};
