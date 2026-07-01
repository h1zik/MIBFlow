const { Production, ProductionRawMaterial } = require('../models/production');
const Product = require('../models/product');
const ProductFormula = require('../models/productFormula');
const RawMaterial = require('../models/rawMaterial');
const Outbound = require('../models/outbound');
const Tank = require('../models/tank');
const ProductionTank = require('../models/productionTank');
const ProductionRequest = require('../models/productionRequest');
const sequelize = require('../config/database');
const ProductionRequestRawMaterial = require('../models/productionRequestRawMaterial');
const Order = require('../models/order');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const Balance = require('../models/balance');
const Forklift = require('../models/forklift');
const { adjustStock } = require('../utils/stock');


exports.getScheduleProductionForm = async (req, res) => {
    try {
        const productionRequest = await ProductionRequest.findByPk(req.params.id, {
            include: [
                {
                    model: ProductionRequestRawMaterial,
                    include: [RawMaterial]
                },
                {
                    model: Order, // Include the associated Order model
                }
            ]
        });

        if (!productionRequest) {
            return res.status(404).send('Production Request not found');
        }

        // Manually fetch the product details based on the product name
        const product = await Product.findOne({ where: { name: productionRequest.product } });

        // Log product information for debugging
        console.log('Product Request:', productionRequest.product);
        console.log('Product Found:', product);

        // Fetch the deadline from the associated Order
        const deadlineDate = productionRequest.Order ? productionRequest.Order.deadline : null;
        const userRole = req.user.role;

        res.render('production/schedule', {
            productionRequest,
            product,
            userRole,
            deadlineDate, // Pass the deadlineDate from Order
            rawMaterials: productionRequest.ProductionRequestRawMaterials.map(prrm => ({
                id: prrm.RawMaterial.id,
                name: prrm.RawMaterial.name,
                stock: prrm.RawMaterial.stock,
                requestedQuantity: prrm.quantity
            })),
            tanks: await Tank.findAll(),
            error: null,
            path: '/production/schedule'
        });
    } catch (error) {
        console.error('Error fetching production request:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.scheduleProduction = async (req, res) => {
    // Start a transaction to ensure data consistency
    const transaction = await sequelize.transaction();
    
    try {
        const productionRequest = await ProductionRequest.findByPk(req.params.id, {
            include: [{
                model: ProductionRequestRawMaterial,
                include: [RawMaterial]
            }],
            transaction
        });

        if (!productionRequest) {
            await transaction.rollback();
            return res.status(404).send('Production request not found');
        }

        // Debug raw materials structure
        console.log('Raw Materials Structure:', JSON.stringify(productionRequest.ProductionRequestRawMaterials[0], null, 2));
        
        // Extract form data
        const { startDate, deadlineDate, quantity, selectedTanks, stirSequences } = req.body;
        
        // Debug information
        console.log('Form Data:', req.body);
        console.log('Selected Tanks:', selectedTanks);
        console.log('Selected Tanks Type:', typeof selectedTanks);
        console.log('Is Array:', Array.isArray(selectedTanks));
        
        // Fetch product details
        const product = await Product.findOne({ 
            where: { name: productionRequest.product },
            transaction 
        });
        
        if (!product) {
            await transaction.rollback();
            return res.status(400).render('production/schedule', {
                error: `Product not found: ${productionRequest.product}`,
                productionRequest,
                rawMaterials: productionRequest.ProductionRequestRawMaterials,
                tanks: await Tank.findAll(),
                userRole: req.user.role,
                deadlineDate: null,
                product: null,
                path: '/production/schedule'
            });
        }

        // Validate selected tanks
        if (!selectedTanks || !Array.isArray(selectedTanks) || selectedTanks.length === 0) {
            await transaction.rollback();
            return res.status(400).render('production/schedule', {
                error: 'Please select at least one tank for production',
                productionRequest,
                rawMaterials: productionRequest.ProductionRequestRawMaterials,
                tanks: await Tank.findAll(),
                userRole: req.user.role,
                deadlineDate: productionRequest.Order ? productionRequest.Order.deadline : null,
                product,
                path: '/production/schedule'
            });
        }

        // Prepare tank data
        const tanks = await Tank.findAll({
            where: {
                id: selectedTanks
            },
            transaction
        });

        // Calculate total production capacity
        let totalProductionCapacity = 0;
        const productionSplits = [];

        tanks.forEach((tank, index) => {
            const stirCount = parseInt(stirSequences[index]) || 1;
            const tankCapacity = tank.volume * stirCount;
            totalProductionCapacity += tankCapacity;
            
            for (let i = 0; i < stirCount; i++) {
                productionSplits.push({
                    tankId: tank.id,
                    quantity: tank.volume
                });
            }
        });

        // Convert product quantity from kg to liters based on density
        // Density is in g/ml, so we convert to kg/L (1 g/ml = 1 kg/L)
        const volumeInLiters = quantity / product.density;
        
        console.log('Stir Sequences:', stirSequences);
        console.log('Total Production Capacity:', totalProductionCapacity);
        console.log('Required Quantity (kg):', quantity);
        console.log('Product Density (kg/L):', product.density);
        console.log('Required Volume (L):', volumeInLiters);

        // Store validation result to avoid multiple rollbacks
        let validationError = null;

        // Validate that each tank or tank sequence has enough capacity
        // For the specific case where a single tank is selected
        if (selectedTanks.length === 1) {
            const tank = tanks[0];
            const stirCount = parseInt(stirSequences[0]) || 1;
            const tankCapacity = tank.volume * stirCount;
            
            // If a single tank is selected, it must have at least 90% of the required volume
            if (tankCapacity < volumeInLiters * 0.9) {
                validationError = `The selected tank (${tank.name}) with ${stirCount} stir sequence(s) has a capacity of ${tankCapacity}L, which is insufficient for the required volume of ${volumeInLiters.toFixed(2)}L. Please select a larger tank or add more tanks.`;
            }
        } else if (selectedTanks.length > 1) {
            // For multiple tanks, ensure the total capacity is sufficient
            // This is a more strict check than the general totalProductionCapacity check below
            if (totalProductionCapacity < volumeInLiters) {
                validationError = `The selected tanks have a total capacity of ${totalProductionCapacity}L, which is insufficient for the required volume of ${volumeInLiters.toFixed(2)}L. Please select larger tanks or add more tanks.`;
            }
        }

        // Sort tanks by volume to simulate filling from smallest to largest
        productionSplits.sort((a, b) => a.quantity - b.quantity);
        
        // Calculate minimum required tanks
        let remainingQty = volumeInLiters; // Use volume in liters instead of weight
        let minimumTanks = 0;
        let usedCapacity = 0;
        
        for (const split of productionSplits) {
            if (remainingQty > 0) {
                minimumTanks++;
                usedCapacity += split.quantity;
                remainingQty -= split.quantity;
            }
        }

        // Strict validation: Total tank capacity must be at least the required volume
        // We're comparing volume to volume here, not weight to volume
        if (totalProductionCapacity < volumeInLiters && !validationError) {
            validationError = `Selected tanks do not have enough capacity for the production volume. Required: ${volumeInLiters.toFixed(2)}L, Available: ${totalProductionCapacity.toFixed(2)}L`;
        }

        // Check if we have more tanks than needed
        if (productionSplits.length > minimumTanks + 1 && !validationError) {
            validationError = `Too many tanks selected. The production requires ${minimumTanks} tank(s) with some overflow. Additional tanks would be unused.`;
        }

        // If there's a validation error, roll back and render the error
        if (validationError) {
            await transaction.rollback();
            return res.status(400).render('production/schedule', {
                error: validationError,
                productionRequest,
                rawMaterials: productionRequest.ProductionRequestRawMaterials,
                tanks: await Tank.findAll(),
                userRole: req.user.role,
                deadlineDate: productionRequest.Order ? productionRequest.Order.deadline : null,
                product: await Product.findOne({ where: { name: productionRequest.product } }),
                path: '/production/schedule'
            });
        }

        let remainingQuantity = quantity;
        let remainingVolume = volumeInLiters;
        
        // Create a map to track sequence numbers for each tank
        const tankSequenceMap = new Map();
        
        // Group splits by tankId to track sequences properly
        const tankGroups = {};
        productionSplits.forEach(split => {
            if (!tankGroups[split.tankId]) {
                tankGroups[split.tankId] = [];
            }
            tankGroups[split.tankId].push(split);
        });
        
        // Process each tank's splits
        for (const tankId in tankGroups) {
            // Initialize sequence counter for this tank
            let sequenceNumber = 1;
            
            for (const split of tankGroups[tankId]) {
                if (remainingVolume <= 0) break;
                
                // Calculate how much volume can fit in this tank
                const tankVolumeUsed = Math.min(split.quantity, remainingVolume);
                // Convert back to weight for storage in the database
                const actualQuantity = tankVolumeUsed * product.density;
                
                remainingVolume -= tankVolumeUsed;
                remainingQuantity -= actualQuantity;
                
                const production = await Production.create({
                    startDate,
                    deadlineDate,
                    status: 'Pending',
                    quantity: actualQuantity,
                    productId: product.id,
                    productionRequestId: productionRequest.id,  
                    stirSequence: sequenceNumber, // Use the sequence number for this tank
                    formula: productionRequest.formula // Forward the formula from ProductionRequest
                }, { transaction });
                
                await ProductionTank.create({
                    ProductionId: production.id,
                    TankId: split.tankId
                }, { transaction });
                
                // Increment sequence number for this tank
                sequenceNumber++;
            }
        }

        // Update the status of the production request
        productionRequest.status = 'Scheduled';
        await productionRequest.save({ transaction });

        await transaction.commit();

        res.redirect('/production/production');
    } catch (error) {
        console.error('Error scheduling production:', error);
        
        // Only roll back if transaction exists and is active
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        
        // Fetch the production request again since we're in a new context
        const productionRequest = await ProductionRequest.findByPk(req.params.id, {
            include: [{
                model: ProductionRequestRawMaterial,
                include: [RawMaterial]
            }]
        });
        
        res.status(400).render('production/schedule', {
            error: 'Error scheduling production: ' + error.message,
            productionRequest,
            rawMaterials: await RawMaterial.findAll(),
            tanks: await Tank.findAll(),
            userRole: req.user.role,
            deadlineDate: productionRequest.Order ? productionRequest.Order.deadline : null,
            product: await Product.findOne({ where: { name: productionRequest.product } }),
            path: '/production/schedule'
        });
    }
};


// NOTE: production stock completion now lives solely in productionRequestController.updateStock
// (POST /production/updateStock/:id), which is idempotent and writes an Inbound record. The old
// divergent updateStock here was removed to avoid two conflicting stock-mutation paths.

exports.produceBatch = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const { id } = req.params;

    try {
        const production = await Production.findByPk(id, {
            include: [
                {
                    model: Tank,
                    attributes: ['name']
                }
            ]
        });

        if (!production) {
            if (wantsJson) return res.status(404).json({ success: false, message: 'Production not found' });
            return res.status(404).send('Production not found');
        }

        // Idempotency: once a batch number exists, don't regenerate/overwrite it.
        if (production.batchNumber) {
            if (wantsJson) return res.json({ success: true });
            return res.redirect('/production/production');
        }

        if (!production.Tanks || production.Tanks.length === 0) {
            if (wantsJson) return res.status(400).json({ success: false, message: 'No tank assigned to this production.' });
            return res.status(400).send('No tank assigned to this production.');
        }

        // Generate the batch number
        const currentDate = new Date();
        const day = String(currentDate.getDate()).padStart(2, '0');
        const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Months are 0-based in JS
        const year = String(currentDate.getFullYear()).slice(-2);
        const tankName = production.Tanks[0].name; // Assuming only one tank is used per production split
        const stirSequence = String(production.stirSequence).padStart(2, '0');

        const batchNumber = `${day}.${month}.${year}.${tankName}-${stirSequence}`;

        // Update the production with the generated batch number
        production.batchNumber = batchNumber;
        await production.save();

        if (wantsJson) return res.json({ success: true });
        res.redirect('/production/production');
    } catch (error) {
        console.error('Error producing batch:', error);
        if (wantsJson) return res.status(500).json({ success: false, message: 'Internal Server Error' });
        res.status(500).send('Internal Server Error');
    }
};

exports.getStockUpdatedProductions = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Build the where clause for date filtering
        const whereClause = { stockUpdated: true };
        if (startDate) whereClause.startDate = { [Op.gte]: new Date(startDate) };
        if (endDate) whereClause.deadlineDate = { [Op.lte]: new Date(endDate) };

        const productions = await Production.findAll({
            where: whereClause,
            include: [
                {
                    model: Product,
                    attributes: ['name']
                }
            ]
        });

        // Calculate the time interval and sort the productions
        productions.forEach(production => {
            production.timeInterval = new Date(production.deadlineDate) - new Date(production.startDate);
        });

        productions.sort((a, b) => a.timeInterval - b.timeInterval);

        const userRole = req.user.role;

        res.status(200).render('production/stockUpdatedProductions', { 
            productions, 
            userRole, 
            startDate, 
            endDate,
            path: '/productions/stock-updated'
        });
    } catch (error) {
        console.error('Error fetching stock-updated productions:', error);
        res.status(400).send(error);
    }
};

