const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const RawMaterialRequest = require('./rawMaterialRequest');
const Vendor = require('./vendor');

const RawMaterialRequestVendor = sequelize.define('RawMaterialRequestVendor', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    rawMaterialRequestId: {
        type: DataTypes.INTEGER,
        references: {
            model: RawMaterialRequest,
            key: 'id'
        },
        allowNull: false
    },
    vendorId: {
        type: DataTypes.INTEGER,
        references: {
            model: Vendor,
            key: 'id'
        },
        allowNull: false
    },
    splitQuantity: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    tax: {
        type: DataTypes.STRING,
        allowNull: true
    },
    paymentType: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Pending'  // Example default value
    },
    paymentDueDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    qcStatus: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    qcComment: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    rejectQuantity: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0
    },
    rejectComment: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    ponumber: {
        type: DataTypes.STRING,
        allowNull: true
    },
    batchNumber: {
        type: DataTypes.STRING,
        allowNull: true
    },
    expiredDate: {
        type: DataTypes.DATE,
        allowNull: true
    }
});

RawMaterialRequestVendor.belongsTo(RawMaterialRequest, { foreignKey: 'rawMaterialRequestId' });
RawMaterialRequest.hasMany(RawMaterialRequestVendor, { foreignKey: 'rawMaterialRequestId', onDelete: 'CASCADE' });
RawMaterialRequestVendor.belongsTo(Vendor, { foreignKey: 'vendorId' });
Vendor.hasMany(RawMaterialRequestVendor, { foreignKey: 'vendorId' });

module.exports = RawMaterialRequestVendor;
