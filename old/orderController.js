const Order = require('../models/order');
const Customer = require('../models/customer');
const Product = require('../models/product');
const ProductionRequest = require('../models/productionRequest');
const RawMaterialRequest = require('../models/rawMaterialRequest');
const Vendor = require('../models/vendor');
const PDFDocument = require('pdfkit');
const OrderItem = require('../models/orderItem');
const FormulaRequest = require('../models/formulaRequest');
const {Production, ProductionRawMaterial} = require('../models/production');
const Tank = require('../models/tank');
const { Op } = require('sequelize');
const Packaging = require('../models/packaging');
const RawMaterialRequestVendor = require('../models/rawMaterialRequestVendor');
const RawMaterial = require('../models/rawMaterial');
const TdsMsdsRequest = require('../models/tdsmsdsRequest');
const Consumable = require('../models/consumable');


exports.createOrderForm = async (req, res) => {
    try {
        const customers = await Customer.findAll();
        const products = await Product.findAll(); // Fetch products from the database
        const packagings = await Packaging.findAll();
        const consumables = await Consumable.findAll(); // Fetch consumables from the database
        const userRole = req.user.role;

        // Pass the consumables data to the view
        res.render('orders/createOrder', { customers, products, packagings, consumables, userRole });
    } catch (error) {
        console.error('Error fetching data for order form:', error);
        res.status(400).send(error);
    }
};


exports.checkStockForm = (req, res) => {
    const userRole = req.user.role;
    res.render('orders/checkStock', {userRole} );
};

exports.createOrder = async (req, res) => {
    const { customerId, products, notes, paymentType, tax, consumables } = req.body;
    const po = req.file.filename;
    const deadlineOption = req.body.deadlineOption;
    const deadlineDate = deadlineOption === "yes" ? req.body.deadlineDate : null;

    try {
        // Verify customer
        const customer = await Customer.findByPk(customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }

        let totalOrderAmount = 0;
        const consumableFees = {};
        let totalConsumableFees = 0;

        // Fetch consumable fees and initialize consumable flags
        const allConsumables = await Consumable.findAll();
        const consumableFlags = {
            pallet: false,
            sticker: false,
            wrap: false,
            handling: false,
            logistic: false,
            triplek: false,
            peti: false,
            kabelties: false,
        };

        // Normalize consumable names from the database for consistent comparison
        allConsumables.forEach((item) => {
            const normalizedKey = item.name.toLowerCase().replace(/ /g, '');
            consumableFees[normalizedKey] = item.fee;
        });

        // Calculate total consumable fees and set flags
        if (Array.isArray(consumables)) {
            consumables.forEach((consumable) => {
                const normalizedKey = consumable.toLowerCase().replace(/ /g, '');
                if (consumableFees[normalizedKey] !== undefined) {
                    totalConsumableFees += consumableFees[normalizedKey];
                    if (consumableFlags.hasOwnProperty(normalizedKey)) {
                        consumableFlags[normalizedKey] = true;
                    }
                } else {
                    throw new Error(`Unknown consumable: ${consumable}`);
                }
            });
        }

        const createdOrderItems = [];

        // Process each product
        for (const productData of products) {
            const { productId, quantity, packaging, satuan } = productData;

            // Validate product
            const product = await Product.findByPk(productId);
            if (!product) {
                throw new Error(`Product with ID ${productId} not found`);
            }

            let totalProductQuantity = 0;

            // Process packaging options
            for (const packagingData of Object.values(packaging)) {
                const { packagingId, quantity: packagingQuantity } = packagingData;

                const packagingInstance = await Packaging.findByPk(packagingId);
                if (!packagingInstance) {
                    throw new Error(`Packaging with ID ${packagingId} not found`);
                }

                const calculatedQuantity = packagingQuantity * packagingInstance.volume;
                totalProductQuantity += calculatedQuantity;

                // Calculate total price
                const unitPrice = satuan === 'L' ? product.price * product.density : product.price;
                createdOrderItems.push({
                    orderId: null, // Placeholder to be set later
                    productId: product.id,
                    quantity: calculatedQuantity,
                    packagingId: packagingInstance.id,
                    total: unitPrice * calculatedQuantity,
                    unit: packagingQuantity,
                    satuan,
                });
            }

            // Validate quantity
            if (totalProductQuantity !== parseFloat(quantity)) {
                throw new Error(
                    `Mismatch for product ${product.name}: total packaging quantity (${totalProductQuantity} ${satuan}) does not match order quantity (${quantity} ${satuan})`
                );
            }

            // Calculate total price for the product
            const unitPrice = satuan === 'L' ? product.price * product.density : product.price;
            totalOrderAmount += unitPrice * totalProductQuantity;
        }

        // Add consumable fees to the total order amount
        totalOrderAmount += totalConsumableFees;

        // Create order
        const newOrder = await Order.create({
            customerName: customer.name,
            customerId,
            status: 'Pending',
            po,
            total: totalOrderAmount,
            pallet: consumableFlags.pallet,
            sticker: consumableFlags.sticker,
            wrap: consumableFlags.wrap,
            handling: consumableFlags.handling,
            logistic: consumableFlags.logistic,
            triplek: consumableFlags.triplek,
            peti: consumableFlags.peti,
            kabelties: consumableFlags.kabelties,
            notes,
            deadline: deadlineDate ? new Date(deadlineDate) : null,
            paymentType,
            tax,
        });

        // Link order items
        for (const itemData of createdOrderItems) {
            await OrderItem.create({
                ...itemData,
                orderId: newOrder.id,
            });
        }

        res.redirect('/dashboard/marketing');
    } catch (error) {
        console.error('Error creating order:', error.message);
        res.status(400).send(error.message);
    }
};





