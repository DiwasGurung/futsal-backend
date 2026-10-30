const router = require('express').Router();
const c = require('../controllers/organizationController');
const s = require('../validators/schemas');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.get('/', c.get);
router.put('/', authorize('owner'), validate(s.updateOrganization), c.update);

module.exports = router;
