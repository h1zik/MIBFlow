const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Balance = sequelize.define('Balance', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    price: {
        type: DataTypes.FLOAT,
        allowNull: true
    }
});

module.exports = Balance;
