const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { togglePinPlaylist } = require('../controllers/userController');

const router = express.Router();

// toggle playlist pin status
router.post('/pin-playlist', protect, togglePinPlaylist);

module.exports = router;
