const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Consumable = sequelize.define('Consumable', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    fee: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0 // Default fee is 0
    }
});

module.exports = Consumable;
