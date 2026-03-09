const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, sparse: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  // new fields for features
  favoriteSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
  favoritePlaylists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Playlist' }],
  listenHistory: [{ song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' }, playedAt: Date }],
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  pinnedPlaylists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Playlist' }]
});

// Check if model already exists before creating a new one
const User = mongoose.models.User || mongoose.model('User', UserSchema);

module.exports = User;
