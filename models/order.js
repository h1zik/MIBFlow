const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const OrderItem = require('./orderItem');

const Order = sequelize.define('Order', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    customerName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Pending'
    },
    paymentType: {
        type: DataTypes.STRING,
        allowNull: false
    },
    formula: {
        type: DataTypes.STRING, // This will store the path to the PDF file
        allowNull: true
    },
    printed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    po: {
        type: DataTypes.STRING, // This will store the path to the PDF file
        allowNull: false
    },
    sonumber: {
        type: DataTypes.STRING, // Sales Order number
        allowNull: false
    },
    total: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    pallet: {
        type: DataTypes.STRING,
        allowNull: false
    },
    sticker: {
        type: DataTypes.BOOLEAN, // Assuming it's a checklist (boolean)
        defaultValue: false,
    },
    wrap: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    handling: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    logistic: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    triplek: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    peti: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    kabelties: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    deadline: {
        type: DataTypes.DATE, // Date for the deadline
        allowNull: true, // Can be null if "No" is selected
    },
    paymentDueDate: {
        type: DataTypes.DATE,
        allowNull: true, // This will be null unless the payment type is TOP
    },
    tax: {  // Add this field for tax
        type: DataTypes.ENUM('PPN 11%', 'Non Pajak', 'PPh 23'),
        allowNull: false
    },
    isPaid: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
});

module.exports = Order;