exports.addCustomerForm = (req, res) => {
    const userRole = req.user.role;
    res.render('customers/addCustomer', { userRole });

};

exports.addCustomer = async (req, res) => {
    const { name, phone, email, alamat, perusahaan, cp } = req.body;

    try {
        await Customer.create({ name, phone, email, alamat, perusahaan, cp });
        res.redirect('/dashboard/marketing');
    } catch (error) {
        console.error('Error adding customer:', error);
        res.status(400).send(error);
    }
};

exports.checkStock = async (req, res) => {
    const { product, quantity } = req.body;

    try {
        const productRecord = await Product.findOne({ where: { name: product } });
        if (productRecord && productRecord.stock >= quantity) {
            res.status(200).send({ message: 'Stock available' });
        } else {
            res.status(400).send({ message: 'Stock not available' });
        }
    } catch (error) {
        res.status(400).send(error);
    }
};

exports.getOrders = async (req, res) => {
    try {
        const orders = await Order.findAll();
        res.status(200).render('dashboards/ppic', { orders });
    } catch (error) {
        res.status(400).send(error);
    }
};

exports.getPpicDashboardData = async (req, res) => {
    try {
        const orders = await Order.findAll({
            where: {
                status: ['Pending','On Production','Production Completed']
            },
            include: [
                {
                    model: Customer,
                    attributes: ['name']
                },
                {
                    model: OrderItem,
                    include: [
                        {
                            model: Product,
                            attributes: ['name', 'formula']
                        }
                    ]
                }
            ]
        });

        const userRole = req.user.role;

        const aggregatedOrders = orders.map(order => {
            const productMap = {};
            order.OrderItems.forEach(item => {
                const productName = item.Product.name;
                if (productMap[productName]) {
                    productMap[productName] += item.quantity;
                } else {
                    productMap[productName] = item.quantity;
                }
            });
            const products = Object.keys(productMap).map(name => ({
                name,
                quantity: productMap[name]
            }));
            return {
                ...order.toJSON(),
                products
            };
        });

        const requests = await ProductionRequest.findAll({
            where: {
                status: {
                    [Op.ne]: 'Completed'
                }
            },
            include: [
                {
                    model: Production,
                    as: 'Productions',
                    attributes: ['status'],
                }
            ]
        });

        const updatedRequests = requests.map(request => {
            const allCompleted = request.Productions.length > 0 && 
                                 request.Productions.every(prod => prod.status === 'Completed');
            return {
                ...request.toJSON(),
                allCompleted,
            };
        });

        const formulaRequests = await FormulaRequest.findAll({
            include: [
                {
                    model: Product,
                    attributes: ['name', 'formula']
                }
            ]
        });

        const rawMaterialRequests = await RawMaterialRequest.findAll({
            include: [Vendor]
        });

        const vendors = await Vendor.findAll();

        const completedProductions = await Production.findAll({
            where: {
                status: {
                    [Op.ne]: 'Completed'
                }
            },
            include: [
                {
                    model: Product,
                    attributes: ['name']
                },
                {
                    model: Tank,
                    attributes: ['name', 'volume']
                }
            ]
        });

        res.render('dashboards/ppic', {
            orders: aggregatedOrders,
            requests: updatedRequests,
            rawMaterialRequests,
            vendors,
            formulaRequests,
            completedProductions,
            userRole
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(400).send(error);
    }
};




exports.assignVendor = async (req, res) => {
    const { id } = req.params;
    const { vendorId } = req.body;

    try {
        const request = await RawMaterialRequest.findByPk(id);
        if (!request) {
            return res.status(404).send({ error: 'Request not found' });
        }

        request.vendorId = vendorId;
        request.status = 'Vendor Assigned';
        await request.save();
        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error assigning vendor:', error);
        res.status(400).send(error);
    }
};

exports.forwardRawMaterialRequestToFinance = async (req, res) => {
    const { id } = req.params;

    try {
        const request = await RawMaterialRequest.findByPk(id);
        if (!request) {
            return res.status(404).send({ error: 'Request not found' });
        }

        request.status = 'Vendor Assigned';
        await request.save();
        res.redirect('/dashboard/ppic');
    } catch (error) {
        res.status(400).send(error);
    }
};

exports.getMarketingOrders = async (req, res) => {
    try {
        const { dateRange } = req.query;
        const today = new Date();
        let startDate;

        switch (dateRange) {
            case 'lastMonth':
                startDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
                break;
            case 'lastYear':
                startDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
                break;
            case 'lastWeek':
            default:
                startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
                break;
        }

        const orders = await Order.findAll({
            where: {
                createdAt: {
                    [Op.between]: [startDate, today]
                },
                status: {
                    [Op.ne]: 'Delivered'
                }
            },
            include: [
                {
                    model: Customer,
                    attributes: ['name']
                },
                {
                    model: OrderItem,
                    include: [Product]
                }
            ]
        });

        const userRole = req.user.role;

        const productMap = {};

        orders.forEach(order => {
            const aggregatedProducts = {};

            order.OrderItems.forEach(item => {
                const productName = item.Product.name;
                const productSatuan = item.satuan; // Assuming satuan is a property of OrderItem

                if (aggregatedProducts[productName]) {
                    aggregatedProducts[productName].quantity += item.quantity;
                } else {
                    aggregatedProducts[productName] = {
                        quantity: item.quantity,
                        satuan: productSatuan
                    };
                }

                if (productMap[productName]) {
                    productMap[productName].quantity += item.quantity;
                } else {
                    productMap[productName] = {
                        quantity: item.quantity,
                        satuan: productSatuan
                    };
                }
            });

            order.products = Object.keys(aggregatedProducts).map(name => ({
                name,
                quantity: aggregatedProducts[name].quantity,
                satuan: aggregatedProducts[name].satuan
            }));
        });

        const aggregatedProducts = Object.keys(productMap)
            .map(name => ({
                name,
                quantity: productMap[name].quantity,
                satuan: productMap[name].satuan
            }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);

        res.render('dashboards/marketing', { orders, aggregatedProducts, userRole });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(400).send(error);
    }
};


exports.getRAndDOrders = async (req, res) => {
    try {
        // Fetch orders
        const orders = await Order.findAll();

        // Fetch formula requests
        let formulaRequests = await FormulaRequest.findAll({
            include: [Product],
        });
        formulaRequests = formulaRequests.filter(request => request.status !== 'Approved');

        // Fetch TDS/MSDS requests with product details
        const tdsmsdsRequests = await TdsMsdsRequest.findAll({
            include: {
                model: Product,
                attributes: ['id', 'name'], // Fetch only necessary fields
            },
        });

        // User role
        const userRole = req.user.role;

        // Render the R&D dashboard with all the data
        res.render('dashboards/rd', {
            orders,
            formulaRequests,
            tdsmsdsRequests, // Include TDS/MSDS requests
            userRole,
        });
    } catch (error) {
        console.error('Error fetching orders, formula requests, and TDS/MSDS requests:', error);
        res.status(400).send(error);
    }
};

exports.uploadFormula = async (req, res) => {
    const { id } = req.params;
    const formulaFile = req.file.filename;

    try {
        const formulaRequest = await FormulaRequest.findByPk(id);
        if (!formulaRequest) {
            return res.status(404).send({ error: 'Formula request not found' });
        }

        const product = await Product.findByPk(formulaRequest.productId);
        if (!product) {
            return res.status(404).send({ error: 'Product not found' });
        }

        product.formula = formulaFile;
        await product.save();

        formulaRequest.status = 'Approved';
        await formulaRequest.save();

        res.redirect('/dashboard/rd');
    } catch (error) {
        console.error('Error uploading formula:', error);
        res.status(400).send(error);
    }
};

exports.declineFormulaRequest = async (req, res) => {
    const { id } = req.params;

    try {
        const formulaRequest = await FormulaRequest.findByPk(id);
        if (!formulaRequest) {
            return res.status(404).send({ error: 'Formula request not found' });
        }

        formulaRequest.status = 'Declined';
        await formulaRequest.save();

        res.redirect('/dashboard/rd');
    } catch (error) {
        console.error('Error declining formula request:', error);
        res.status(400).send(error);
    }
};

exports.approveOrder = async (req, res) => {
    const { id } = req.params;

    try {
        const order = await Order.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    include: [Product, Packaging] // Include Packaging to access the packaging data
                }
            ]
        });

        if (!order) {
            return res.status(404).send({ error: 'Order not found' });
        }

        let allProductsInStock = true;
        let outOfStockProducts = [];
        let outOfStockPackagings = [];

        // Check product and packaging stock availability
        for (const orderItem of order.OrderItems) {
            const product = await Product.findByPk(orderItem.productId);
            const packaging = await Packaging.findByPk(orderItem.packagingId);

            let requiredQuantity = orderItem.quantity;
            if (orderItem.satuan === 'L') {
                requiredQuantity *= product.density;
            }

            if (!product || product.stock < requiredQuantity) {
                allProductsInStock = false;
                outOfStockProducts.push(product ? product.name : `Product ID ${orderItem.productId}`);
            }

            if (!packaging || packaging.stock < orderItem.unit) {
                allProductsInStock = false;
                outOfStockPackagings.push(packaging ? packaging.name : `Packaging ID ${orderItem.packagingId}`);
            }
        }

        if (allProductsInStock) {
            // Decrement product stock and packaging stock
            for (const orderItem of order.OrderItems) {
                const product = await Product.findByPk(orderItem.productId);
                const packaging = await Packaging.findByPk(orderItem.packagingId);

                let requiredQuantity = orderItem.quantity;
                if (orderItem.satuan === 'L') {
                    requiredQuantity *= product.density;
                }

                product.stock -= requiredQuantity;
                packaging.stock -= orderItem.unit; // Decrease the packaging stock by the unit count

                await product.save();
                await packaging.save();
            }

            // Update the order status to "Approved"
            order.status = 'Approved';
            await order.save();

            res.redirect('/dashboard/ppic');
        } else {
            res.status(400).send({
                error: 'Stock not available for the following products or packagings:',
                outOfStockProducts,
                outOfStockPackagings
            });
        }
    } catch (error) {
        console.error('Error approving order:', error);
        res.status(400).send(error);
    }
};


