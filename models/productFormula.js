const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Product = require('./product');
const RawMaterial = require('./rawMaterial');

const ProductFormula = sequelize.define('ProductFormula', {
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
    rawMaterialId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: RawMaterial,
            key: 'id',
        },
    },
    percentage: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
});

// Define relationships with cascading options
ProductFormula.belongsTo(Product, { foreignKey: 'productId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Product.hasMany(ProductFormula, { foreignKey: 'productId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

ProductFormula.belongsTo(RawMaterial, { foreignKey: 'rawMaterialId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
RawMaterial.hasMany(ProductFormula, { foreignKey: 'rawMaterialId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

module.exports = ProductFormula;
