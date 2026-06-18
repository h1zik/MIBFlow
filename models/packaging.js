const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Packaging = sequelize.define('Packaging', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    volume: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    stock: {
        type: DataTypes.INTEGER,  // Adding the stock column
        allowNull: false,
        defaultValue: 0  // Setting a default value of 0
    },
    price: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0  // Setting a default value of 0
    }
});

module.exports = Packaging;
