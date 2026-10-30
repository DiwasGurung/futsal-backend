const router = require('express').Router();
const c = require('../controllers/matchController');
const s = require('../validators/schemas');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

const admin = authorize('owner', 'admin');
const staff = authorize('owner', 'admin', 'scorekeeper'); // scorekeepers run live matches

router.use(protect);
router.get('/', c.list);
router.get('/:id', c.get);
router.put('/:id', admin, validate(s.updateMatch), c.update);

router.post('/:id/start', staff, c.start);
router.post('/:id/events', staff, validate(s.matchEvent), c.addEvent);
router.delete('/:id/events/:eventId', staff, c.removeEvent);
router.post('/:id/finish', staff, validate(s.finishMatch), c.finish);
router.post('/:id/reopen', admin, c.reopen);

module.exports = router;
