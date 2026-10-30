const router = require('express').Router();
const c = require('../controllers/playerController');
const s = require('../validators/schemas');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

const admin = authorize('owner', 'admin');

router.use(protect);
router.get('/', c.list);
router.post('/', admin, validate(s.createPlayer), c.create);
router.get('/:id', c.get);
router.put('/:id', admin, validate(s.updatePlayer), c.update);
router.delete('/:id', admin, c.remove);

module.exports = router;
