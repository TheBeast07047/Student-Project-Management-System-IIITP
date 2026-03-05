const express = require('express');
const router = express.Router();
const allocationController = require('../controllers/allocationController');
const { authenticateToken, requireAdmin, requireFaculty, requireStudent } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// ============================
// Public (any authenticated user)
// ============================
router.get('/faculty-list', allocationController.getAvailableFaculty);

// ============================
// Admin Routes
// ============================
router.get('/admin/config', requireAdmin, allocationController.getConfig);
router.put('/admin/config', requireAdmin, allocationController.updateConfig);
router.post('/admin/validate', requireAdmin, allocationController.validatePreRun);
router.post('/admin/run', requireAdmin, allocationController.runAlgorithm);
router.post('/admin/confirm', requireAdmin, allocationController.confirmResults);
router.post('/admin/reset', requireAdmin, allocationController.resetAllocation);
router.get('/admin/results', requireAdmin, allocationController.getResults);
router.get('/admin/admin-pool', requireAdmin, allocationController.getAdminPool);
router.post('/admin/admin-pool/:groupId/assign', requireAdmin, allocationController.assignAdminPoolGroup);
router.get('/admin/faculty-capacity', requireAdmin, allocationController.getFacultyCapacity);
router.put('/admin/faculty/:facultyId/capacity', requireAdmin, allocationController.updateFacultyCapacity);

// ============================
// Student Routes
// ============================
router.get('/student/config', requireStudent, allocationController.getStudentConfig);
router.get('/student/preferences', requireStudent, allocationController.getGroupPreferences);
router.post('/student/preferences', requireStudent, allocationController.submitGroupPreferences);
router.get('/student/demand', requireStudent, allocationController.getFacultyDemand);
router.get('/student/status', requireStudent, allocationController.getStudentAllocationStatus);

// ============================
// Faculty Routes
// ============================
router.get('/faculty/groups-to-rank', requireFaculty, allocationController.getGroupsToRank);
router.post('/faculty/rankings', requireFaculty, allocationController.submitFacultyRankings);
router.get('/faculty/status', requireFaculty, allocationController.getFacultyStatus);

module.exports = router;
