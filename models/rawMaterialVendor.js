// models/rawMaterialVendor.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const RawMaterial = require('./rawMaterial');
const Vendor = require('./vendor');

const RawMaterialVendor = sequelize.define('RawMaterialVendor', {
    rawMaterialId: {
        type: DataTypes.INTEGER,
        references: {
            model: RawMaterial,
            key: 'id'
        }
    },
    vendorId: {
        type: DataTypes.INTEGER,
        references: {
            model: Vendor,
            key: 'id'
        }
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        validate: {
            isDecimal: true,
            min: 0
        }
    }
}, {
    // Prevent Sequelize from adding duplicate columns
    timestamps: true,
    underscored: true
});

RawMaterial.belongsToMany(Vendor, { through: RawMaterialVendor, foreignKey: 'rawMaterialId' });
Vendor.belongsToMany(RawMaterial, { through: RawMaterialVendor, foreignKey: 'vendorId' });

module.exports = RawMaterialVendor;