exports.checkOrderStock = async (req, res) => {
    const { id } = req.params;

    try {
        const order = await Order.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    include: [
                        {
                            model: Product,
                            attributes: ['name', 'stock', 'formula']
                        }
                    ]
                }
            ]
        });

        if (!order) {
            return res.status(404).send({ error: 'Order not found' });
        }

        const productQuantities = {};
        const outOfStockProducts = [];
        const inStockProducts = [];

        // Aggregate quantities by product name
        for (const item of order.OrderItems) {
            if (!productQuantities[item.Product.name]) {
                productQuantities[item.Product.name] = { quantity: 0, stock: item.Product.stock };
            }
            productQuantities[item.Product.name].quantity += item.quantity;
        }

        // Check stock for aggregated products
        for (const [productName, { quantity, stock }] of Object.entries(productQuantities)) {
            if (stock < quantity) {
                outOfStockProducts.push({
                    name: productName,
                    needed: quantity,
                    available: stock
                });
            } else {
                inStockProducts.push({
                    name: productName,
                    available: stock
                });
            }
        }

        if (outOfStockProducts.length > 0) {
            return res.send({
                error: 'Some products are out of stock',
                outOfStockProducts,
                inStockProducts
            });
        } else {
            return res.send({
                message: 'All products are in stock',
                inStockProducts
            });
        }
    } catch (error) {
        console.error('Error checking stock:', error);
        res.status(500).send({ error: 'An error occurred while checking stock' });
    }
};