exports.printProduction = async (req, res) => {
    try {
        const { id } = req.params;
        const production = await Production.findByPk(id, {
            include: [
                { model: Product },
                { model: Tank, through: { attributes: [] } }
            ]
        });

        if (!production) {
            return res.status(404).send('Production not found');
        }

        // Prefer the product-level Blending Guide template (authored once by RnD);
        // fall back to a legacy per-request formula file if present.
        let filePath = null;
        if (production.Product && production.Product.blendingGuideTemplate) {
            filePath = path.join(__dirname, '../uploads/BGTemplates', production.Product.blendingGuideTemplate);
        } else if (production.formula) {
            filePath = path.join(__dirname, '../uploads', production.formula);
        }

        // No template available → mark issued and use the generated HTML Blending Guide.
        if (!filePath || !fs.existsSync(filePath)) {
            await production.update({ isPrinted: true });
            req.app.locals.sendNotification({
                type: 'productionPrinted',
                batchNumber: production.batchNumber,
                status: 'Printed',
                audio: 'production.mp3'
            });
            return res.redirect(`/production/blending-guide/${production.id}`);
        }

        // Template available (product template or legacy file) → clone it and stamp the
        // batch-dynamic fields (quantity, batch number, tank) onto the worksheet.
        const workbook = new ExcelJS.Workbook();

        console.log('Attempting to read Excel file:', filePath);
        try {
            await workbook.xlsx.readFile(filePath);
        } catch (error) {
            console.error('Error reading Excel file:', error);
            return res.status(400).send('Error reading Excel file: ' + error.message);
        }

        // Log workbook details
        console.log('Workbook loaded successfully');
        console.log('Workbook properties:', {
            creator: workbook.creator,
            lastModifiedBy: workbook.lastModifiedBy,
            created: workbook.created,
            modified: workbook.modified
        });

        // Get all worksheets and log them
        if (!workbook.worksheets || workbook.worksheets.length === 0) {
            console.error('No worksheets found in workbook');
            return res.status(400).send('Excel file contains no worksheets');
        }

        console.log('Number of worksheets:', workbook.worksheets.length);
        console.log('Available worksheets:', workbook.worksheets.map(ws => ({
            name: ws.name,
            state: ws.state,
            rowCount: ws.rowCount,
            columnCount: ws.columnCount
        })));

        // Try to get the first worksheet
        const worksheet = workbook.worksheets[0]; // Try using array access instead of getWorksheet(1)
        if (!worksheet) {
            console.error('No worksheet found in the workbook');
            return res.status(400).send('Excel file is empty or corrupted');
        }

        console.log('Found worksheet:', worksheet.name);

        // Find the cell containing "Jumlah Produksi" or similar text
        let quantityCell, batchCell, tankCell;
        
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell, colNumber) => {
                if (cell.value && typeof cell.value === 'string') {
                    const cellText = cell.value.toLowerCase();
                    if (cellText.includes('jumlah produksi')) {
                        quantityCell = worksheet.getCell(rowNumber, colNumber + 2);
                    } else if (cellText.includes('batch')) {
                        batchCell = worksheet.getCell(rowNumber, colNumber + 1);
                    } else if (cellText.includes('tank No')) {
                        tankCell = worksheet.getCell(rowNumber, colNumber + 1);
                    }
                }
            });
        });

        // Update the cells if found, otherwise try the default positions
        if (quantityCell) {
            quantityCell.value = production.quantity;
        } else {
            try {
                worksheet.getCell('F6').value = production.quantity;
            } catch (err) {
                console.warn('Could not update quantity in default cell F6');
            }
        }

        if (batchCell) {
            batchCell.value = production.batchNumber;
        } else {
            try {
                worksheet.getCell('H3').value = production.batchNumber;
            } catch (err) {
                console.warn('Could not update batch number in default cell H3');
            }
        }

        const tankNames = production.Tanks.map(tank => tank.name).join(', ');
        if (tankCell) {
            tankCell.value = tankNames || 'N/A';
        } else {
            try {
                worksheet.getCell('H4').value = tankNames || 'N/A';
            } catch (err) {
                console.warn('Could not update tank names in default cell H4');
            }
        }

        // Generate a new file name for the updated file
        const updatedFileName = `Updated_${path.basename(filePath)}`;
        const updatedFilePath = path.join(__dirname, '../uploads', updatedFileName);

        // Save the updated file
        await workbook.xlsx.writeFile(updatedFilePath);

        // Set headers for file download
        res.setHeader('Content-Disposition', `attachment; filename=${updatedFileName}`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Update production status to ready for QC and mark as printed
        await production.update({
            isPrinted: true
        });

        // Send notification for printed production
        req.app.locals.sendNotification({
            type: 'productionPrinted',
            batchNumber: production.batchNumber,
            status: 'Printed',
            audio: 'production.mp3'
        });

        // Stream the file to the client for download
        res.download(updatedFilePath, updatedFileName, (err) => {
            if (err) {
                console.error('Error downloading file:', err);
                return res.status(500).send('Error downloading the file');
            } else {
                // Optionally delete the file after download
                fs.unlink(updatedFilePath, (err) => {
                    if (err) {
                        console.error('Error deleting file:', err);
                    }
                });
            }
        });

    } catch (error) {
        console.error('Error printing production:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Blending Guide generated from the structured formula (single source of truth).
// Read-only: computes each raw material's quantity = (percentage / 100) * batch qty,
// renders a print-ready page. Does NOT mutate state, so it never interferes with the
// existing upload-based print flow.
exports.getBlendingGuide = async (req, res) => {
    try {
        const { id } = req.params;
        const production = await Production.findByPk(id, {
            include: [
                { model: Product },
                { model: Tank, through: { attributes: [] } }
            ]
        });

        if (!production) {
            return res.status(404).send('Production not found');
        }

        const formulaItems = await ProductFormula.findAll({
            where: { productId: production.productId },
            include: [RawMaterial]
        });

        const totalQty = Number(production.quantity) || 0;
        const rows = formulaItems.map((f, i) => {
            const rm = f.RawMaterial;
            const pct = Number(f.percentage) || 0;
            const qtyKg = (pct / 100) * totalQty;
            const density = rm && rm.density ? Number(rm.density) : null;
            const qtyL = (density && density > 0) ? (qtyKg / density) : null;
            return {
                no: i + 1,
                name: rm ? rm.name : '(bahan baku tidak ditemukan)',
                form: rm ? rm.form : '',
                percentage: pct,
                qtyKg,
                qtyL
            };
        });

        const totalPct = rows.reduce((s, r) => s + r.percentage, 0);
        const totalKg = rows.reduce((s, r) => s + r.qtyKg, 0);
        const tankNames = (production.Tanks || []).map(t => t.name).join(', ') || '-';

        res.render('production/blendingGuide', {
            production,
            product: production.Product,
            rows,
            totalPct,
            totalKg,
            totalQty,
            tankNames,
            generatedAt: new Date(),
            userRole: req.user.role,
            path: '/production/blending-guide'
        });
    } catch (error) {
        console.error('Error generating blending guide:', error);
        res.status(500).send('Error generating blending guide');
    }
};

exports.getProductionSchedule = async (req, res) => {
    try {
        const productions = await Production.findAll({
            include: {
                model: Product,
                attributes: ['name']
            }
        });

        const productionEvents = productions.map(production => ({
            id: production.id,
            title: `${production.id} ${production.Product.name} (${production.quantity} Kg)`,
            start: production.startDate.toISOString(),
            end: production.deadlineDate.toISOString(),
            extendedProps: {
                batchNumber: production.batchNumber,
                quantity: production.quantity,
                qcStatus: production.qcStatus,
                stirSequence: production.stirSequence,
                sampleRetained: production.sampleRetained,
                retainedSampleVolume: production.retainedSampleVolume
            }
        }));
        const userRole = req.user.role;
        res.render('production/productionSchedule', { 
            productionEvents, 
            userRole,
            path: '/productionSchedule'
        });
    } catch (error) {
        console.error('Error fetching production schedule:', error);
        res.status(500).send('Internal Server Error');
    }
};





// Route to serve the JSON data for FullCalendar
exports.getProductionScheduleData = async (req, res) => {
    try {
        // Fetch all production records
        const productions = await Production.findAll({
            include: {
                model: Product,
                attributes: ['name']
            }
        });

        // Map production records to a format that FullCalendar can understand
        const productionEvents = productions.map(production => ({
            id: production.id,
            title: `${production.Product.name} (${production.quantity} Kg)`,
            start: production.startDate.toISOString(),
            end: production.deadlineDate.toISOString(),
            backgroundColor: 'green',
            borderColor: 'green',
            extendedProps: {
                batchNumber: production.batchNumber,
                quantity: production.quantity,
                qcStatus: production.qcStatus,
                stirSequence: production.stirSequence,
                sampleRetained: production.sampleRetained,
                retainedSampleVolume: production.retainedSampleVolume
            }
        }));

        // Return the production events as JSON
        res.json(productionEvents);
    } catch (error) {
        console.error('Error fetching production schedule data:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.renderEquipmentPage = async (req, res) => {
    try {
        const balances = await Balance.findAll();
        const forklifts = await Forklift.findAll();
        const userRole = req.user.role;
        res.render('production/manageEquipment', { 
            balances, 
            forklifts, 
            userRole,
            path: '/equipment'
        });
    } catch (error) {
        console.error('Error rendering equipment page:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.addBalance = async (req, res) => {
    try {
        const { name, price } = req.body;
        await Balance.create({ name, price });
        res.redirect('/equipment');
    } catch (error) {
        console.error('Error adding balance:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.addForklift = async (req, res) => {
    try {
        const { name, price } = req.body;
        await Forklift.create({ name, price });
        res.redirect('/equipment');
    } catch (error) {
        console.error('Error adding forklift:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.setBGReceived = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const { id } = req.params;

    try {
        const production = await Production.findByPk(id);

        if (!production) {
            if (wantsJson) return res.status(404).json({ success: false, message: 'Production not found' });
            return res.status(404).send('Production not found');
        }

        // Update the production status to In Production
        production.status = 'In Production';
        await production.save();

        if (wantsJson) return res.json({ success: true });
        res.redirect('/dashboard/production');
    } catch (error) {
        console.error('Error updating production status:', error);
        if (wantsJson) return res.status(500).json({ success: false, message: 'Internal Server Error' });
        res.status(500).send('Internal Server Error');
    }
};

exports.quarantineProduction = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const { id } = req.params;

    try {
        const production = await Production.findByPk(id);

        if (!production) {
            if (wantsJson) return res.status(404).json({ success: false, message: 'Production not found' });
            return res.status(404).send('Production not found');
        }

        // Update the production status to Quarantined
        production.status = 'Quarantined';
        await production.save();

        if (wantsJson) return res.json({ success: true });
        res.redirect('/dashboard/production');
    } catch (error) {
        console.error('Error quarantining production:', error);
        if (wantsJson) return res.status(500).json({ success: false, message: 'Internal Server Error' });
        res.status(500).send('Internal Server Error');
    }
};
