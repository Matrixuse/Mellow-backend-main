const express = require('express');
const router = express.Router();
const Song = require('../models/Song');
const Playlist = require('../models/Playlist');
const { protect } = require('../middleware/authMiddleware');

// Advanced search-as-you-type for songs, artists, and playlists
// GET /api/search?q=query&type=all&limit=20
router.get('/', async (req, res) => {
    const q = (req.query.q || '').trim();
    const type = (req.query.type || 'all').toLowerCase(); // 'all', 'songs', 'artists', 'playlists'
    const limit = Math.min(parseInt(req.query.limit) || 20, 50); // Max 50 results
    
    if (!q || q.length < 1) {
        return res.json({ songs: [], artists: [], playlists: [] });
    }

    // attempt to identify user from token so we can mark favorites
    let favSongIds = [];
    let favPlaylistIds = [];
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(req.headers.authorization.split(' ')[1], process.env.JWT_SECRET);
            const User = require('../models/User');
            const user = await User.findById(decoded.id).select('favoriteSongs favoritePlaylists');
            if (user) {
                favSongIds = (user.favoriteSongs || []).map(id => String(id));
                favPlaylistIds = (user.favoritePlaylists || []).map(id => String(id));
            }
        } catch (err) {
            // silent - invalid token, ignore
        }
    }

    try {
        const results = { songs: [], artists: [], playlists: [] };

        // Search songs
        if (type === 'all' || type === 'songs') {
            const songQuery = {
                $or: [
                    { title: new RegExp(q, 'i') },
                    { artist: new RegExp(q, 'i') }
                ]
            };
            const rawSongs = await Song.find(songQuery)
                .limit(limit)
                .select('title artist coverUrl');
            results.songs = rawSongs.map(s => ({
                id: s._id,
                title: s.title,
                artist: s.artist,
                coverUrl: s.coverUrl,
                isFavorite: favSongIds.includes(String(s._id))
            }));
        }

        // Search for unique artists from songs
        if (type === 'all' || type === 'artists') {
            const artistResults = await Song.aggregate([
                {
                    $match: {
                        artist: new RegExp(q, 'i')
                    }
                },
                { $unwind: '$artist' },
                {
                    $match: {
                        artist: new RegExp(q, 'i')
                    }
                },
                {
                    $group: {
                        _id: '$artist',
                        songs: { $sum: 1 }
                    }
                },
                { $sort: { songs: -1 } },
                { $limit: limit }
            ]);
            results.artists = artistResults.map(a => ({
                name: a._id,
                songCount: a.songs
            }));
        }

        // Search playlists
        if (type === 'all' || type === 'playlists') {
            // First, search by playlist name and description
            const playlistQuery = {
                $or: [
                    { name: new RegExp(q, 'i') },
                    { description: new RegExp(q, 'i') }
                ],
                isPublic: true
            };
            const rawPlaylists = await Playlist.find(playlistQuery)
                .select('name description coverUrl isPublic userId')
                .populate('userId', 'name');
            
            // Also search for playlists that contain songs matching the query
            const songQuery = {
                $or: [
                    { title: new RegExp(q, 'i') },
                    { artist: new RegExp(q, 'i') }
                ]
            };
            const matchingSongs = await Song.find(songQuery).select('_id');
            const matchingSongIds = matchingSongs.map(s => s._id);
            
            // Find public playlists containing any of those songs
            let playlistsWithSongs = [];
            if (matchingSongIds.length > 0) {
                playlistsWithSongs = await Playlist.find({
                    isPublic: true,
                    'songs.song': { $in: matchingSongIds }
                })
                .select('name description coverUrl isPublic userId')
                .populate('userId', 'name');
            }
            
            // Combine and deduplicate playlists
            const playlistMap = new Map();
            rawPlaylists.forEach(p => {
                playlistMap.set(String(p._id), p);
            });
            playlistsWithSongs.forEach(p => {
                playlistMap.set(String(p._id), p);
            });
            
            // Convert back to array and limit
            const combinedPlaylists = Array.from(playlistMap.values()).slice(0, limit);
            results.playlists = combinedPlaylists.map(p => ({
                id: p._id,
                name: p.name,
                description: p.description,
                coverUrl: p.coverUrl,
                owner: p.userId ? p.userId.name : 'Unknown',
                ownerId: p.userId ? p.userId._id : null,
                isFavorite: favPlaylistIds.includes(String(p._id))
            }));
        }

        res.json(results);
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ message: 'Search failed' });
    }
});

module.exports = router;