exports.requestFormula = async (req, res) => {
    const { id } = req.params;

    try {
        const order = await Order.findByPk(id, {
            include: [{
                model: OrderItem,
                include: [Product]
            }]
        });

        if (!order) {
            return res.status(404).send({ error: 'Order not found' });
        }

        const uniqueProducts = new Map();

        // Group products by their name to avoid duplicates
        for (const item of order.OrderItems) {
            const product = item.Product;

            if (!uniqueProducts.has(product.name)) {
                uniqueProducts.set(product.name, product);
            }
        }

        // Create a formula request for each unique product
        for (const product of uniqueProducts.values()) {
            if (!product.formula) {
                await FormulaRequest.create({ productId: product.id });
            }
        }

        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error requesting formula:', error);
        res.status(400).send(error);
    }
};

exports.processOrder = async (req, res) => {
    const { id } = req.params;

    try {
        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).send({ error: 'Order not found' });
        }

        order.status = 'Processing';
        await order.save();
        res.redirect('/dashboard/ppic');
    } catch (error) {
        res.status(400).send(error);
    }
};

exports.declineOrder = async (req, res) => {
    const { id } = req.params;

    try {
        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).send({ error: 'Order not found' });
        }

        order.status = 'Declined';
        await order.save();
        res.redirect('/dashboard/ppic');
    } catch (error) {
        res.status(400).send(error);
    }
};

