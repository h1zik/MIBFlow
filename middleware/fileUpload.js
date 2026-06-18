const fs = require('fs');
const multer = require('multer');
const path = require('path');

// Helper function to ensure directories exist
const ensureDirectoryExists = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'tds') {
            const dir = 'uploads/TDS';
            ensureDirectoryExists(dir);
            cb(null, dir);
        } else if (file.fieldname === 'msds') {
            const dir = 'uploads/MSDS';
            ensureDirectoryExists(dir);
            cb(null, dir);
        } else if (file.fieldname === 'bgscan') {
            const dir = 'uploads/BGScan';
            ensureDirectoryExists(dir);
            cb(null, dir);
        } else {
            cb(null, 'uploads/'); // Default directory
        }
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage });

module.exports = upload;
