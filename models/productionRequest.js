const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Order = require('../models/order');
const ProductionRequestRawMaterial = require('../models/productionRequestRawMaterial');
const { Production }= require('../models/production');

const ProductionRequest = sequelize.define('ProductionRequest', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    product: {
        type: DataTypes.STRING,
        allowNull: false
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    formula: {
        type: DataTypes.STRING, // This will store the path to the PDF file
        allowNull: false
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
    stockUpdated: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    orderId: {  
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'Orders', // This is the name of the Orders table
            key: 'id'
        }
    },
    prodreqnumber: {
        type: DataTypes.STRING,
        allowNull: true
    }
});

module.exports = ProductionRequest;
