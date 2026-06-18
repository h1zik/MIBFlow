const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const PackagingRequest = require('./packagingRequest');
const Vendor = require('./vendor');

const PackagingReturnNoReturn = sequelize.define('PackagingReturnNoReturn', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    packagingRequestId: {
        type: DataTypes.INTEGER,
        references: {
            model: PackagingRequest,
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
        type: DataTypes.INTEGER,
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
        allowNull: true,
        defaultValue: 'Pending'
    },
    qcComment: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    rejectQuantity: {
        type: DataTypes.INTEGER,
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

PackagingReturnNoReturn.belongsTo(PackagingRequest, { foreignKey: 'packagingRequestId' });
PackagingRequest.hasMany(PackagingReturnNoReturn, { foreignKey: 'packagingRequestId' });
PackagingReturnNoReturn.belongsTo(Vendor, { foreignKey: 'vendorId' });
Vendor.hasMany(PackagingReturnNoReturn, { foreignKey: 'vendorId' });

module.exports = PackagingReturnNoReturn;
