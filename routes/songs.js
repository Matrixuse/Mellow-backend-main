const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getSongs, uploadSong, updateSongDuration, updateSongDurations, streamSong, streamCover } = require('../controllers/songController');
// Use the standard protect middleware for authenticated routes
const { protect } = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Public streaming routes for audio and cover assets
router.get('/stream/:id', streamSong);
router.get('/cover/:id', streamCover);

// Route to get all songs for a logged-in user (protected)
router.get('/', protect, getSongs);

// Route to update a specific song's duration (frontend sends duration after audio loads)
router.post('/update-duration', protect, updateSongDuration);

// Route to update durations for all songs (admin/protected)
router.post('/update-durations', protect, updateSongDurations);

// Route to upload a song (authenticated users)
router.post('/upload', 
    protect,
    upload.fields([
        { name: 'songFile', maxCount: 1 }, 
        { name: 'coverFile', maxCount: 1 }
    ]),
    uploadSong
);

module.exports = router;

