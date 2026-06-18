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
const Complain = require('../models/complain');
const ComplainItem = require('../models/complainItem');
const Packaging = require('../models/packaging');
const RawMaterialRequestVendor = require('../models/rawMaterialRequestVendor');
const RawMaterial = require('../models/rawMaterial');
const TdsMsdsRequest = require('../models/tdsmsdsRequest');
const Consumable = require('../models/consumable');
const sequelize = require('../config/database'); // Import sequelize instance
const PackagingRequest = require('../models/packagingRequest');
const PackagingRequestVendor = require('../models/packagingRequestVendor');

exports.createOrderForm = async (req, res) => {
    try {
        const customers = await Customer.findAll();
        const products = await Product.findAll(); // Fetch products from the database
        const packagings = await Packaging.findAll();
        const consumables = await Consumable.findAll(); // Fetch consumables from the database
        const userRole = req.user.role;

        // Pass the consumables data to the view
        res.render('orders/createOrder', { 
            customers, 
            products, 
            packagings, 
            consumables, 
            userRole,
            path: '/orders/create'
        });
    } catch (error) {
        console.error('Error fetching data for order form:', error);
        res.status(400).send(error);
    }
};


exports.checkStockForm = (req, res) => {
    const userRole = req.user.role;
    res.render('orders/checkStock', { userRole, path: '/orders/checkStock' });
};

