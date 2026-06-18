const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Labor = sequelize.define('Labor', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    position: {
        type: DataTypes.ENUM(
            'Marketing', 
            'PPIC', 
            'R&D', 
            'Finance', 
            'Purchase', 
            'Production', 
            'Raw Material Warehouse', 
            'QC', 
            'Product Warehouse', 
            'Others'
        ),
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('direct', 'indirect'),
        allowNull: false,
    },
    salary: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
});

module.exports = Labor;