exports.getApprovedOrders = async (req, res) => {
    try {
        const orders = await Order.findAll({
            where: {
                status: ['Approved', 'Paid' ]
            }
        });
        const rawMaterialRequestsVendors = await RawMaterialRequestVendor.findAll({
            where: {
                status: ['Approved','Pending','Paid']
            },
            include: [
                { 
                    model: RawMaterialRequest,
                    include: [{ model: RawMaterial, attributes: ['price','density'] }] // Include price from RawMaterial
                },
                { model: Vendor }
            ]
        });
        const userRole = req.user.role;
        res.render('dashboards/finance', { orders, rawMaterialRequestsVendors, userRole });
    } catch (error) {
        res.status(400).send(error);
    }
};

exports.getOrderDetails = async (req, res) => {
    const { id } = req.params;

    try {
        const order = await Order.findByPk(id, {
            include: [
                {
                    model: Customer,
                    attributes: ['name', 'phone', 'email', 'alamat', 'perusahaan', 'cp']
                },
                {
                    model: OrderItem,
                    include: [
                        {
                            model: Product,
                            attributes: ['name', 'price']
                        },
                        {
                            model: Packaging,
                            attributes: ['name', 'volume']
                        }
                    ]
                },
                {
                    model: RawMaterialRequest,
                    attributes: ['status']
                }
            ]
        });

        if (!order) {
            return res.status(404).send('Order not found');
        }

        // Group the order items by product
        const groupedItems = {};
        order.OrderItems.forEach(item => {
            const key = item.Product.name;

            if (!groupedItems[key]) {
                groupedItems[key] = {
                    product: item.Product.name,
                    unitPrice: item.Product.price,
                    totalQuantity: 0,
                    totalPrice: 0,
                    packagingDetails: []
                };
            }

            groupedItems[key].totalQuantity += item.quantity;
            groupedItems[key].totalPrice += item.Product.price * item.quantity;

            // Add packaging details
            groupedItems[key].packagingDetails.push({
                packagingName: item.Packaging.name,
                volume: item.Packaging.volume,
                unit: item.unit
            });
        });

        res.render('orders/orderDetails', { order, groupedItems: Object.values(groupedItems) });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.printInvoice = async (req, res) => {
    const { id } = req.params;

    try {
        const order = await Order.findByPk(id, {
            include: [
                {
                    model: Customer,
                    attributes: ['name', 'phone', 'email', 'alamat', 'perusahaan', 'cp']
                },
                {
                    model: OrderItem,
                    include: [
                        {
                            model: Product,
                            attributes: ['name', 'price']
                        },
                        {
                            model: Packaging,
                            attributes: ['name', 'volume']
                        }
                    ]
                }
            ]
        });

        if (!order) {
            return res.status(404).send({ error: 'Order not found' });
        }

        // Grouping the order items by product name
        const groupedItems = {};

        order.OrderItems.forEach(item => {
            const key = item.Product.name;

            if (!groupedItems[key]) {
                groupedItems[key] = {
                    quantity: 0,
                    total: 0,
                    price: item.Product.price,
                    packagingDetails: []
                };
            }

            groupedItems[key].quantity += item.quantity;
            groupedItems[key].total += item.total;
            groupedItems[key].packagingDetails.push({
                packagingName: item.Packaging.name,
                packagingVolume: item.Packaging.volume,
                unit: item.unit
            });
        });

        // Generate PDF invoice
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.id}.pdf`);

        doc.pipe(res);

        // Add the company logo
        doc.image('public/images/logomib.png', 50, 45, { width: 30 });

        // Company Information
        doc.fontSize(20).text('MIB Chemicals', 110, 57);
        doc.fontSize(10).text('Jalan Cisauk Raya', 200, 65, { align: 'right' });
        doc.text('Tangerang, Cisauk, 15344', 200, 80, { align: 'right' });
        doc.text('Phone: 083814794726', 200, 95, { align: 'right' });
        doc.text('Email: info@mibchemicals.com', 200, 110, { align: 'right' });

        doc.moveDown();

        // Invoice Header
        doc.fontSize(20).text('Invoice', 50, 160);
        doc.moveDown();

        // Invoice Details
        doc.fontSize(12).text(`Invoice Number: ${order.id}`, 50, 200);
        doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`, 50, 215);
        doc.text(`Balance Due: Rp${order.total.toFixed(2)}`, 50, 230);

        // Billing Information
        doc.text(`Customer Name: ${order.Customer.name}`, 400, 200);
        doc.text(`Address: ${order.Customer.alamat}`, 400, 215);
        doc.text(`Phone: ${order.Customer.phone}`, 400, 230);

        doc.moveDown();

        // Table Header
        doc.moveDown().text('Item', 50, 280).moveDown();
        doc.text('Description', 150, 280).moveDown();
        doc.text('Unit Cost', 280, 280).moveDown();
        doc.text('Quantity', 370, 280).moveDown();
        doc.text('Line Total', 450, 280).moveDown();

        doc.moveTo(50, 295).lineTo(550, 295).stroke();

        let y = 300;

        // Table Body
        for (const [productName, item] of Object.entries(groupedItems)) {
            doc.fontSize(10).text(productName, 50, y);
            doc.text('Details', 150, y);
            doc.text(`Rp${item.price.toFixed(2)}`, 280, y);
            doc.text(item.quantity, 370, y);
            doc.text(`Rp${item.total.toFixed(2)}`, 450, y);

            y += 20;

            // Packaging Details
            item.packagingDetails.forEach(packaging => {
                doc.fontSize(8).text(`Packaging: ${packaging.packagingName}, Volume: ${packaging.packagingVolume} L, Unit: ${packaging.unit}`, 150, y);
                y += 15;
            });

            y += 10;
        }

        // Footer
        doc.moveDown().text('Subtotal', 400, y + 30);
        doc.text(`Rp${order.total.toFixed(2)}`, 450, y + 30);
        doc.text('Paid To Date', 400, y + 45);
        doc.text('0.00', 450, y + 45);
        doc.text('Balance Due', 400, y + 60);
        doc.text(`Rp${order.total.toFixed(2)}`, 450, y + 60);

        doc.moveDown().text('Payment is due within 15 days. Thank you for your business.', 50, y + 100, { align: 'center' });

        doc.end();

        // Update printed status
        order.printed = true;
        await order.save();
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(400).send(error);
    }
};

