// models/packagingVendor.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Packaging = require('./packaging');
const Vendor = require('./vendor');

const PackagingVendor = sequelize.define('packagingvendor', {
    PackagingId: {
        type: DataTypes.INTEGER,
        field: 'PackagingId',
        references: {
            model: Packaging,
            key: 'id'
        }
    },
    VendorId: {
        type: DataTypes.INTEGER,
        field: 'VendorId',
        references: {
            model: Vendor,
            key: 'id'
        }
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
    }
}, {
    timestamps: true,
    tableName: 'packagingvendor',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
});

Packaging.belongsToMany(Vendor, { 
    through: PackagingVendor, 
    foreignKey: 'PackagingId'
});
Vendor.belongsToMany(Packaging, { 
    through: PackagingVendor, 
    foreignKey: 'VendorId'
});

module.exports = PackagingVendor;
