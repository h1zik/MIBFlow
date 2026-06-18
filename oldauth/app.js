require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const productRoutes = require('./routes/productRoutes');
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

// Load associations after all models are defined
require('./models/associations');

const app = express();

// Session configuration
app.use(session({
    secret: 'your-secret-key', // Replace with a secure key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // If you're using HTTPS, set secure: true
}));

// Flash messages middleware
const flash = require('express-flash');
app.use(flash());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Register routes
app.use('/auth', authRoutes);
app.use('/orders', orderRoutes);
app.use('/products', productRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/rd', rdRoutes);
app.use('/ppic', productionRequestRoutes);
app.use('/production', productionRequestRoutes);
app.use('/rawMaterial', rawMaterialRequestRoutes);
app.use('/rawMaterials', rawMaterialRoutes);
app.use('/qc', qcRoutes);
app.use('/', financeRoutes);
app.use('/', vendorRoutes);
app.use('/', productionRoutes);
app.use('/tank', tankRoutes);
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

sequelize.sync() // This will try to alter tables without dropping them
    .then(result => {
        console.log('Database connected');
        app.listen(3000, () => {
            console.log('Server is running on port 3000');
        });
    })
    .catch(err => {
        console.error('Database connection failed:', err);
    });

module.exports = app;