exports.createOrder = async (req, res) => {
    const generateSoNumber = async () => {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear().toString().slice(-2);

        const lastOrder = await Order.findOne({
            where: sequelize.where(
                sequelize.fn('MONTH', sequelize.col('createdAt')),
                currentMonth
            ),
            order: [['createdAt', 'DESC']],
        });

        let orderNumber = 1;
        if (lastOrder) {
            const lastSoNumber = lastOrder.sonumber.split('/')[0];
            orderNumber = parseInt(lastSoNumber, 10) + 1;
        }

        const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
        const romanMonth = romanMonths[currentMonth - 1];

        return `${orderNumber.toString().padStart(3, '0')}/SO/MIB/${romanMonth}/${currentYear}`;
    };

    try {
        const soNumber = await generateSoNumber();

        const { customerId, products, notes, paymentType, tax, consumables } = req.body;
        const po = req.file.filename;
        const deadlineOption = req.body.deadlineOption;
        const deadlineDate = deadlineOption === "yes" ? req.body.deadlineDate : null;

        // Verify customer
        const customer = await Customer.findByPk(customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }

        // --- NEW: Check for duplicate products ---
        if (!Array.isArray(products)) {
            throw new Error('Products must be an array.');
        }
        const seenProducts = new Map(); // Using Map to store both ID and name
        for (const productData of products) {
            const product = await Product.findByPk(productData.productId);
            if (!product) {
                throw new Error(`Product with ID ${productData.productId} not found`);
            }
            
            if (seenProducts.has(productData.productId)) {
                throw new Error(`Duplicate product "${product.name}" is not allowed in a single order.`);
            }
            seenProducts.set(productData.productId, product.name);
        }
        // ------------------------------------------

        let totalOrderAmount = 0;
        let totalConsumableFees = 0;
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

        const allConsumables = await Consumable.findAll();
        const consumableFeeMap = new Map();
        allConsumables.forEach(item => {
            const normalizedKey = item.name.toLowerCase().replace(/ /g, '');
            consumableFeeMap.set(normalizedKey, item.fee);
        });

        if (Array.isArray(consumables)) {
            consumables.forEach(consumable => {
                const normalizedKey = consumable.toLowerCase().replace(/ /g, '');
                if (consumableFeeMap.has(normalizedKey)) {
                    const fee = consumableFeeMap.get(normalizedKey);
                    totalConsumableFees += fee;
                    if (consumableFlags.hasOwnProperty(normalizedKey)) {
                        consumableFlags[normalizedKey] = true;
                    }
                } else {
                    throw new Error(`Unknown consumable: ${consumable}`);
                }
            });
        }

        const createdOrderItems = [];

        // Process each product in the order
        for (const productData of products) {
            const { productId, quantity, packaging, satuan } = productData;

            // Validate product existence
            const product = await Product.findByPk(productId);
            if (!product) {
                throw new Error(`Product with ID ${productId} not found`);
            }

            // Use the exact inputted quantity
            const inputQuantity = parseFloat(quantity);
            let remainingQuantity = inputQuantity;

            // Calculate unit price (if unit is L, multiply base price by density)
            const unitPrice = (satuan === 'L') ? product.price * product.density : product.price;

            // Calculate total packaging volume to distribute quantity proportionally
            let totalPackagingVolume = 0;
            const packagingVolumes = {};

            for (const key in packaging) {
                if (packaging.hasOwnProperty(key)) {
                    const packagingData = packaging[key];
                    const { packagingId, quantity: packagingQuantity } = packagingData;
                    const packQty = parseFloat(packagingQuantity);

                    const packagingInstance = await Packaging.findByPk(packagingId);
                    if (!packagingInstance) {
                        throw new Error(`Packaging with ID ${packagingId} not found`);
                    }

                    const volume = packQty * packagingInstance.volume;
                    totalPackagingVolume += volume;
                    packagingVolumes[key] = {
                        volume,
                        packagingInstance,
                        packQty
                    };
                }
            }

            // Distribute quantity proportionally among packaging options
            for (const key in packaging) {
                if (packaging.hasOwnProperty(key)) {
                    const { volume, packagingInstance, packQty } = packagingVolumes[key];
                    
                    // Calculate proportional quantity for this packaging
                    const proportion = volume / totalPackagingVolume;
                    const packagingQuantity = Math.round(inputQuantity * proportion * 100) / 100;
                    
                    // Calculate the packaging fee for this row
                    const packagingPrice = packagingInstance.price || 0;
                    const packagingFee = packagingPrice * packQty;

                    // Calculate product total for this portion
                    const productTotal = unitPrice * packagingQuantity;

                    createdOrderItems.push({
                        orderId: null,
                        productId: product.id,
                        quantity: packagingQuantity,
                        packagingId: packagingInstance.id,
                        total: productTotal + packagingFee,
                        unit: packQty,
                        satuan,
                    });

                    totalOrderAmount += productTotal + packagingFee;
                    remainingQuantity -= packagingQuantity;
                }
            }

            // Check if quantities match (allowing for small rounding differences)
            if (Math.abs(remainingQuantity) > 0.01) {
                throw new Error(`Quantity mismatch for product ${product.name}: difference of ${remainingQuantity} ${satuan}`);
            }
        }

        // Add any consumable fees
        totalOrderAmount += totalConsumableFees;

        // Create the order
        const newOrder = await Order.create({
            sonumber: soNumber,
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

        // Link each order item to the new order
        for (const itemData of createdOrderItems) {
            await OrderItem.create({
                ...itemData,
                orderId: newOrder.id,
            });
        }

        // Create products array for the new order
        const aggregatedProducts = {};
        for (const itemData of createdOrderItems) {
            const product = await Product.findByPk(itemData.productId);
            const productName = product.name;
            if (aggregatedProducts[productName]) {
                aggregatedProducts[productName].quantity += itemData.quantity;
            } else {
                aggregatedProducts[productName] = {
                    quantity: itemData.quantity,
                    satuan: itemData.satuan
                };
            }
        }

        newOrder.dataValues.products = Object.keys(aggregatedProducts).map(name => ({
            name,
            quantity: aggregatedProducts[name].quantity,
            satuan: aggregatedProducts[name].satuan
        }));

        res.redirect('/dashboard/marketing');
    } catch (error) {
        console.error('Error creating order:', error.message);
        // Re-fetch the data needed for the form
        const customers = await Customer.findAll();
        const products = await Product.findAll();
        const packagings = await Packaging.findAll();
        const consumables = await Consumable.findAll();
        const userRole = req.user.role;

        // Re-render the create order page with the error message
        return res.render('orders/createOrder', {
            customers,
            products,
            packagings,
            consumables,
            userRole,
            path: '/orders/create',
            error: error.message
        });
    }
};


exports.addCustomerForm = (req, res) => {
    const userRole = req.user.role;
    res.render('customers/addCustomer', { 
        userRole,
        path: '/orders/addCustomer'
    });

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
        res.status(200).render('dashboards/ppic', { 
            orders,
            userRole: req.user.role,
            path: '/dashboard/ppic'
        });
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
                            attributes: ['name', 'formula', 'density']
                        }
                    ]
                }
            ]
        });

        // Get all complain items except completed ones
        const complainItems = await ComplainItem.findAll({
            where: { 
                status: {
                    [Op.ne]: 'Completed'
                }
            },
            include: [{
                model: Complain,
                include: [{
                    model: Order,
                    attributes: ['sonumber', 'customerName']
                }]
            }],
            order: [['createdAt', 'DESC']]
        });

        // Group complain items by complainId to check if all items in a complain are delivered
        const complainGroups = {};
        complainItems.forEach(item => {
            if (!complainGroups[item.complainId]) {
                complainGroups[item.complainId] = {
                    items: [],
                    allDelivered: true
                };
            }
            complainGroups[item.complainId].items.push(item);
            if (item.status !== 'Delivered') {
                complainGroups[item.complainId].allDelivered = false;
            }
        });

        // Add the allDelivered flag to each item
        complainItems.forEach(item => {
            item.allDelivered = complainGroups[item.complainId].allDelivered;
        });

        const userRole = req.user.role;

        const aggregatedOrders = orders.map(order => {
            const productMap = {};
            order.OrderItems.forEach(item => {
                const productName = item.Product.name;
                const quantity = item.satuan === 'L' ? 
                    item.quantity * (item.Product.density || 1) : 
                    item.quantity;
                if (productMap[productName]) {
                    productMap[productName].quantity += quantity;
                } else {
                    productMap[productName] = {
                        quantity: quantity,
                        satuan: item.satuan,
                        density: item.Product.density || 1
                    };
                }
            });
            const products = Object.keys(productMap).map(name => {
                const product = productMap[name];
                return {
                    name,
                    quantity: product.satuan === 'L' ? 
                        product.quantity / product.density : 
                        product.quantity,
                    satuan: product.satuan
                };
            });
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
                },
                {
                    model: Order,
                    attributes: ['sonumber']
                }
            ]
        });

        const updatedRequests = requests.map(request => {
            const allCompletedOrQuarantined = request.Productions.length > 0 && 
                                 request.Productions.every(prod => 
                                     prod.status === 'Completed' || prod.status === 'Quarantined'
                                 );
            return {
                ...request.toJSON(),
                allCompleted: allCompletedOrQuarantined,
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
            where: {
                status: { [Op.ne]: 'Completed' } // Don't show completed requests
            },
            include: [
                {
                    model: RawMaterialRequestVendor,
                    include: [Vendor]
                },
                Vendor
            ]
        });

        // Add a flag to indicate if all vendors are completed/quarantined
        rawMaterialRequests.forEach(request => {
            request.allVendorsCompleted = request.RawMaterialRequestVendors.length > 0 && 
                request.RawMaterialRequestVendors.every(
                    vendor => vendor.status === 'Completed' || vendor.status === 'Quarantined'
                );
        });

        const packagingRequests = await PackagingRequest.findAll({
            where: {
                status: {
                    [Op.ne]: 'Completed'
                }
            },
            include: [
                { model: Packaging },
                { 
                    model: PackagingRequestVendor,
                    include: [{ model: Vendor }]
                }
            ]
        });

        // Add allVendorsCompleted property
        packagingRequests.forEach(request => {
            request.allVendorsCompleted = request.PackagingRequestVendors && 
                request.PackagingRequestVendors.length > 0 && 
                request.PackagingRequestVendors.every(vendor => 
                    vendor.status === 'Completed' || vendor.status === 'Quarantined'
                );
        });

        const vendors = await Vendor.findAll();

        const completedProductions = await Production.findAll({
            where: {
                status: {
                    [Op.notIn]: ['Completed', 'Quarantined']
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
            userRole,
            packagingRequests,
            path: '/dashboard/ppic',
            complainItems,
            messages: req.flash() // Add flash messages to the template data
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

        // Fetch ALL orders except declined ones for chart and top customers (no date filter)
        const allOrders = await Order.findAll({
            where: {
                status: {
                    [Op.ne]: 'Declined'
                }
            },
            include: [
                {
                    model: Customer,
                    attributes: ['name']
                },
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    attributes: ['quantity', 'satuan'],
                    include: [{
                        model: Product,
                        attributes: ['name']
                    }]
                }
            ],
            attributes: {
                include: ['id', 'sonumber', 'createdAt', 'status', 'total']
            }
        });

        // Fetch active orders for table display (with date filter)
        const orders = await Order.findAll({
            where: {
                createdAt: {
                    [Op.between]: [startDate, today]
                },
                status: {
                    [Op.notIn]: ['Declined', 'Delivered']
                }
            },
            include: [
                {
                    model: Customer,
                    attributes: ['name']
                },
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    attributes: ['quantity', 'satuan'],
                    include: [{
                        model: Product,
                        attributes: ['name']
                    }]
                }
            ],
            attributes: {
                include: ['id', 'sonumber', 'createdAt', 'status', 'total']
            }
        });

        // Process ALL orders for chart and customer statistics
        const productMap = {};
        const customerMap = {};

        allOrders.forEach(order => {
            // Process customer statistics
            const customerName = order.Customer.name;
            if (!customerMap[customerName]) {
                customerMap[customerName] = {
                    name: customerName,
                    totalOrders: 0,
                    totalAmount: 0
                };
            }
            customerMap[customerName].totalOrders++;
            customerMap[customerName].totalAmount += Number(order.total) || 0;

            // Process product statistics
            const aggregatedProducts = {};
            order.OrderItems.forEach(item => {
                const productName = item.Product.name;
                const productSatuan = item.satuan;

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

            // Create products array for each order
            order.dataValues.products = Object.keys(aggregatedProducts).map(name => ({
                name,
                quantity: aggregatedProducts[name].quantity,
                satuan: aggregatedProducts[name].satuan
            }));
        });

        // Get top 5 customers and products from ALL orders
        const topCustomers = Object.values(customerMap)
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, 5);

        const aggregatedProducts = Object.keys(productMap)
            .map(name => ({
                name,
                quantity: productMap[name].quantity,
                satuan: productMap[name].satuan
            }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);

        // Process orders for table display
        const processedOrders = orders.map(order => {
            const aggregatedProducts = {};
            order.OrderItems.forEach(item => {
                const productName = item.Product.name;
                const productSatuan = item.satuan;

                if (aggregatedProducts[productName]) {
                    aggregatedProducts[productName].quantity += item.quantity;
                } else {
                    aggregatedProducts[productName] = {
                        quantity: item.quantity,
                        satuan: productSatuan
                    };
                }
            });

            return {
                ...order.toJSON(),
                products: Object.keys(aggregatedProducts).map(name => ({
                    name,
                    quantity: aggregatedProducts[name].quantity,
                    satuan: aggregatedProducts[name].satuan
                }))
            };
        });

        // Render with active orders for table, but ALL orders data for chart and top customers
        res.render('dashboards/marketing', { 
            orders: processedOrders, // Active orders for table
            aggregatedProducts, // From all orders
            topCustomers, // From all orders
            allOrders, // Pass all orders for customer stats
            userRole: req.user.role,
            path: '/dashboard/marketing'
        });
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

        // Fetch rework items that need raw materials
        const reworkItems = await ComplainItem.findAll({
            where: {
                status: 'Formula Requested'
            },
            include: [{
                model: Complain,
                include: ['Order']
            }]
        });

        // User role
        const userRole = req.user.role;

        // Render the R&D dashboard with all the data
        res.render('dashboards/rd', {
            orders,
            formulaRequests,
            tdsmsdsRequests,
            reworkItems,
            userRole,
            path: '/dashboard/rd'
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
        // Validate order exists and get related data
        const order = await Order.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    include: [Product, Packaging]
                }
            ]
        });

        if (!order) {
            req.flash('error', 'Order not found');
            return res.redirect('/dashboard/ppic');
        }

        // Check if order is already approved
        if (order.status === 'Approved') {
            req.flash('error', 'Order has already been approved');
            return res.redirect('/dashboard/ppic');
        }

        // Validate stock availability
        let allProductsInStock = true;
        const outOfStockProducts = [];
        const outOfStockPackagings = [];

        // Check product and packaging stock availability
        for (const orderItem of order.OrderItems) {
            const product = await Product.findByPk(orderItem.productId);
            const packaging = await Packaging.findByPk(orderItem.packagingId);

            if (!product) {
                req.flash('error', `Product not found for order item`);
                return res.redirect('/dashboard/ppic');
            }

            if (!packaging) {
                req.flash('error', `Packaging not found for order item`);
                return res.redirect('/dashboard/ppic');
            }

            let requiredQuantity = orderItem.quantity;
            if (orderItem.satuan === 'L') {
                if (!product.density) {
                    req.flash('error', `Product ${product.name} has no density value defined`);
                    return res.redirect('/dashboard/ppic');
                }
                requiredQuantity *= product.density;
            }

            // Convert to KG for stock comparison if the order is in L
            const stockRequiredQuantity = orderItem.satuan === 'L' ? 
                orderItem.quantity * product.density : 
                orderItem.quantity;

            // Check product stock (stock is always in KG)
            if (product.stock < stockRequiredQuantity) {
                allProductsInStock = false;
                outOfStockProducts.push({
                    name: product.name,
                    required: orderItem.quantity,
                    available: orderItem.satuan === 'L' ? 
                        (product.stock / product.density).toFixed(2) : 
                        product.stock,
                    unit: orderItem.satuan
                });
            }

            // Check packaging stock
            if (packaging.stock < orderItem.unit) {
                allProductsInStock = false;
                outOfStockPackagings.push({
                    name: packaging.name,
                    required: orderItem.unit,
                    available: packaging.stock,
                    unit: 'pcs'
                });
            }
        }

        if (!allProductsInStock) {
            let errorMessage = 'Insufficient stock:\n';
            
            if (outOfStockProducts.length > 0) {
                errorMessage += '\nProducts out of stock:\n';
                outOfStockProducts.forEach(product => {
                    errorMessage += `- ${product.name}: Need ${product.required} ${product.unit}, Available ${product.available} ${product.unit}\n`;
                });
            }
            
            if (outOfStockPackagings.length > 0) {
                errorMessage += '\nPackaging out of stock:\n';
                outOfStockPackagings.forEach(packaging => {
                    errorMessage += `- ${packaging.name}: Need ${packaging.required} ${packaging.unit}, Available ${packaging.available} ${packaging.unit}\n`;
                });
            }

            req.flash('error', errorMessage);
            return res.redirect('/dashboard/ppic');
        }

        // Begin transaction for stock updates
        const t = await sequelize.transaction();

        try {
            // Update stocks and order status within transaction
            for (const orderItem of order.OrderItems) {
                const product = await Product.findByPk(orderItem.productId, { transaction: t });
                const packaging = await Packaging.findByPk(orderItem.packagingId, { transaction: t });

                // Convert to KG for stock update if the order is in L
                const stockUpdateQuantity = orderItem.satuan === 'L' ? 
                    orderItem.quantity * product.density : 
                    orderItem.quantity;

                // Update product stock (stock is always in KG)
                await Product.update(
                    { stock: product.stock - stockUpdateQuantity },
                    { where: { id: product.id }, transaction: t }
                );

                // Update packaging stock
                await Packaging.update(
                    { stock: packaging.stock - orderItem.unit },
                    { where: { id: packaging.id }, transaction: t }
                );
            }

            // Update order status
            await Order.update(
                { status: 'Approved' },
                { where: { id: order.id }, transaction: t }
            );

            // Commit transaction
            await t.commit();

            req.flash('success', 'Order has been approved successfully');
            res.redirect('/dashboard/ppic');
        } catch (error) {
            // Rollback transaction on error
            await t.rollback();
            console.error('Transaction error:', error);
            req.flash('error', 'An error occurred while approving the order. Please try again.');
            res.redirect('/dashboard/ppic');
        }
    } catch (error) {
        console.error('Error approving order:', error);
        req.flash('error', 'An error occurred while processing your request. Please try again.');
        res.redirect('/dashboard/ppic');
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
                            attributes: ['name', 'stock', 'formula', 'density']
                        },
                        {
                            model: Packaging,
                            attributes: ['name', 'stock']
                        }
                    ]
                }
            ]
        });

        if (!order) {
            return res.status(404).send({ error: 'Order not found' });
        }

        // Track quantities for both products and packaging
        const productQuantities = {};
        const packagingQuantities = {};
        const outOfStockProducts = [];
        const outOfStockPackaging = [];
        const inStockProducts = [];
        const inStockPackaging = [];

        // Aggregate quantities by product name and packaging
        for (const item of order.OrderItems) {
            // Handle product quantities
            if (!productQuantities[item.Product.name]) {
                productQuantities[item.Product.name] = { 
                    quantity: 0, 
                    stock: item.Product.stock,
                    satuan: item.satuan,
                    density: item.Product.density || 1
                };
            }
            const quantityInKg = item.satuan === 'L' ? 
                item.quantity * (item.Product.density || 1) : 
                item.quantity;
            productQuantities[item.Product.name].quantity += quantityInKg;

            // Handle packaging quantities
            if (!packagingQuantities[item.Packaging.name]) {
                packagingQuantities[item.Packaging.name] = {
                    quantity: 0,
                    stock: item.Packaging.stock
                };
            }
            packagingQuantities[item.Packaging.name].quantity += item.unit;
        }

        // Check product stock
        for (const [productName, { quantity, stock }] of Object.entries(productQuantities)) {
            if (stock < quantity) {
                outOfStockProducts.push({
                    name: productName,
                    needed: quantity,
                    available: stock,
                    satuan: 'KG'
                });
            } else {
                inStockProducts.push({
                    name: productName,
                    available: stock,
                    satuan: 'KG'
                });
            }
        }

        // Check packaging stock
        for (const [packagingName, { quantity, stock }] of Object.entries(packagingQuantities)) {
            if (stock < quantity) {
                outOfStockPackaging.push({
                    name: packagingName,
                    needed: quantity,
                    available: stock,
                    satuan: 'PCS'
                });
            } else {
                inStockPackaging.push({
                    name: packagingName,
                    available: stock,
                    satuan: 'PCS'
                });
            }
        }

        if (outOfStockProducts.length > 0 || outOfStockPackaging.length > 0) {
            return res.send({
                error: 'Some items are out of stock',
                outOfStockProducts,
                outOfStockPackaging,
                inStockProducts,
                inStockPackaging
            });
        } else {
            return res.send({
                message: 'All items are in stock',
                inStockProducts,
                inStockPackaging
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

exports.handlePPICRework = async (req, res) => {
    try {
        const { complainItemId } = req.body;

        await ComplainItem.update(
            { status: 'In Production' },
            { where: { id: complainItemId } }
        );

        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error updating complain item status:', error);
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
                status: ['Approved', 'Paid']
            },
            include: [
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [{
                        model: Product,
                        attributes: ['name']
                    }]
                },
                {
                    model: Customer,
                    attributes: ['name']
                }
            ],
            order: [['id', 'DESC']]
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
        const packagingRequestVendors = await PackagingRequestVendor.findAll({
            where: {
                status: ['Approved','Pending','Paid']
            },
            include: [
                { 
                    model: PackagingRequest,
                    include: [{ model: Packaging }]
                },
                { model: Vendor }
            ]
        });

        const userRole = req.user.role;
        res.render('dashboards/finance', { 
            orders, 
            rawMaterialRequestsVendors,
            packagingRequestVendors,
            userRole,
            path: '/dashboard/finance'
        });
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
                            attributes: ['name', 'price', 'density']
                        },
                        {
                            model: Packaging,
                            attributes: ['name', 'volume', 'price']
                        }
                    ]
                },
                {
                    model: RawMaterialRequest,
                    include: [{
                        model: RawMaterialRequestVendor,
                        attributes: ['id', 'status']
                    }]
                }
            ],
            attributes: {
                include: [
                    'pallet',
                    'sticker',
                    'wrap',
                    'handling',
                    'logistic',
                    'triplek',
                    'peti',
                    'kabelties'
                ]
            }
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
                    unitPrice: item.satuan === 'L' ? 
                        (item.Product.price * (item.Product.density || 1)) : 
                        item.Product.price,
                    satuan: item.satuan,
                    totalQuantity: 0,
                    totalPrice: 0,
                    packagingDetails: []
                };
            }

            groupedItems[key].totalQuantity += item.quantity;
            const unitPrice = item.satuan === 'L' ? 
                (item.Product.price * (item.Product.density || 1)) : 
                item.Product.price;
            const packagingPrice = item.Packaging.price || 0;
            
            groupedItems[key].totalPrice += (unitPrice * item.quantity) + (packagingPrice * item.unit);
            if (!groupedItems[key].packagingTotal) groupedItems[key].packagingTotal = 0;
            groupedItems[key].packagingTotal += packagingPrice * item.unit;

            // Add packaging details
            groupedItems[key].packagingDetails.push({
                packagingName: item.Packaging.name,
                volume: item.Packaging.volume,
                unit: item.unit
            });
        });

        // Get all consumables with their fees
        const consumables = await Consumable.findAll({
            attributes: ['name', 'fee']
        });

        // Create a map of consumable names to fees
        const consumableFees = {};
        let consumablesTotal = 0;

        consumables.forEach(consumable => {
            const key = consumable.name.toLowerCase().replace(/ /g, '');
            consumableFees[key] = consumable.fee;
            
            // Add to total if this consumable is used in the order
            if (order[key]) {
                consumablesTotal += consumable.fee;
            }
        });

        res.render('orders/orderDetails', { 
            order, 
            groupedItems: Object.values(groupedItems),
            consumableFees,
            consumablesTotal,
            userRole: req.user.role,
            path: '/orders/details'
        });
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

        const groupedItems = {};
        let totalOrderAmount = 0;

        // Group items by product and accumulate totals
        order.OrderItems.forEach(item => {
            const key = item.Product.name;
            
            // Calculate unit price based on satuan (L or KG)
            const unitPrice = item.satuan === 'L' ? 
                (item.Product.price * (item.Product.density || 1)) : 
                item.Product.price;
            
            // Calculate line total including packaging
            const lineTotal = item.total; // Use the total from orderItem

            if (!groupedItems[key]) {
                groupedItems[key] = {
                    quantity: item.quantity,
                    total: lineTotal,
                    price: unitPrice,
                    satuan: item.satuan,
                    description: `${item.Packaging.name} (${item.Packaging.volume}L) × ${item.unit}`,
                    packagingDetails: []
                };
            } else {
                groupedItems[key].quantity += item.quantity;
                groupedItems[key].total += lineTotal;
                groupedItems[key].description += `\n${item.Packaging.name} (${item.Packaging.volume}L) × ${item.unit}`;
            }

            totalOrderAmount += lineTotal;
        });

        // Generate PDF invoice
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        res.setHeader('Content-type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.sonumber}.pdf`);

        doc.pipe(res);

        // Add the company logo
        doc.image('public/images/logomib.png', 50, 45, { width: 50 });

        // Company Information
        doc.fontSize(24).font('Helvetica-Bold').text('MIB Chemicals', 110, 50);
        doc.fontSize(10).font('Helvetica').text('Jalan Cisauk Raya', 110, 80);
        doc.text('Tangerang, Cisauk, 15344', 110, 95);
        doc.text('Phone: 083814794726', 110, 110);
        doc.text('Email: info@mibchemicals.com', 110, 125);

        // Invoice Title
        doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', 50, 170);

        // Draw info box
        doc.rect(50, 200, 500, 100).stroke();
        doc.fontSize(10).font('Helvetica');

        // Left column
        doc.text('SO Number:', 60, 210);
        doc.font('Helvetica-Bold').text(order.sonumber, 140, 210);
        
        doc.font('Helvetica').text('Invoice Date:', 60, 230);
        doc.font('Helvetica-Bold').text(new Date().toLocaleDateString('id-ID'), 140, 230);
        
        doc.font('Helvetica').text('Payment Terms:', 60, 250);
        doc.font('Helvetica-Bold').text(order.paymentType || 'N/A', 140, 250);
        
        doc.font('Helvetica').text('Tax:', 60, 270);
        doc.font('Helvetica-Bold').text(order.tax || 'N/A', 140, 270);

        // Right column
        doc.font('Helvetica').text('Customer:', 300, 210);
        doc.font('Helvetica-Bold').text(order.Customer.name, 380, 210);
        
        doc.font('Helvetica').text('Address:', 300, 230);
        doc.font('Helvetica-Bold').text(order.Customer.alamat, 380, 230, { width: 160 });
        
        doc.font('Helvetica').text('Phone:', 300, 270);
        doc.font('Helvetica-Bold').text(order.Customer.phone, 380, 270);

        // Table headers
        const tableTop = 330;
        doc.rect(50, tableTop, 500, 30).fillAndStroke('#E4E4E4', '#000000');
        
        doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold')
            .text('Item', 60, tableTop + 10)
            .text('Description', 180, tableTop + 10)
            .text('Unit Cost', 300, tableTop + 10)
            .text('Quantity', 380, tableTop + 10)
            .text('Line Total', 460, tableTop + 10);

        let y = tableTop + 40;

        // Table rows
        doc.font('Helvetica');
        for (const [productName, item] of Object.entries(groupedItems)) {
            const rowStartY = y;
            
            // Product name
            doc.text(productName, 60, y, { width: 110 });
            
            // Description
            doc.text(item.description, 180, y, { width: 110 });
            
            // Unit cost
            doc.text(`Rp${item.price.toLocaleString('id-ID')}`, 300, y, { width: 70 });
            
            // Quantity with unit from satuan
            doc.text(`${item.quantity} ${item.satuan}`, 380, y, { width: 70 });
            
            // Line total with proper alignment
            doc.text(`Rp${item.total.toLocaleString('id-ID')}`, 460, y, { 
                width: 80,
                align: 'right'
            });

            // Calculate row height based on content
            const descriptionHeight = doc.heightOfString(item.description, { width: 110 });
            const productHeight = doc.heightOfString(productName, { width: 110 });
            const rowHeight = Math.max(descriptionHeight, productHeight, 30);

            // Draw row border
            doc.rect(50, rowStartY - 5, 500, rowHeight + 10).stroke();

            // Move to next row
            y += rowHeight + 15;
        }

        // Draw final border line
        doc.moveTo(50, y - 5).lineTo(550, y - 5).stroke();

        // Add consumables section if any are used
        const consumableFlags = ['pallet', 'sticker', 'wrap', 'handling', 'logistic', 'triplek', 'peti', 'kabelties'];
        const usedConsumables = consumableFlags.filter(flag => order[flag] === true || order[flag] === '1');
        
        if (usedConsumables.length > 0) {
            y += 20;
            
            // Section header
            doc.font('Helvetica-Bold')
               .text('Additional Services', 50, y, { underline: true });
            y += 25;
            
            // Get consumable fees
            const consumables = await Consumable.findAll({
                attributes: ['name', 'fee']
            });
            
            // Create map of normalized names to original names and fees
            const consumableFeeMap = new Map(
                consumables.map(c => [
                    c.name.toLowerCase().replace(/ /g, ''),
                    { name: c.name, fee: c.fee }
                ])
            );
            
            // Draw consumables table
            doc.rect(50, y, 500, 30).fillAndStroke('#E4E4E4', '#000000');
            doc.fillColor('#000000')
               .text('Service', 60, y + 10)
               .text('Fee', 460, y + 10, {
                   width: 80,
                   align: 'right'
               });
            y += 30;
            
            // List each consumable
            for (const consumable of usedConsumables) {
                const consumableInfo = consumableFeeMap.get(consumable);
                if (consumableInfo) {
                    doc.font('Helvetica')
                       .rect(50, y, 500, 25).stroke()
                       .text(consumableInfo.name, 60, y + 7)
                       .text(`Rp${consumableInfo.fee.toLocaleString('id-ID')}`, 460, y + 7, {
                           width: 80,
                           align: 'right'
                       });
                    y += 25;
                }
            }
            
            y += 10;
        }

        // Add consumables total to the order amount
        const consumableFees = await Consumable.findAll({
            attributes: ['name', 'fee']
        });
        
        const consumableFeeMap = new Map(
            consumableFees.map(c => [
                c.name.toLowerCase().replace(/ /g, ''),
                { name: c.name, fee: c.fee }
            ])
        );
        
        for (const consumable of usedConsumables) {
            const consumableInfo = consumableFeeMap.get(consumable);
            if (consumableInfo) {
                totalOrderAmount += consumableInfo.fee;
            }
        }

        // Summary box
        y += 20;
        
        // Calculate tax and total
        const taxRate = order.tax === 'PPN 11%' ? 0.11 : 0;
        const taxAmount = Math.round(totalOrderAmount * taxRate);
        const grandTotal = totalOrderAmount + taxAmount;

        // Draw summary box
        doc.rect(300, y, 250, 120).stroke();
        
        // Format currency numbers
        const formattedSubtotal = `Rp${totalOrderAmount.toLocaleString('id-ID')}`;
        const formattedTax = `Rp${taxAmount.toLocaleString('id-ID')}`;
        const formattedTotal = `Rp${grandTotal.toLocaleString('id-ID')}`;
        
        // Summary content with proper spacing and alignment
        const summaryX = 320;
        const valueX = 520;
        const summaryWidth = 210;  // Width of the summary section
        doc.font('Helvetica-Bold');
        
        // Subtotal
        doc.text('Subtotal:', summaryX, y + 20);
        doc.text(formattedSubtotal, summaryX, y + 20, { 
            width: summaryWidth,
            align: 'right'
        });
        
        // Tax
        doc.text(`Tax (${order.tax}):`, summaryX, y + 50);
        doc.text(formattedTax, summaryX, y + 50, { 
            width: summaryWidth,
            align: 'right'
        });
        
        // Separator line
        doc.moveTo(320, y + 80).lineTo(530, y + 80).stroke();
        
        // Total Amount (larger font)
        doc.fontSize(12);
        doc.text('Total Amount:', summaryX, y + 90);
        doc.text(formattedTotal, summaryX, y + 90, { 
            width: summaryWidth,
            align: 'right'
        });
        doc.fontSize(10);

        // Footer
        doc.fontSize(10).font('Helvetica')
           .text('Payment is due according to the agreed payment terms. Thank you for your business.', 50, y + 130, { 
               align: 'center'
           });

        // Signature
        y += 180;
        doc.font('Helvetica-Bold').text('Authorized Signature', 350, y);
        doc.moveTo(350, y + 40).lineTo(500, y + 40).stroke();

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

exports.updateSONumber = async (req, res) => {
    const { id } = req.params;
    const { sonumber } = req.body;

    try {
        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).send({ error: 'Order not found' });
        }

        order.sonumber = sonumber;
        await order.save();

        res.redirect('/dashboard/marketing');
    } catch (error) {
        console.error('Error updating PO number:', error);
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
            attributes: ['id', 'customerName', 'createdAt', 'sonumber', 'paymentType', 'paymentDueDate']
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
            path: '/orders/delivered'
        });
    } catch (error) {
        console.error('Error fetching delivered orders:', error);
        res.status(500).send('Internal Server Error');
    }
};
