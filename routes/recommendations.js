const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

// simple playlist recommendation based on listened artists
router.get('/playlists', protect, async (req, res) => {
    const userId = req.user.id;
    try {
        const User = require('../models/User');
        const Playlist = require('../models/Playlist');
        const Song = require('../models/Song');
        // load user's history with song details
        const user = await User.findById(userId).populate({ path: 'listenHistory.song', select: 'artist' });
        if (!user || !user.listenHistory || user.listenHistory.length === 0) {
            return res.json([]);
        }
        // gather artist counts
        const counts = {};
        user.listenHistory.forEach(h => {
            const s = h.song;
            if (s && s.artist) {
                const artists = Array.isArray(s.artist) ? s.artist : [s.artist];
                artists.forEach(a => {
                    if (!a) return;
                    counts[a] = (counts[a] || 0) + 1;
                });
            }
        });
        const topArtists = Object.entries(counts)
            .sort(([,a],[,b]) => b - a)
            .slice(0,3)
            .map(([artist]) => artist);
        if (topArtists.length === 0) {
            return res.json([]);
        }
        // fetch public playlists and filter
        const playlists = await Playlist.find({ isPublic: true }).populate({ path: 'songs.song' }).lean();
        const recs = playlists.filter(pl => {
            if (!pl.songs || pl.songs.length === 0) return false;
            return pl.songs.some(item => {
                const s = item.song;
                if (!s || !s.artist) return false;
                const artists = Array.isArray(s.artist) ? s.artist : [s.artist];
                return artists.some(a => topArtists.includes(a));
            });
        }).slice(0,20);
        const mapped = recs.map(pl => ({
            id: pl._id,
            name: pl.name,
            description: pl.description,
            coverUrl: pl.coverUrl,
            songCount: Array.isArray(pl.songs) ? pl.songs.length : 0,
            isPublic: !!pl.isPublic
        }));
        return res.json(mapped);
    } catch (err) {
        console.error('recommendations error:', err);
        return res.status(500).json({ message: 'Failed to compute recommendations' });
    }
});

module.exports = router;
