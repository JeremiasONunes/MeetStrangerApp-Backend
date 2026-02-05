const express = require('express');
const matchingController = require('../controllers/matching.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validate, schemas } = require('../middleware/validation.middleware');
const { chatLimiter } = require('../middleware/rateLimit.middleware');

const router = express.Router();

// All matching routes require authentication
router.use(authMiddleware);
router.use(chatLimiter);

router.post('/find',
  validate(schemas.joinQueue),
  matchingController.joinQueue
);

router.delete('/leave',
  matchingController.leaveQueue
);

router.get('/stats',
  matchingController.getQueueStats
);

module.exports = router;