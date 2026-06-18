const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Utilities = sequelize.define('Utilities', {
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
        allowNull: false
    }
});

module.exports = Utilities;
