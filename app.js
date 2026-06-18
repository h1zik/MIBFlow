require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const localsMiddleware = require('./middleware/locals');
const { getDashboardForRole } = require('./utils/roleRoutes');
const yubiKeyRoutes = require('./routes/yubiKeyRoutes');
const yubiKeyManagementRoutes = require('./routes/yubiKeyManagementRoutes');
const webAuthnRoutes = require('./routes/webAuthnRoutes');
const authRoutes = require('./routes/authRoutes');
const qrCodeRoutes = require('./routes/qrCodeRoutes');
const { yubiKeyAuth } = require('./middleware/yubiKeyAuth');
const orderRoutes = require('./routes/orderRoutes');
const productRoutes = require('./routes/productRoutes');
const productCustomerRoutes = require('./routes/productCustomerRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const rdRoutes = require('./routes/rdRoutes');
const productionRequestRoutes = require('./routes/productionRequestRoutes');
const rawMaterialRequestRoutes = require('./routes/rawMaterialRequestRoutes');
const rawMaterialRoutes = require('./routes/rawMaterialRoutes');
const qcRoutes = require('./routes/qcRoutes');
const financeRoutes = require('./routes/financeRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const productionRoutes = require('./routes/productionRoutes');
const tankRoutes = require('./routes/tankRoutes');
const productWarehouseRoutes = require('./routes/productWarehouseRoutes');
const packagingRoutes = require('./routes/packagingRoutes');
const packagingRequestRoutes = require('./routes/packagingRequestRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const customerRoutes = require('./routes/customerRoutes');
const formulaRequestRoutes = require('./routes/formulaRequestRoutes');
const overheadRoutes = require('./routes/overheadRoutes');
const tdsmsdsRequestRoutes = require('./routes/tdsmsdsRequestRoutes');
const complainRoutes = require('./routes/complainRoutes');
const productQuarantineRoutes = require('./routes/productQuarantineRoutes');
const rawMaterialQuarantineRoutes = require('./routes/rawMaterialQuarantineRoutes');
const chatRoutes = require('./routes/chatRoutes');
const sequelize = require('./config/database');

// Import models to ensure associations are loaded
const { Production, ProductionRawMaterial } = require('./models/production');
const RawMaterial = require('./models/rawMaterial');
const Vendor = require('./models/vendor');
const RawMaterialRequest = require('./models/rawMaterialRequest');
const Customer = require('./models/customer');
const OrderItem = require('./models/orderItem');
const Product = require('./models/product');
const Order = require('./models/order');
const ProductionTanks = require('./models/productionTank');
const Packaging = require('./models/packaging');
const PackagingRequest = require('./models/packagingRequest');
const ProductFormula = require('./models/productFormula');
const RawMaterialVendor = require('./models/rawMaterialVendor');
const RawMaterialRequestVendor = require('./models/rawMaterialRequestVendor');
const PackagingVendor = require('./models/packagingVendor');
const PackagingRequestVendor = require('./models/packagingRequestVendor');
const TdsMsdsRequest = require('./models/tdsmsdsRequest');
const Consumable = require('./models/consumable');
const Complain = require('./models/complain');
const ComplainItem = require('./models/complainItem');
const ComplainItemRawMaterial = require('./models/complainItemRawMaterial');
const ComplainRework = require('./models/complainRework');
const RawMaterialReturnNoReturn = require('./models/rawMaterialReturnNoReturn');
const PackagingReturnNoReturn = require('./models/packagingReturnNoReturn');
const ProductionRequestPackaging = require('./models/productionRequestPackaging');
const Inbound = require('./models/inbound');
const Outbound = require('./models/outbound');
const ChatMessage = require('./models/chatMessage');

// Load associations after all models are defined
require('./models/associations');

const app = express();
const server = require('http').createServer(app);
const PORT = process.env.PORT || 3000;

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"]
        }
    }
}));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 8 * 60 * 60 * 1000 // 8 hours
    }
}));

// Flash messages middleware
const flash = require('express-flash');
app.use(flash());

// Parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.SESSION_SECRET || 'your-secret-key'));

app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'nfc=*');
    next();
});

app.use(localsMiddleware);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));
app.use('/socket.io', express.static(path.join(__dirname, 'node_modules/socket.io/client-dist')));

// SSE endpoint for notifications
app.get('/notifications', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send a ping every 30 seconds to keep the connection alive
    const pingInterval = setInterval(() => {
        res.write('event: ping\ndata: ping\n\n');
    }, 30000);

    // Store the response object to send notifications
    const clientId = Date.now();
    app.locals.sseClients = app.locals.sseClients || new Map();
    app.locals.sseClients.set(clientId, res);

    // Clean up on client disconnect
    req.on('close', () => {
        clearInterval(pingInterval);
        app.locals.sseClients.delete(clientId);
    });
});

// Helper function to send notifications to all connected clients
app.locals.sendNotification = (data) => {
    if (app.locals.sseClients) {
        app.locals.sseClients.forEach(client => {
            client.write(`data: ${JSON.stringify(data)}\n\n`);
        });
    }
};

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Rate limit login attempts
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many login attempts. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/auth/login', loginLimiter);

// Root redirect
app.get('/', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.redirect('/auth/login');
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return res.redirect(getDashboardForRole(decoded.role));
    } catch {
        res.clearCookie('token');
        return res.redirect('/auth/login');
    }
});

// Auth routes
app.use('/auth', authRoutes);

// Authentication routes
app.use('/yubikey-verify', yubiKeyRoutes);
app.use('/yubikey-management', yubiKeyManagementRoutes);
app.use('/auth', webAuthnRoutes); // WebAuthn endpoints
app.use('/qr', qrCodeRoutes); // QR code endpoints

// Protected routes
app.use('/orders', orderRoutes);
app.use('/products', productRoutes);
app.use('/productCustomer', productCustomerRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/rd', rdRoutes);
app.use('/ppic', productionRequestRoutes);
app.use('/production', productionRequestRoutes);
app.use('/rawMaterial', rawMaterialRequestRoutes);
app.use('/rawMaterials', rawMaterialRoutes);
app.use('/qc', qcRoutes);
app.use('/tank', tankRoutes);
app.use('/', financeRoutes);
app.use('/', vendorRoutes);
app.use('/', productionRoutes);
app.use('/productWarehouse', productWarehouseRoutes);
app.use('/packaging', packagingRoutes);
app.use('/packaging-request', packagingRequestRoutes);
app.use('/purchase', purchaseRoutes);
app.use('/customers', customerRoutes);
app.use('/formula-requests', formulaRequestRoutes);
app.use('/overhead', overheadRoutes);
app.use('/tdsmsdsRequest', tdsmsdsRequestRoutes);
app.use('/complain', complainRoutes);
app.use('/product-quarantine', productQuarantineRoutes);
app.use('/raw-material-quarantine', rawMaterialQuarantineRoutes);
app.use('/api/chat', chatRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).render('errors/404');
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(500).json({ error: 'Internal server error' });
    }
    res.status(500).send('Something went wrong. Please try again.');
});

sequelize.authenticate()
    .then(() => {
        console.log('Database connected');
        if (process.env.NODE_ENV !== 'production') {
            return sequelize.sync();
        }
    })
    .then(() => {
        server.listen(PORT, () => {
            console.log(`MIB Flow running on http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('Database connection failed:', err);
        process.exit(1);
    });

module.exports = app;
