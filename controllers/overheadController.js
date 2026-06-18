const OverheadCost = require('../models/overheadCost');
const ProductionBatch = require('../models/productionBatch');
const OverheadCalculation = require('../models/overHeadCalculation');
const Equipment = require('../models/equipment');
const Labor = require('../models/labor');
const Utilities = require('../models/utilities');
const Tank = require('../models/tank');
const Balance = require('../models/balance');
const Forklift = require('../models/forklift');
const Product = require('../models/product'); // Assuming you have a Product model
const Packaging = require('../models/packaging'); // Assuming you have a Packaging model
const RawMaterial = require('../models/rawMaterial'); // Assuming you have a RawMaterial model
const ProductFormula = require('../models/productFormula'); // Assuming you have a Product model



exports.renderOverheadCalculationPage = async (req, res) => {
    try {
        // Fetch total salaries for indirect and direct labor
        const totalIndirectLabor = await Labor.sum('salary', { where: { status: 'indirect' } });
        const totalDirectLabor = await Labor.sum('salary', { where: { status: 'direct' } });

        // Divide by 160 to get the hourly rate
        const indirectLaborPerHour = totalIndirectLabor / 160 || 0;
        const directLaborPerHour = totalDirectLabor / 160 || 0;

        // Fetch total price of all tanks, balances, forklifts, and utilities from the database
        const totalTankPrice = await Tank.sum('price');
        const totalBalancePrice = await Balance.sum('price');
        const totalForkliftPrice = await Forklift.sum('price');
        const totalUtilitiesPrice = await Utilities.sum('price');

        // Calculate equipment depreciation per hour
        const totalEquipmentPrice = totalTankPrice + totalBalancePrice + totalForkliftPrice;
        const equipmentDepreciationPerHour = totalEquipmentPrice / 120 / 160;

        // Pass values to the EJS template
        res.render('production/overheadCalculation', { 
            userRole: req.user.role,
            calculationResult: null, // Pass null initially to avoid undefined error
            totalIndirectLabor: indirectLaborPerHour, // Pass the hourly rate for indirect labor
            totalDirectLabor: directLaborPerHour, // Pass the hourly rate for direct labor
            equipmentDepreciationPerHour: equipmentDepreciationPerHour || 0, // Pass the equipment depreciation per hour
            totalUtilitiesPrice: totalUtilitiesPrice || 0, // Pass the total utilities price
            path: '/overhead/calculate-overhead'
        });
    } catch (error) {
        console.error('Error rendering overhead calculation page:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.calculateOverhead = async (req, res) => {
    try {
        const {
            rent,
            insurance,
            handling,
            transport,
            directLabor,
            indirectLabor,
            blendingTankHours,
            balanceHours,
            forkliftHours,
        } = req.body;

        // Ensure all inputs are parsed as numbers
        const parsedRent = parseFloat(rent);
        const parsedInsurance = parseFloat(insurance);
        const parsedHandling = parseFloat(handling);
        const parsedTransport = parseFloat(transport);
        const parsedBlendingTankHours = parseFloat(blendingTankHours);
        const parsedBalanceHours = parseFloat(balanceHours);
        const parsedForkliftHours = parseFloat(forkliftHours);
        const parsedDirectLabor = parseFloat(directLabor);
        const parsedIndirectLabor = parseFloat(indirectLabor);

        // Fetch total price of all tanks, balances, forklifts, and utilities from the database
        const totalTankPrice = await Tank.sum('price');
        const totalBalancePrice = await Balance.sum('price');
        const totalForkliftPrice = await Forklift.sum('price');
        const totalUtilitiesPrice = await Utilities.sum('price');

        // Calculate total overhead cost components for one batch
        const totalEquipmentPrice = totalTankPrice + totalBalancePrice + totalForkliftPrice;
        const equipmentDepreciationPerHour = totalEquipmentPrice / 120 / 160;

        const rentCostPerHour = parsedRent / 160; // Monthly rent divided by working hours
        const rentCostPerBatch = rentCostPerHour * parsedBlendingTankHours;
        const indirectLaborCostPerBatch = parsedIndirectLabor * parsedBlendingTankHours;
        const directLaborCostPerBatch = parsedDirectLabor * parsedBlendingTankHours;
        const insuranceCostPerBatch = parsedInsurance / 20; // Monthly insurance divided by batches per month
        const utilitiesCostPerBatch = totalUtilitiesPrice / 20; // Monthly utilities divided by batches per month

        // Calculate equipment costs for one batch
        const blendingTankCost = (totalTankPrice / 120 / 160) * parsedBlendingTankHours; // Depreciation per hour * hours
        const balanceCost = (totalBalancePrice / 120 / 160) * parsedBalanceHours;
        const forkliftCost = (totalForkliftPrice / 120 / 160) * parsedForkliftHours;
        const totalEquipmentCost = blendingTankCost + balanceCost + forkliftCost;

        // Calculate total fixed and variable overheads
        const totalFixedOverhead = rentCostPerBatch + indirectLaborCostPerBatch + insuranceCostPerBatch;
        const totalVariableOverhead = directLaborCostPerBatch + utilitiesCostPerBatch + parsedHandling + parsedTransport;

        // Calculate total overhead cost for one batch
        const totalOverheadCost = totalEquipmentCost + totalFixedOverhead + totalVariableOverhead;

        // Save overhead cost data to the database
        await OverheadCost.create({
            totalEquipmentCost,
            rentCostPerHour: rentCostPerHour,
            indirectLaborCostPerHour: parsedIndirectLabor,
            directLaborCostPerHour: parsedDirectLabor,
            insuranceCostMonthly: parsedInsurance,
            utilitiesCostMonthly: totalUtilitiesPrice,
            handlingPerBatch: parsedHandling,
            transportPerBatch: parsedTransport
        });

        // Calculate overhead cost per unit (per Kg/L) based on standard batch size of 1000 Kg/L
        const standardBatchSize = 1000; // Standard batch size in Kg/L
        const overheadCostPerUnit = totalOverheadCost / standardBatchSize;

        // Create calculation result object with all required values
        const calculationResult = {
            totalOverheadCost,
            overheadCostPerUnit
        };

        // Render the result and include all necessary data
        res.render('production/overheadCalculation', { 
            userRole: req.user.role,
            equipmentDepreciationPerHour, // Include this in the render so it can be displayed
            totalIndirectLabor: parsedIndirectLabor, // Include this if needed for further calculations
            totalDirectLabor: parsedDirectLabor, // Include this if needed for further calculations
            totalUtilitiesPrice, // Ensure this is passed to the EJS template
            path: '/overhead/calculate-overhead', // Add the path for sidebar
            calculationResult // Add the calculation result object
        });
    } catch (error) {
        console.error('Error calculating overhead:', error);
        res.status(500).send('Internal Server Error');
    }
};


exports.renderAddLaborPage = (req, res) => {
    try {
        if (req.user.role !== 'Finance') {
            return res.status(403).send('Access denied.');
        }
        const userRole = req.user.role;
        res.render('production/addLabor', {
            userRole,
            path: '/overhead/labor/add'
        });
    } catch (error) {
        console.error('Error rendering add labor page:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.addLabor = async (req, res) => {
    try {
        if (req.user.role !== 'Finance') {
            return res.status(403).send('Access denied.');
        }

        const { name, status, salary, position } = req.body;

        await Labor.create({ name, status, salary, position });

        res.redirect('/overhead/labor/add'); // Redirect to the list of labor or a success page
    } catch (error) {
        console.error('Error adding labor:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Render the page to add a new utility
exports.renderAddUtilityPage = (req, res) => {
    res.render('production/addUtility', { 
        userRole: req.user.role,
        path: '/overhead/utility/add'
    });
};

// Handle form submission to add a new utility
exports.addUtility = async (req, res) => {
    try {
        const { name, price } = req.body;

        // Ensure the price is parsed as a float
        const parsedPrice = parseFloat(price);

        // Create the new utility in the database
        await Utilities.create({
            name,
            price: parsedPrice
        });

        res.redirect('/overhead/utility/add'); // Redirect to the list page after adding
    } catch (error) {
        console.error('Error adding utility:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.renderCogsCalculatorPage = async (req, res) => {
    try {
        // Fetch all existing products
        const products = await Product.findAll();

        // Fetch all packaging options
        const packagingOptions = await Packaging.findAll();

        // Fetch all raw materials
        const rawMaterial = await RawMaterial.findAll();

        // If it's an existing product, fetch its formulas
        let productFormulas = [];
        if (req.query.productName) {
            const product = await Product.findOne({ where: { name: req.query.productName } });
            if (product) {
                productFormulas = await ProductFormula.findAll({ where: { productId: product.id }, include: [RawMaterial] });
            }
        }

        // Define default values to prevent undefined errors
        const rawMatCostPerProduct = 0;
        const packagingPricePerLiter = 0;
        const stickerPrice = 0;
        const cogsPerUnit = 0;

        // Render the page with the fetched data
        res.render('products/cogsCalculator', {
            userRole: req.user.role,
            products,
            packagingOptions,
            rawMaterial,
            productFormulas,
            calculationResult: { finalProductCost: 0 }, // Always pass an object with default values
            rawMatCostPerProduct, // Pass default value
            packagingPricePerLiter, // Pass default value
            stickerPrice, // Pass default value
            cogsPerUnit, // Pass default value
            selectedProductName: req.query.productName || '',
            selectedProductType: req.query.productType || 'existing', // Pass the selected product type
            path: '/overhead/cogs-calculator'
        });
    } catch (error) {
        console.error('Error rendering COGS calculator page:', error);
        res.status(500).send('Internal Server Error');
    }
};






exports.calculateCogs = async (req, res) => {
    try {
        const {
            productType, // new or existing
            productName,
            newProductName,
            batchMonth,
            batchSize,
            productionTime,
            rawMaterials, // Array of raw materials with percentages for new products
            packagingId,
            labelWidth,
            labelHeight,
            paperPrice
        } = req.body;

        let productId;
        let rawMatCostPerProduct = 0;

        if (productType === 'existing') {
            const product = await Product.findOne({ where: { name: productName } });
            if (!product) {
                return res.status(404).send('Product not found.');
            }
            productId = product.id;

            const productFormulas = await ProductFormula.findAll({ where: { productId: product.id } });
            for (const formula of productFormulas) {
                const rawMaterial = await RawMaterial.findByPk(formula.rawMaterialId);
                if (!rawMaterial) {
                    return res.status(404).send(`Raw material with ID ${formula.rawMaterialId} not found.`);
                }
                const cost = rawMaterial.price * (formula.percentage / 100);
                rawMatCostPerProduct += cost;
            }
        } else if (productType === 'new') {
            console.log('Raw materials:', rawMaterials); // Debugging: Log raw materials array

            // Ensure rawMaterials is an array of objects with id and percentage properties
            if (!Array.isArray(rawMaterials) || rawMaterials.some(rm => typeof rm !== 'object' || !rm.id || !rm.percentage)) {
                console.error('Invalid raw materials format:', rawMaterials); // Log the invalid format
                return res.status(400).send('Invalid raw materials format.');
            }

            // Check if the total percentage equals 100%
            const totalPercentage = rawMaterials.reduce((total, rawMaterial) => total + parseFloat(rawMaterial.percentage), 0);
            if (totalPercentage !== 100) {
                return res.status(400).send('Total percentage of raw materials must equal 100%.');
            }

            for (const rawMaterial of rawMaterials) {
                console.log('Processing raw material:', rawMaterial); // Debugging: Log each raw material
                const material = await RawMaterial.findByPk(rawMaterial.id);
                if (!material) {
                    return res.status(404).send(`Raw material with ID ${rawMaterial.id} not found.`);
                }
                const cost = material.price * (rawMaterial.percentage / 100);
                rawMatCostPerProduct += cost;
            }
        }

        // Fetch the packaging information
        const packaging = await Packaging.findByPk(packagingId);
        if (!packaging) {
            return res.status(404).send('Packaging not found.');
        }

        // Calculate packaging cost per liter
        const packagingPricePerLiter = packaging.price / packaging.volume;

        // Calculate label cost per unit
        const labelArea = labelWidth * labelHeight;
        const stickersPerPaper = 297 * 420 / labelArea; // A3 size is 297mm x 420mm
        const stickerPrice = paperPrice / stickersPerPaper;

        // Fetch the latest overhead costs from the database
        const overheadCost = await OverheadCost.findOne({
            order: [['createdAt', 'DESC']]
        });

        if (!overheadCost) {
            return res.status(404).send('No overhead cost data available.');
        }

        // Calculate total equipment cost
        const totalEquipmentCost = overheadCost.totalEquipmentCost;

        // Calculate rent cost per batch
        const rentCostPerBatch = overheadCost.rentCostPerHour * productionTime;

        // Calculate indirect labor cost per batch
        const indirectLaborCostPerBatch = overheadCost.indirectLaborCostPerHour * productionTime;

        // Calculate direct labor cost per batch
        const directLaborCostPerBatch = overheadCost.directLaborCostPerHour * productionTime;

        // Insurance cost per batch (assuming 20 batches per month)
        const insuranceCostPerBatch = overheadCost.insuranceCostMonthly / batchMonth;

        // Utilities cost per batch (assuming 20 batches per month)
        const utilitiesCostPerBatch = overheadCost.utilitiesCostMonthly / batchMonth;

        // Calculate total fixed overheads
        const totalFixedOverhead = rentCostPerBatch + indirectLaborCostPerBatch + insuranceCostPerBatch;

        // Calculate total variable overheads
        const totalVariableOverhead = directLaborCostPerBatch + utilitiesCostPerBatch + overheadCost.handlingPerBatch + overheadCost.transportPerBatch;

        // Calculate total overhead cost
        const totalOverheadCost = totalEquipmentCost + totalFixedOverhead + totalVariableOverhead;

        // Calculate COGS per unit
        const cogsPerUnit = totalOverheadCost / batchSize;

        // Calculate final product cost
        const finalProductCost = rawMatCostPerProduct + packagingPricePerLiter + stickerPrice + cogsPerUnit;

        const products = await Product.findAll();
        const packagingOptions = await Packaging.findAll();
        const rawMaterial = await RawMaterial.findAll();
        const productFormulas = productType === 'existing' ? await ProductFormula.findAll({ where: { productId }, include: [RawMaterial] }) : [];

        // Render the result with all the necessary data
        res.render('products/cogsCalculator', {
            calculationResult: { totalCogs: totalOverheadCost, cogsPerUnit, finalProductCost },
            rawMatCostPerProduct, // Pass the raw material cost per product
            packagingPricePerLiter, // Pass the packaging price per liter
            stickerPrice, // Pass the sticker price
            cogsPerUnit, // Pass the COGS per unit
            userRole: req.user.role,
            products,          // Pass products to the template
            packagingOptions,  // Pass packaging options to the template
            rawMaterial,
            productFormulas,       // Pass raw materials to the template
            selectedProductName: productName || newProductName,
            selectedProductType: productType, // Pass the selected product type
            path: '/overhead/cogs-calculator'
        });
    } catch (error) {
        console.error('Error calculating COGS:', error);
        res.status(500).send('Internal Server Error');
    }
};



exports.getProductFormulas = async (req, res) => {
    try {
        const { productName } = req.query;  // Use req.query instead of req.params
        const product = await Product.findOne({ where: { name: productName } });

        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const productFormulas = await ProductFormula.findAll({
            where: { productId: product.id },
            include: [{ model: RawMaterial }]
        });

        // Map the formulas to a format that includes raw material names and percentages
        const rawMaterials = productFormulas.map(formula => ({
            name: formula.RawMaterial.name,
            percentage: formula.percentage
        }));

        res.json(rawMaterials);
    } catch (error) {
        console.error('Error fetching product formulas:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
