const cloudinary = require('cloudinary').v2;
const stream = require('stream');

// If MONGO_URI is present we prefer using MongoDB (Mongoose) for songs
let SongModel = null;
try {
    if (process.env.MONGO_URI) {
        SongModel = require('../models/Song');
    }
} catch (e) {
    // ignore if model cannot be loaded
}

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const uploadFileToCloudinary = (fileBuffer, options) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) { return reject(error); }
            resolve(result);
        });
        const bufferStream = new stream.PassThrough();
        bufferStream.end(fileBuffer);
        bufferStream.pipe(uploadStream);
    });
};

const extractCloudinaryPublicId = (songUrl) => {
    if (!songUrl) return null;
    const match = String(songUrl).match(/\/upload\/(?:v\d+\/)?(.+?)\.[^./]+(?:\?.*)?$/);
    return match ? match[1] : null;
};

const getDurationFromCloudinary = async (songUrl) => {
    const publicId = extractCloudinaryPublicId(songUrl);
    if (!publicId) return 0;
    const resourceTypes = ['video', 'raw'];
    for (const resourceType of resourceTypes) {
        try {
            const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType });
            if (resource && typeof resource.duration === 'number' && resource.duration > 0) {
                return resource.duration;
            }
        } catch (err) {
            if (resourceType === 'raw') {
                console.warn('Cloudinary duration lookup failed for resource types video/raw:', err && err.message);
            }
        }
    }
    return 0;
};

const getDurationFromRemoteAudio = async (songUrl) => {
    try {
        const response = await fetch(songUrl);
        if (!response.ok) return 0;
        const contentType = response.headers.get('content-type');
        const stream = response.body;
        const metadata = await mm.parseStream(stream, { mimeType: contentType }, { duration: true });
        if (metadata && metadata.format && metadata.format.duration) {
            return metadata.format.duration;
        }
    } catch (err) {
        console.warn('Remote audio duration fetch failed:', err && err.message);
    }
    return 0;
};

const mm = require('music-metadata');

const uploadSong = async (req, res) => {
    try {
        const { title, artist, moods } = req.body;
        const { songFile, coverFile } = req.files;

        if (!songFile || !coverFile || !title || !artist) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        // --- YAHAN HUMNE BADLAAV KIYA HAI #1 ---
        // Hum artist string ko comma se todkar ek array bana rahe hain
        const artistsArray = artist.split(',').map(name => name.trim()).filter(Boolean);
        // Hum uss array ko JSON string mein badal rahe hain taaki database mein save kar sakein
        const artistsJsonString = JSON.stringify(artistsArray);
        
        // Parse moods from JSON string or use empty array
        let moodsArray = [];
        try {
            moodsArray = moods ? JSON.parse(moods) : [];
        } catch (e) {
            moodsArray = [];
        }
        const moodsJsonString = JSON.stringify(moodsArray);


        // Try to parse audio metadata (duration) from the uploaded buffer
        let durationSeconds = 0;
        try {
            const meta = await mm.parseBuffer(songFile[0].buffer, songFile[0].mimetype, { duration: true });
            if (meta && meta.format && meta.format.duration) durationSeconds = meta.format.duration;
        } catch (e) {
            console.warn('Failed to parse audio metadata for duration:', e && e.message);
        }

        const [songUploadResult, coverUploadResult] = await Promise.all([
            uploadFileToCloudinary(songFile[0].buffer, { resource_type: 'video', folder: 'music_app_songs' }),
            uploadFileToCloudinary(coverFile[0].buffer, { resource_type: 'image', folder: 'music_app_covers' })
        ]);

        const songUrl = songUploadResult.secure_url;
        const coverUrl = coverUploadResult.secure_url;
        
        // Require MongoDB; do not fall back to SQLite anymore
        if (!SongModel) {
            console.error('MONGO_URI not configured: cannot save song metadata.');
            return res.status(500).json({ message: 'Server not configured for MongoDB.' });
        }

        try {
            const songDoc = await SongModel.create({
                title,
                artist: artistsArray,
                songUrl,
                coverUrl,
                moods: moodsArray,
                duration: durationSeconds,
            });
            return res.status(201).json({
                id: songDoc._id,
                title: songDoc.title,
                artist: songDoc.artist,
                songUrl: songDoc.songUrl,
                coverUrl: songDoc.coverUrl,
                moods: songDoc.moods,
                duration: songDoc.duration,
            });
        } catch (err) {
            console.error('MongoDB save error:', err);
            return res.status(500).json({ message: 'Failed to save song to database.' });
        }

    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ message: 'Server error during file upload.' });
    }
};

