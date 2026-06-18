const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Forklift = sequelize.define('Forklift', {
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

module.exports = Forklift;
