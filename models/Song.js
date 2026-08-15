const mongoose = require('mongoose');

const SongSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: [String], default: [], required: true },
  audioKey: { type: String, default: null },
  coverKey: { type: String, default: null },
  songUrl: { type: String, default: null },
  coverUrl: { type: String, default: null },
  moods: { type: [String], default: [] },
  vibeTags: { type: [String], default: [] },
  // duration in seconds (float)
  duration: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// text index for efficient search-as-you-type
SongSchema.index({ title: 'text', artist: 'text' });

module.exports = mongoose.models.Song || mongoose.model('Song', SongSchema);
