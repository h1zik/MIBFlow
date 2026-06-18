const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Vendor = require('./vendor');


const RawMaterial = sequelize.define('RawMaterial', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    stock: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    price: {
        type: DataTypes.FLOAT,  // or DataTypes.DECIMAL if you need more precision
        allowNull: true
    },
    form: {
        type: DataTypes.STRING,  // 'Liquid', 'Solid', etc.
        allowNull: false
    },
    density: {
        type: DataTypes.FLOAT,
        allowNull: true  // Only applicable for liquids
    }
});

module.exports = RawMaterial;