exports.deliverOrder = async (req, res) => {
    const orderId = req.params.id;

    try {
        // Update the order status to "Delivered"
        await Order.update(
            { status: 'Delivered' },
            { where: { id: orderId } }
        );

        // Redirect back to the marketing dashboard or wherever you'd like
        res.redirect('/dashboard/marketing');
    } catch (error) {
        console.error('Error delivering order:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.getDeliveredOrders = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Set default date range (last 7 days)
        const today = new Date();
        const defaultStartDate = new Date(today);
        defaultStartDate.setDate(today.getDate() - 7); // 7 days ago
        const defaultEndDate = today;

        // If endDate is provided, set its time to the end of the day
        const endFilterDate = endDate ? new Date(endDate) : defaultEndDate;
        endFilterDate.setHours(23, 59, 59, 999);

        const whereClause = {
            status: 'Delivered',
            createdAt: {
                [Op.gte]: startDate ? new Date(startDate) : defaultStartDate,
                [Op.lte]: endFilterDate
            }
        };

        // Fetch all delivered orders with the date filter
        const orders = await Order.findAll({
            where: whereClause,
            include: [
                {
                    model: Customer,
                    attributes: ['name']
                },
                {
                    model: OrderItem,
                    include: [Product]
                }
            ],
            attributes: ['id', 'customerName', 'createdAt', 'po', 'paymentType', 'paymentDueDate']
        });

        const userRole = req.user.role;

        // Aggregate product quantities for each order
        const aggregatedOrders = orders.map(order => {
            const productMap = {};

            order.OrderItems.forEach(item => {
                const productName = item.Product.name;
                const productUnit = item.satuan; // Use 'satuan' field for the unit
                if (productMap[productName]) {
                    productMap[productName].quantity += item.quantity;
                } else {
                    productMap[productName] = {
                        quantity: item.quantity,
                        satuan: productUnit
                    };
                }
            });

            const products = Object.keys(productMap).map(name => ({
                name,
                quantity: productMap[name].quantity,
                satuan: productMap[name].satuan
            }));

            return {
                ...order.toJSON(),
                customerName: order.Customer.name,
                products
            };
        });

        // Render the delivered orders page with the aggregated orders
        res.render('orders/deliveredOrders', {
            orders: aggregatedOrders,
            userRole,
            startDate: startDate || defaultStartDate.toISOString().split('T')[0],
            endDate: endDate || defaultEndDate.toISOString().split('T')[0],
        });
    } catch (error) {
        console.error('Error fetching delivered orders:', error);
        res.status(500).send('Internal Server Error');
    }
};








