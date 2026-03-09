const mongoose = require('mongoose');

const SongSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: [String], default: [], required: true },
  songUrl: { type: String, required: true },
  coverUrl: { type: String, required: true },
  moods: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

// text index for efficient search-as-you-type
SongSchema.index({ title: 'text', artist: 'text' });

module.exports = mongoose.models.Song || mongoose.model('Song', SongSchema);
