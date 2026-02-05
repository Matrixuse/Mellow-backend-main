const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { 
    createPlaylist, 
    getUserPlaylists, 
    getPlaylistById, 
    updatePlaylist, 
    deletePlaylist,
    addSongToPlaylist,
    removeSongFromPlaylist,
    reorderPlaylistSongs,
    togglePlaylistVisibility,
    searchPublicPlaylists
} = require('../controllers/playlistController');

// Public search endpoint - no auth required
router.get('/search/public', searchPublicPlaylists);

// All playlist routes are protected
router.use(protect);

// Playlist CRUD operations
router.post('/', createPlaylist);
router.get('/', getUserPlaylists);
router.get('/:id', getPlaylistById);
router.put('/:id', updatePlaylist);
router.delete('/:id', deletePlaylist);
router.patch('/:id/toggle-visibility', togglePlaylistVisibility);

// Playlist song management
router.post('/:id/songs', addSongToPlaylist);
router.delete('/:id/songs/:songId', removeSongFromPlaylist);
router.put('/:id/songs/reorder', reorderPlaylistSongs);

module.exports = router;
