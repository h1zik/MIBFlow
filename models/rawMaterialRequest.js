const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Vendor = require('./vendor');
const Order = require('./order');
const RawMaterial = require('./rawMaterial'); // Import the RawMaterial model

const RawMaterialRequest = sequelize.define('RawMaterialRequest', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    orderId: {
        type: DataTypes.INTEGER,
        references: {
            model: Order, // Assuming you have an Order model
            key: 'id'
        },
        allowNull: true
    },
    rawMaterialId: {  // New column to associate with RawMaterial
        type: DataTypes.INTEGER,
        references: {
            model: RawMaterial,
            key: 'id'
        },
        allowNull: false  // Assuming this is a required field
    },
    materialName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    realQuantity: {
        type: DataTypes.FLOAT,  // This will store the actual quantity to be ordered
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Pending'
    },
    qcStatus: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Pending'
    },
    qcComment: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    ponumber: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isPaid: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
});

RawMaterialRequest.belongsTo(Vendor, { foreignKey: 'vendorId' });
RawMaterialRequest.belongsTo(Order, { foreignKey: 'orderId' });
Order.hasMany(RawMaterialRequest, { foreignKey: 'orderId', onDelete: 'CASCADE' }); // Add this line

RawMaterialRequest.belongsTo(RawMaterial, { foreignKey: 'rawMaterialId' });

module.exports = RawMaterialRequest;
