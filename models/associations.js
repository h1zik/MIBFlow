const Order = require('./order');
const Complain = require('./complain');
const ComplainItem = require('./complainItem');
const ComplainItemRawMaterial = require('./complainItemRawMaterial');
const ComplainTank = require('./complainTank');
const ComplainRework = require('./complainRework');
const ProductCheck = require('./productCheck');
const PackagingRequest = require('./packagingRequest');
const PackagingRequestVendor = require('./packagingRequestVendor');
const Vendor = require('./vendor');
const Packaging = require('./packaging');
const OrderItem = require('./orderItem');
const Product = require('./product');
const Customer = require('./customer');
const Production = require('./production').Production;
const ProductionRequest = require('./productionRequest');
const Tank = require('./tank');
const RawMaterial = require('./rawMaterial');
const ProductionRawMaterial = require('./production').ProductionRawMaterial;
const ProductionRequestRawMaterial = require('./productionRequestRawMaterial');
const ProductionRequestPackaging = require('./productionRequestPackaging');
const Outbound = require('./outbound');
const PackagingVendor = require('./packagingVendor');
const ProductCustomer = require('./productCustomer');

// Production associations
Production.hasMany(ProductionRawMaterial, { foreignKey: 'ProductionId' });
ProductionRawMaterial.belongsTo(Production, { foreignKey: 'ProductionId' });
RawMaterial.hasMany(ProductionRawMaterial, { foreignKey: 'RawMaterialId' });
ProductionRawMaterial.belongsTo(RawMaterial, { foreignKey: 'RawMaterialId' });
Production.belongsTo(Product, { foreignKey: 'productId' });
Production.belongsToMany(Tank, { through: 'ProductionTanks' });
Production.belongsTo(ProductionRequest, { foreignKey: 'productionRequestId' });

// ProductionRequest associations
ProductionRequest.belongsTo(Order, { foreignKey: 'orderId' });
ProductionRequest.hasMany(Production, { foreignKey: 'productionRequestId' });
ProductionRequest.hasMany(ProductionRequestRawMaterial, { foreignKey: 'productionRequestId' });
ProductionRequest.hasMany(ProductionRequestPackaging, { foreignKey: 'productionRequestId' });
ProductionRequestPackaging.belongsTo(ProductionRequest, { foreignKey: 'productionRequestId' });
Packaging.hasMany(ProductionRequestPackaging, { foreignKey: 'packagingId' });
ProductionRequestPackaging.belongsTo(Packaging, { foreignKey: 'packagingId' });

// PackagingRequest associations
PackagingRequest.belongsTo(Order, { foreignKey: 'orderId', onDelete: 'CASCADE' });
PackagingRequest.belongsTo(Packaging, { foreignKey: 'packagingId' });
PackagingRequest.hasMany(PackagingRequestVendor, { foreignKey: 'packagingRequestId', onDelete: 'CASCADE' });

// PackagingRequestVendor associations
PackagingRequestVendor.belongsTo(PackagingRequest, { foreignKey: 'packagingRequestId' });
PackagingRequestVendor.belongsTo(Vendor, { foreignKey: 'vendorId' });

// Order associations
Order.hasMany(PackagingRequest, { foreignKey: 'orderId', onDelete: 'CASCADE' });
Order.hasMany(OrderItem, { foreignKey: 'orderId', onDelete: 'CASCADE' });
Order.hasMany(ProductionRequest, { foreignKey: 'orderId' });
Order.belongsTo(Customer, { foreignKey: 'customerId', onDelete: 'CASCADE' });

// OrderItem associations
OrderItem.belongsTo(Order, { foreignKey: 'orderId', onDelete: 'CASCADE' });
OrderItem.belongsTo(Product, { foreignKey: 'productId', onDelete: 'CASCADE' });
OrderItem.belongsTo(Packaging, { foreignKey: 'packagingId', onDelete: 'CASCADE' });

// Packaging-Vendor many-to-many relationship
Packaging.belongsToMany(Vendor, { 
    through: PackagingVendor,
    foreignKey: 'PackagingId'
});
Vendor.belongsToMany(Packaging, { 
    through: PackagingVendor,
    foreignKey: 'VendorId'
});

// Direct associations for PackagingVendor
PackagingVendor.belongsTo(Packaging, { foreignKey: 'PackagingId' });
PackagingVendor.belongsTo(Vendor, { foreignKey: 'VendorId' });

// Outbound associations
Outbound.belongsTo(Packaging, { foreignKey: 'packagingId' });
Packaging.hasMany(Outbound, { foreignKey: 'packagingId' });

// Complain associations
Order.hasMany(Complain, { foreignKey: 'orderId' });
Complain.belongsTo(Order, { foreignKey: 'orderId' });
Complain.hasMany(ComplainItem, { foreignKey: 'complainId', onDelete: 'CASCADE' });
ComplainItem.belongsTo(Complain, { foreignKey: 'complainId' });
ComplainItem.belongsTo(Product, { foreignKey: 'productId' });

// Complain Item Raw Materials associations
ComplainItem.hasMany(ComplainItemRawMaterial, { foreignKey: 'complainItemId' });
ComplainItemRawMaterial.belongsTo(ComplainItem, { foreignKey: 'complainItemId' });

// ComplainTank associations
Complain.hasMany(ComplainTank, { foreignKey: 'complainId', as: 'ComplainTanks' });
ComplainTank.belongsTo(Complain, { foreignKey: 'complainId' });
Tank.hasMany(ComplainTank, { foreignKey: 'tankId' });
ComplainTank.belongsTo(Tank, { foreignKey: 'tankId' });

// ComplainRework associations
ComplainItem.hasMany(ComplainRework, { foreignKey: 'complainItemId' });
ComplainRework.belongsTo(ComplainItem, { foreignKey: 'complainItemId' });
ComplainRework.belongsToMany(Tank, { through: 'ComplainReworkTanks' });

// ProductCheck associations
Product.hasMany(ProductCheck, { foreignKey: 'productId' });
ProductCheck.belongsTo(Product, { foreignKey: 'productId' });

// Product-Packaging many-to-many relationship
Product.belongsToMany(Packaging, {
    through: 'ProductPackaging',
    foreignKey: 'productId'
});
Packaging.belongsToMany(Product, {
    through: 'ProductPackaging',
    foreignKey: 'packagingId'
});

// Product-Customer many-to-many relationship
Product.belongsToMany(Customer, { 
    through: ProductCustomer,
    foreignKey: 'ProductId'
});
Customer.belongsToMany(Product, { 
    through: ProductCustomer,
    foreignKey: 'CustomerId'
});

// Direct associations for ProductCustomer
ProductCustomer.belongsTo(Product, { foreignKey: 'ProductId' });
ProductCustomer.belongsTo(Customer, { foreignKey: 'CustomerId' });

module.exports = {
    ComplainItemRawMaterial,
    ProductCheck,
    Order,
    PackagingRequest,
    PackagingRequestVendor,
    Vendor,
    Packaging,
    OrderItem,
    Product,
    Customer,
    Production,
    ProductionRawMaterial,
    ProductionRequest,
    ProductionRequestRawMaterial,
    Complain,
    ComplainItem,
    ComplainTank,
    ComplainRework,
    ProductionRequestPackaging,
    Outbound,
    PackagingVendor,
    ProductCustomer
};
