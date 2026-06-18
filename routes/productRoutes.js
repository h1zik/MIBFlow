const express = require('express');
const upload = require('../middleware/fileUpload');
const { 
    addProductForm, 
    addProduct, 
    addRawMaterialForm, 
    addRawMaterial, 
    listStock, 
    editProductForm, 
    updateProduct, 
    deleteProduct, 
    renderEditFormulaPage, 
    updateFormula, 
    addProductCheck,
    completeProductCheck,
    updateProductCheckStock
} = require('../controllers/productController');
const { updateProductCheckQCStatus } = require('../controllers/qcController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/listProduct', authenticate, authorize(['R&D','Product Warehouse','Marketing','PPIC']), listStock);
router.get('/addProduct', authenticate, authorize(['R&D']), addProductForm);
router.post(
    '/addProduct',
    authenticate,
    authorize(['R&D']),
    upload.fields([
        { name: 'tds', maxCount: 1 },
        { name: 'msds', maxCount: 1 }
    ]),
    (req, res, next) => {
        console.log('Request Files:', req.files); // Debugging log
        next();
    },
    addProduct
);

router.get('/addRawMaterial', authenticate, authorize(['Raw Material Warehouse']), addRawMaterialForm);
router.post('/addRawMaterial', authenticate, authorize(['Raw Material Warehouse']), addRawMaterial);
router.get('/edit/:id', authenticate, authorize(['Marketing','Product Warehouse','R&D']), editProductForm);
router.post('/edit/:id', authenticate, authorize(['Marketing','Product Warehouse','R&D']), updateProduct);
router.post('/delete/:id', authenticate, authorize(['R&D']), deleteProduct);
router.get('/:id/editFormula', authenticate, authorize(['R&D']), renderEditFormulaPage);
router.post('/:id/editFormula', authenticate, authorize(['R&D']), updateFormula);
// Product Check routes
router.post('/productCheck/add', authenticate, authorize(['PPIC']), addProductCheck);
router.post('/productCheck/:id/updateQC', authenticate, authorize(['QC']), updateProductCheckQCStatus);
router.post('/productCheck/:id/complete', authenticate, authorize(['PPIC']), completeProductCheck);
router.post('/productCheck/:id/updateStock', authenticate, authorize(['PPIC']), updateProductCheckStock);

module.exports = router;
