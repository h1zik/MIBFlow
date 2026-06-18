const express = require('express');
const router = express.Router();
const ChatMessage = require('../models/chatMessage');
const User = require('../models/user');
const { Op } = require('sequelize');
const { authenticate } = require('../middleware/authMiddleware');

// Apply authentication middleware to all chat routes
router.use(authenticate);

// Get available users grouped by role
router.get('/users', async (req, res) => {
    try {
        const currentUserId = req.user.id;
        
        // Get all users except current user, grouped by role
        const users = await User.findAll({
            where: {
                id: {
                    [Op.ne]: currentUserId
                }
            },
            attributes: ['id', 'username', 'role'],
            order: [
                ['role', 'ASC'],
                ['username', 'ASC']
            ]
        });

        // Group users by role
        const usersByRole = users.reduce((acc, user) => {
            if (!acc[user.role]) {
                acc[user.role] = [];
            }
            acc[user.role].push({
                id: user.id,
                username: user.username
            });
            return acc;
        }, {});

        res.json(usersByRole);

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Send a chat message
router.post('/send', async (req, res) => {
    try {
        const { message: messageText, recipientId } = req.body;
        
        if (!messageText || typeof messageText !== 'string' || messageText.trim().length === 0) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!recipientId) {
            return res.status(400).json({ error: 'Recipient is required' });
        }

        const userId = req.user.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        // Check if recipient exists
        const recipient = await User.findByPk(recipientId);
        if (!recipient) {
            return res.status(404).json({ error: 'Recipient not found' });
        }

        // Create the message
        const chatMessage = await ChatMessage.create({
            message: messageText.trim(),
            senderId: userId,
            receiverId: recipientId,
            messageType: 'user'
        });

        // Send success response
        res.json({ 
            success: true, 
            message: chatMessage
        });

    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get chat messages
router.get('/messages', async (req, res) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        // Get messages for the current user
        const messages = await ChatMessage.findAll({
            where: {
                [Op.or]: [
                    { senderId: userId },
                    { receiverId: userId }
                ]
            },
            include: [
                {
                    model: User,
                    as: 'sender',
                    attributes: ['id', 'username', 'role']
                },
                {
                    model: User,
                    as: 'receiver',
                    attributes: ['id', 'username', 'role']
                }
            ],
            order: [['createdAt', 'ASC']], // Order by creation time
            attributes: ['id', 'message', 'senderId', 'receiverId', 'messageType', 'createdAt']
        });

        res.json(messages);

    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Mark messages as read
router.post('/mark-read', async (req, res) => {
    try {
        const { messageIds } = req.body;
        if (!messageIds || !Array.isArray(messageIds)) {
            return res.status(400).json({ error: 'Message IDs are required' });
        }

        const userId = req.user.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        await ChatMessage.update(
            { isRead: true },
            {
                where: {
                    id: messageIds,
                    receiverId: userId
                }
            }
        );

        res.json({ success: true });

    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({ error: 'Failed to mark messages as read' });
    }
});

module.exports = router;
