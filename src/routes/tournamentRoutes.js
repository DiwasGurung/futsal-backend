const router = require('express').Router();
const c = require('../controllers/tournamentController');
const s = require('../validators/schemas');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');
const { checkTournamentLimit } = require('../middleware/planLimits');

const admin = authorize('owner', 'admin');

router.use(protect);
router.get('/', c.list);
router.post('/', admin, validate(s.createTournament), checkTournamentLimit, c.create);
router.get('/:id', c.get);
router.put('/:id', admin, validate(s.updateTournament), c.update);
router.delete('/:id', admin, c.remove);

router.post('/:id/fixtures', admin, validate(s.generateFixtures), c.generateFixtures);
router.post('/:id/advance', admin, c.advance);
router.get('/:id/standings', c.standings);
router.get('/:id/top-scorers', c.topScorers);

module.exports = router;
