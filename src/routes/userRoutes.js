const router = require('express').Router();
const c = require('../controllers/userController');
const s = require('../validators/schemas');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');
const { checkStaffLimit } = require('../middleware/planLimits');

router.use(protect, authorize('owner', 'admin'));
router.get('/', c.list);
router.post('/', validate(s.createUser), checkStaffLimit, c.create);
router.put('/:id', validate(s.updateUser), c.update);
router.delete('/:id', c.remove);

module.exports = router;
