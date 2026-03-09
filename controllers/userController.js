const mongoose = require('mongoose');

let User = null;
let Playlist = null;
let Song = null;
try {
    User = require('../models/User');
    Playlist = require('../models/Playlist');
    Song = require('../models/Song');
} catch (e) {
    User = null;
    Playlist = null;
    Song = null;
}

function requireMongoOrFail(res) {
    if (!User) {
        return res.status(500).json({ message: 'Server not configured for MongoDB. Please set MONGO_URI and restart.' });
    }
    return null;
}

// record a song listen for the current user
const addListenHistory = async (req, res) => {
    if (requireMongoOrFail(res)) return;

    const userId = req.user.id;
    const { songId } = req.body;
    if (!songId) {
        return res.status(400).json({ message: 'songId is required' });
    }

    try {
        // push to listenHistory with current timestamp
        await User.findByIdAndUpdate(userId, {
            $push: { listenHistory: { song: songId, playedAt: new Date() } }
        });
        return res.json({ message: 'history recorded' });
    } catch (err) {
        console.error('Error saving listenHistory', err);
        return res.status(500).json({ message: 'Failed to record history' });
    }
};

// follow another user
const followUser = async (req, res) => {
    if (requireMongoOrFail(res)) return;

    const meId = req.user.id;
    const targetId = req.params.id;
    if (String(meId) === String(targetId)) {
        return res.status(400).json({ message: "Can't follow yourself" });
    }

    try {
        const me = await User.findById(meId);
        const target = await User.findById(targetId);
        if (!target) {
            return res.status(404).json({ message: 'User to follow not found' });
        }
        if (!me.following.includes(targetId)) {
            me.following.push(targetId);
        }
        if (!target.followers.includes(meId)) {
            target.followers.push(meId);
        }
        await me.save();
        await target.save();
        return res.json({ message: 'Now following' });
    } catch (err) {
        console.error('Error following user', err);
        return res.status(500).json({ message: 'Failed to follow user' });
    }
};

// unfollow a user
const unfollowUser = async (req, res) => {
    if (requireMongoOrFail(res)) return;

    const meId = req.user.id;
    const targetId = req.params.id;
    if (String(meId) === String(targetId)) {
        return res.status(400).json({ message: "Can't unfollow yourself" });
    }

    try {
        await User.findByIdAndUpdate(meId, { $pull: { following: targetId } });
        await User.findByIdAndUpdate(targetId, { $pull: { followers: meId } });
        return res.json({ message: 'Unfollowed' });
    } catch (err) {
        console.error('Error unfollowing user', err);
        return res.status(500).json({ message: 'Failed to unfollow user' });
    }
};

// list users that current user is following
const getFollowing = async (req, res) => {
    if (requireMongoOrFail(res)) return;
    const meId = req.user.id;
    try {
        const me = await User.findById(meId).populate('following', 'name');
        const list = (me.following || []).map(u => ({ id: u._id, name: u.name }));
        return res.json(list);
    } catch (err) {
        console.error('Error fetching following list', err);
        return res.status(500).json({ message: 'Failed to fetch following' });
    }
};

// feed of recent activity from followed users
const getFeed = async (req, res) => {
    if (requireMongoOrFail(res)) return;
    const meId = req.user.id;
    try {
        const me = await User.findById(meId).select('following');
        const followIds = (me.following || []).map(id => String(id));
        if (followIds.length === 0) {
            return res.json([]);
        }
        // fetch followers' histories
        const users = await User.find({ _id: { $in: followIds } })
            .select('name listenHistory')
            .populate({ path: 'listenHistory.song', select: 'title artist coverUrl' });
        let events = [];
        users.forEach(u => {
            (u.listenHistory || []).forEach(h => {
                if (h && h.song) {
                    events.push({ userId: u._id, userName: u.name, song: h.song, playedAt: h.playedAt });
                }
            });
        });
        events.sort((a,b) => new Date(b.playedAt) - new Date(a.playedAt));
        events = events.slice(0, 50);
        return res.json(events);
    } catch (err) {
        console.error('Error fetching feed', err);
        return res.status(500).json({ message: 'Failed to fetch feed' });
    }
};

// get another user's public profile (name + public playlists)
const getUserProfile = async (req, res) => {
    if (requireMongoOrFail(res)) return;
    const targetId = req.params.id;
    try {
        const userDoc = await User.findById(targetId).select('name');
        if (!userDoc) return res.status(404).json({ message: 'User not found' });
        const playlists = await Playlist.find({ userId: targetId, isPublic: true })
            .select('name description coverUrl songs')
            .lean();
        const mapped = playlists.map(pl => ({
            id: pl._id,
            name: pl.name,
            description: pl.description,
            coverUrl: pl.coverUrl,
            songCount: Array.isArray(pl.songs) ? pl.songs.length : 0
        }));
        return res.json({ id: userDoc._id, name: userDoc.name, playlists: mapped });
    } catch (err) {
        console.error('Error fetching user profile', err);
        return res.status(500).json({ message: 'Failed to fetch user profile' });
    }
};

// toggle pin status of a playlist
const togglePinPlaylist = async (req, res) => {
    if (requireMongoOrFail(res)) return;

    const userId = req.user.id;
    const { playlistId } = req.body;
    if (!playlistId) {
        return res.status(400).json({ message: 'playlistId is required' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // check if already pinned
        const isPinned = user.pinnedPlaylists.some(id => String(id) === String(playlistId));

        if (isPinned) {
            // unpin
            user.pinnedPlaylists = user.pinnedPlaylists.filter(id => String(id) !== String(playlistId));
            await user.save();
            return res.json({ message: 'Playlist unpinned', pinned: false });
        } else {
            // pin
            user.pinnedPlaylists.push(playlistId);
            await user.save();
            return res.json({ message: 'Playlist pinned', pinned: true });
        }
    } catch (err) {
        console.error('Error toggling pin status', err);
        return res.status(500).json({ message: 'Failed to toggle pin status' });
    }
};

module.exports = {
    addListenHistory,
    followUser,
    unfollowUser,
    getFollowing,
    getFeed,
    getUserProfile,
    togglePinPlaylist
};