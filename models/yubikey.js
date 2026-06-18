const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Yubikey = sequelize.define('Yubikey', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    keyId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: 'First 12 characters of the Yubikey OTP or WebAuthn credential ID'
    },
    assignedTo: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Name or identifier of the person assigned to this Yubikey'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Whether this Yubikey is currently allowed to authenticate'
    },
    lastUsed: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Last time this Yubikey was used for authentication'
    },
    // WebAuthn specific fields
    credentialPublicKey: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Base64 encoded public key for WebAuthn authentication'
    },
    credentialCounter: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: 'WebAuthn signature counter to prevent replay attacks'
    },
    authType: {
        type: DataTypes.ENUM('otp', 'webauthn'),
        defaultValue: 'otp',
        allowNull: false,
        comment: 'Type of authentication this Yubikey uses'
    }
});

// Instance methods
Yubikey.prototype.incrementCounter = async function() {
    if (this.authType === 'webauthn') {
        this.credentialCounter += 1;
        this.lastUsed = new Date();
        await this.save();
    }
};

module.exports = Yubikey;
