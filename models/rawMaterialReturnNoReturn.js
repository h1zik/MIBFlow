const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const RawMaterialRequest = require('./rawMaterialRequest');
const Vendor = require('./vendor');

const RawMaterialReturnNoReturn = sequelize.define('RawMaterialReturnNoReturn', {
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
        defaultValue: 'Pending'
    },
    qcStatus: {
        type: DataTypes.STRING,
        allowNull: true
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
    }
});

RawMaterialReturnNoReturn.belongsTo(RawMaterialRequest, { foreignKey: 'rawMaterialRequestId' });
RawMaterialRequest.hasMany(RawMaterialReturnNoReturn, { foreignKey: 'rawMaterialRequestId' });
RawMaterialReturnNoReturn.belongsTo(Vendor, { foreignKey: 'vendorId' });
Vendor.hasMany(RawMaterialReturnNoReturn, { foreignKey: 'vendorId' });

module.exports = RawMaterialReturnNoReturn;
