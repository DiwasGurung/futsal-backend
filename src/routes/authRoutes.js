const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/authController');
const s = require('../validators/schemas');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

router.post('/register', limiter, validate(s.register), c.register);
router.post('/login', limiter, validate(s.login), c.login);
router.get('/me', protect, c.me);
router.put('/password', protect, validate(s.changePassword), c.changePassword);

module.exports = router;