const getSongs = async (req, res) => {
    if (!SongModel) {
        console.error('MONGO_URI not configured: cannot read songs.');
        return res.status(500).json({ message: 'Server not configured for MongoDB.' });
    }

    try {
        const docs = await SongModel.find({}).sort({ createdAt: -1 }).lean().exec();
        let favIds = [];
        if (req.user && req.user.id) {
            const User = require('../models/User');
            const userDoc = await User.findById(req.user.id).select('favoriteSongs');
            if (userDoc && Array.isArray(userDoc.favoriteSongs)) {
                favIds = userDoc.favoriteSongs.map(id => String(id));
            }
        }

        const mapped = await Promise.all(docs.map(async (doc) => {
            let duration = Number(doc.duration) || 0;
            if (!duration && doc.songUrl) {
                duration = await getDurationFromCloudinary(doc.songUrl);
            }
            if (!duration && doc.songUrl) {
                duration = await getDurationFromRemoteAudio(doc.songUrl);
            }
            return {
                id: doc._id,
                title: doc.title,
                artist: doc.artist,
                songUrl: doc.songUrl,
                coverUrl: doc.coverUrl,
                moods: doc.moods || [],
                duration: duration || 0,
                isFavorite: favIds.includes(String(doc._id))
            };
        }));
        res.status(200).json(mapped);
    } catch (err) {
        console.error('MongoDB fetch error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Update a specific song's duration
const updateSongDuration = async (req, res) => {
    if (!SongModel) {
        console.error('MONGO_URI not configured: cannot update song.');
        return res.status(500).json({ message: 'Server not configured for MongoDB.' });
    }

    try {
        const { songId, duration } = req.body;

        if (!songId || !duration || duration <= 0) {
            return res.status(400).json({ message: 'songId and duration (> 0) are required.' });
        }

        const updated = await SongModel.findByIdAndUpdate(
            songId,
            { duration: Number(duration) },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ message: 'Song not found.' });
        }

        return res.status(200).json({
            message: 'Duration updated successfully.',
            id: updated._id,
            duration: updated.duration
        });
    } catch (err) {
        console.error('Duration update error:', err);
        res.status(500).json({ message: 'Server error updating duration' });
    }
};

// Update durations for all songs that have 0 or missing duration
const updateSongDurations = async (req, res) => {
    if (!SongModel) {
        console.error('MONGO_URI not configured: cannot update songs.');
        return res.status(500).json({ message: 'Server not configured for MongoDB.' });
    }

    try {
        const docs = await SongModel.find({ $or: [{ duration: { $exists: false } }, { duration: 0 }] }).exec();
        
        if (docs.length === 0) {
            return res.status(200).json({ message: 'No songs need duration updates.', updated: 0 });
        }

        let updated = 0;
        for (const doc of docs) {
            if (doc.songUrl) {
                const duration = await getDurationFromCloudinary(doc.songUrl);
                if (duration && duration > 0) {
                    doc.duration = duration;
                    await doc.save();
                    updated++;
                    console.log(`Updated duration for ${doc.title}: ${duration} seconds`);
                }
            }
        }

        return res.status(200).json({ 
            message: `Updated ${updated} songs with duration information.`, 
            updated: updated,
            total: docs.length
        });
    } catch (err) {
        console.error('Duration update error:', err);
        res.status(500).json({ message: 'Server error updating durations' });
    }
};

module.exports = { getSongs, uploadSong, updateSongDuration, updateSongDurations };

