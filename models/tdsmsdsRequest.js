const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Product = require('./product');

const TdsMsdsRequest = sequelize.define('TdsMsdsRequest', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Product,
            key: 'id',
        },
    },
    requestType: {
        type: DataTypes.ENUM('TDS', 'MSDS'),
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('Pending', 'Approved', 'Declined'),
        defaultValue: 'Pending',
    },
});

TdsMsdsRequest.belongsTo(Product, { foreignKey: 'productId', onDelete: 'CASCADE' });
Product.hasMany(TdsMsdsRequest, { foreignKey: 'productId', onDelete: 'CASCADE' });

module.exports = TdsMsdsRequest;
