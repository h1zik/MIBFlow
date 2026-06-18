const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./user');

const ChatMessage = sequelize.define('ChatMessage', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    senderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    receiverId: {
        type: DataTypes.INTEGER,
        allowNull: true, // null for system messages or broadcast messages
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    messageType: {
        type: DataTypes.ENUM('user', 'system'),
        defaultValue: 'user'
    }
}, {
    timestamps: true, // This will add createdAt and updatedAt fields
    tableName: 'chat_messages'
});

// Define associations
ChatMessage.belongsTo(User, { as: 'sender', foreignKey: 'senderId' });
ChatMessage.belongsTo(User, { as: 'receiver', foreignKey: 'receiverId' });

module.exports = ChatMessage;
