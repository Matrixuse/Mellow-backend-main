 const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Song = require('../models/Song');
const Playlist = require('../models/Playlist');

// Toggle favorite song for current user
router.post('/songs/:songId', protect, async (req, res) => {
    try {
        const { songId } = req.params;
        console.log('POST /api/favorites/songs/:songId - User ID:', req.user.id, 'Song ID:', songId);
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if song exists
        const song = await Song.findById(songId);
        if (!song) {
            console.log('Song not found:', songId);
            return res.status(404).json({ message: 'Song not found' });
        }

        // Toggle favorite
        const isFavorited = user.favoriteSongs.includes(songId);
        console.log('Before toggle - isFavorited:', isFavorited, 'favoriteSongs:', user.favoriteSongs);
        if (isFavorited) {
            user.favoriteSongs = user.favoriteSongs.filter(id => id.toString() !== songId);
        } else {
            user.favoriteSongs.push(songId);
        }
        console.log('After toggle - favoriteSongs:', user.favoriteSongs);

        await user.save();
        res.json({
            message: isFavorited ? 'Song removed from favorites' : 'Song added to favorites',
            isFavorited: !isFavorited
        });
    } catch (err) {
        console.error('Error toggling favorite song:', err);
        res.status(500).json({ message: 'Failed to toggle favorite' });
    }
});

// Toggle favorite playlist for current user
router.post('/playlists/:playlistId', protect, async (req, res) => {
    try {
        const { playlistId } = req.params;
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if playlist exists
        const playlist = await Playlist.findById(playlistId);
        if (!playlist) {
            return res.status(404).json({ message: 'Playlist not found' });
        }

        // Toggle favorite
        const isFavorited = user.favoritePlaylists.includes(playlistId);
        if (isFavorited) {
            user.favoritePlaylists = user.favoritePlaylists.filter(id => id.toString() !== playlistId);
        } else {
            user.favoritePlaylists.push(playlistId);
        }

        await user.save();
        res.json({
            message: isFavorited ? 'Playlist removed from favorites' : 'Playlist added to favorites',
            isFavorited: !isFavorited
        });
    } catch (err) {
        console.error('Error toggling favorite playlist:', err);
        res.status(500).json({ message: 'Failed to toggle favorite' });
    }
});

// Get all favorite songs for current user
router.get('/songs', protect, async (req, res) => {
    try {
        console.log('GET /api/favorites/songs - User ID:', req.user.id);
        const user = await User.findById(req.user.id)
            .populate('favoriteSongs', 'title artist coverUrl moods');

        if (!user) {
            console.log('User not found');
            return res.status(404).json({ message: 'User not found' });
        }

        console.log('User favoriteSongs array:', user.favoriteSongs);
        console.log('Populated favoriteSongs:', user.favoriteSongs.map(s => ({ id: s._id, title: s.title, artist: s.artist })));

        // Normalize song objects
        const favoriteSongs = user.favoriteSongs.map(song => ({
            ...song.toObject(),
            id: song._id || song.id
        }));

        console.log('Returning favoriteSongs:', favoriteSongs);
        res.json(favoriteSongs);
    } catch (err) {
        console.error('Error fetching favorite songs:', err);
        res.status(500).json({ message: 'Failed to fetch favorite songs' });
    }
});

// Get all favorite playlists for current user
router.get('/playlists', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('favoritePlaylists', 'name description coverUrl songs userId')
            .populate('favoritePlaylists.userId', 'name');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Normalize playlist objects
        const favoritePlaylists = user.favoritePlaylists.map(playlist => ({
            ...playlist.toObject(),
            id: playlist._id || playlist.id,
            owner: playlist.userId ? playlist.userId.name : 'Unknown'
        }));

        res.json(favoritePlaylists);
    } catch (err) {
        console.error('Error fetching favorite playlists:', err);
        res.status(500).json({ message: 'Failed to fetch favorite playlists' });
    }
});

// Check if a song is favorited by current user
router.get('/songs/:songId/is-favorited', protect, async (req, res) => {
    try {
        const { songId } = req.params;
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isFavorited = user.favoriteSongs.includes(songId);
        res.json({ isFavorited });
    } catch (err) {
        console.error('Error checking favorite status:', err);
        res.status(500).json({ message: 'Failed to check favorite status' });
    }
});

// Check if a playlist is favorited by current user
router.get('/playlists/:playlistId/is-favorited', protect, async (req, res) => {
    try {
        const { playlistId } = req.params;
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isFavorited = user.favoritePlaylists.includes(playlistId);
        res.json({ isFavorited });
    } catch (err) {
        console.error('Error checking favorite status:', err);
        res.status(500).json({ message: 'Failed to check favorite status' });
    }
});

module.exports = router;
