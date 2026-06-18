const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Equipment = sequelize.define('Equipment', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    cost: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    usefulLife: {
        type: DataTypes.INTEGER, // in months
        allowNull: false
    },
    hoursPerMonth: {
        type: DataTypes.FLOAT, // production hours per month
        allowNull: false
    }
});

module.exports = Equipment;