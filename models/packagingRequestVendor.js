const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const PackagingRequest = require('./packagingRequest');
const Vendor = require('./vendor');

const PackagingRequestVendor = sequelize.define('PackagingRequestVendor', {
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
    paymentDueDate: {
        type: DataTypes.DATE,
        allowNull: true
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

PackagingRequestVendor.belongsTo(PackagingRequest, { foreignKey: 'packagingRequestId' });
PackagingRequest.hasMany(PackagingRequestVendor, { foreignKey: 'packagingRequestId', onDelete: 'CASCADE' });
PackagingRequestVendor.belongsTo(Vendor, { foreignKey: 'vendorId' });
Vendor.hasMany(PackagingRequestVendor, { foreignKey: 'vendorId' });

module.exports = PackagingRequestVendor;
