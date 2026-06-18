const express = require('express');
const { addTankForm, addTank, tankList, getEditTankForm, postEditTank, deleteTank } = require('../controllers/tankController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/add', authenticate, authorize(['Production']), addTankForm);
router.post('/add', authenticate, authorize(['Production']), addTank);
router.get('/tankList', authenticate, authorize(['Production','Finance']), tankList);
// Route to display the edit tank form
router.get('/edit/:id', authenticate, authorize(['Production','Finance']), getEditTankForm);

// Route to handle the edit tank form submission
router.post('/edit/:id', authenticate, authorize(['Production','Finance']), postEditTank);

// Route to delete a tank
router.post('/delete/:id', authenticate, authorize(['Production']), deleteTank);

module.exports = router;
