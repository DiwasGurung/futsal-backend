const router = require('express').Router();

router.use('/public', require('./publicRoutes'));
router.use('/auth', require('./authRoutes'));
router.use('/organization', require('./organizationRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/tournaments', require('./tournamentRoutes'));
router.use('/teams', require('./teamRoutes'));
router.use('/players', require('./playerRoutes'));
router.use('/matches', require('./matchRoutes'));

module.exports = router;
