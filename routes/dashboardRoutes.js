const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { getOrders, getMarketingOrders, getRAndDOrders, getPpicDashboardData, getApprovedOrders } = require('../controllers/orderController');
const { getProductionRequests } = require('../controllers/productionRequestController');
const { getQCProductionList } = require('../controllers/qcController');
const { getPaidRawMaterialRequests, assignVendor, forwardRawMaterialRequestToFinance } = require('../controllers/rawMaterialRequestController');  // Import the controller
const { getProductWarehouse } = require('../controllers/productWarehouseController');
const { getPurchaseDashboard } = require('../controllers/purchaseController');

const router = express.Router();

router.get('/marketing', authenticate, authorize(['Marketing']), getMarketingOrders);  // Use getMarketingOrders

router.get('/production', authenticate, authorize(['Production']), getProductionRequests);

router.get('/ppic', authenticate, authorize(['PPIC']), getPpicDashboardData);  // Use getPpicDashboardData to render PPIC dashboard

router.get('/raw-material-warehouse', authenticate, authorize(['Raw Material Warehouse']), getPaidRawMaterialRequests);  // Add this route

router.get('/rd', authenticate, authorize(['R&D']), getRAndDOrders);  // Add this route

router.get('/qc', authenticate, authorize(['QC']), getQCProductionList);  // Add this route

router.get('/finance', authenticate, authorize(['Finance']), getApprovedOrders);  // Add this route

router.get('/productWarehouse', authenticate, authorize(['Product Warehouse']), getProductWarehouse);  // Add this route

router.get('/purchase', authenticate, authorize(['Purchase']), getPurchaseDashboard);  // Add this route


// Add other routes for different roles similarly

module.exports = router;
