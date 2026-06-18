const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Tank = sequelize.define('Tank', {
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
    price: {
        type: DataTypes.FLOAT,
        allowNull: true
    }
});

module.exports = Tank;
