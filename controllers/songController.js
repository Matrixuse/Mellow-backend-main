const crypto = require('crypto');
const path = require('path');
const mm = require('music-metadata');
const { uploadFileToB2, getSignedUrlForKey, streamFileFromB2 } = require('../lib/backblaze');

// If MONGO_URI is present we prefer using MongoDB (Mongoose) for songs
let SongModel = null;
try {
    if (process.env.MONGO_URI) {
        SongModel = require('../models/Song');
    }
} catch (e) {
    // ignore if model cannot be loaded
}

const createB2ObjectKey = (folder, originalName) => {
    const ext = path.extname(originalName) || '';
    const baseName = path.basename(originalName, ext)

        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 120);
    const randomHash = crypto.randomBytes(6).toString('hex');
    return `${folder}/${Date.now()}-${randomHash}-${baseName}${ext}`;
};

const getFileContentType = (file, defaultType) => {
    const mimeType = file?.mimetype || '';
    const ext = file?.originalname ? path.extname(file.originalname).toLowerCase() : '';

    if (ext === '.mp3') return 'audio/mpeg';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (mimeType) return mimeType;
    return defaultType || 'application/octet-stream';
};

const getBackendOrigin = (req) => {
    if (process.env.BACKEND_PUBLIC_URL) {
        return process.env.BACKEND_PUBLIC_URL.replace(/\/$/, '');
    }
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const host = req.get('host');
    return `${proto}://${host}`;
};

const getStreamingUrl = (req, songId, type) => {
    if (!req || !songId) return null;
    const origin = getBackendOrigin(req);
    return `${origin}/api/songs/${type}/${songId}`;
};

const resolveSignedUrl = async (doc, keyField, fallbackUrl) => {
    if (doc && doc[keyField]) {
        try {
            return await getSignedUrlForKey(doc[keyField]);
        } catch (err) {
            console.warn(`Failed to generate signed URL for ${keyField}:`, err && err.message);
            return null;
        }
    }
    return fallbackUrl || null;
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

        const audioKey = createB2ObjectKey('songs', songFile[0].originalname);
        const coverKey = createB2ObjectKey('covers', coverFile[0].originalname);
        const songContentType = getFileContentType(songFile[0], 'audio/mpeg');
        const coverContentType = getFileContentType(coverFile[0], 'application/octet-stream');

        const [songUploadResult, coverUploadResult] = await Promise.all([
            uploadFileToB2({ buffer: songFile[0].buffer, key: audioKey, contentType: songContentType }),
            uploadFileToB2({ buffer: coverFile[0].buffer, key: coverKey, contentType: coverContentType })
        ]);

        const songUrl = songUploadResult.objectUrl;
        const coverUrl = coverUploadResult.objectUrl;
        
        // Require MongoDB; do not fall back to SQLite anymore
        if (!SongModel) {
            console.error('MONGO_URI not configured: cannot save song metadata.');
            return res.status(500).json({ message: 'Server not configured for MongoDB.' });
        }

        try {
            const songDoc = await SongModel.create({
                title,
                artist: artistsArray,
                audioKey,
                coverKey,
                songUrl,
                coverUrl,
                moods: moodsArray,
                duration: durationSeconds,
            });

            return res.status(201).json({
                id: songDoc._id,
                title: songDoc.title,
                artist: songDoc.artist,
                songUrl: songDoc.audioKey ? getStreamingUrl(req, songDoc._id, 'stream') : songDoc.songUrl,
                coverUrl: songDoc.coverKey ? getStreamingUrl(req, songDoc._id, 'cover') : songDoc.coverUrl,
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
            let songUrl = doc.songUrl || null;
            let coverUrl = doc.coverUrl || null;

            if (doc.audioKey) {
                songUrl = getStreamingUrl(req, doc._id, 'stream');
            }
            if (doc.coverKey) {
                coverUrl = getStreamingUrl(req, doc._id, 'cover');
            }

            // Do not fetch remote audio metadata during every song list request.
            // Use stored duration values, and update missing durations via the dedicated endpoint.
            return {
                id: doc._id,
                title: doc.title,
                artist: doc.artist,
                songUrl,
                coverUrl,
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

// Stream an audio file through the backend to avoid direct B2 CORS failures
const streamSong = async (req, res) => {
    try {
        if (!SongModel) {
            return res.status(500).json({ message: 'Server not configured for MongoDB.' });
        }
        const songDoc = await SongModel.findById(req.params.id).lean().exec();
        return streamResourceFromDoc(req, res, songDoc, 'audioKey', 'songUrl', 'audio/mpeg');
    } catch (err) {
        console.error('Stream song error:', err);
        return res.status(500).json({ message: 'Failed to stream song.' });
    }
};

const streamCover = async (req, res) => {
    try {
        if (!SongModel) {
            return res.status(500).json({ message: 'Server not configured for MongoDB.' });
        }
        const songDoc = await SongModel.findById(req.params.id).lean().exec();
        return streamResourceFromDoc(req, res, songDoc, 'coverKey', 'coverUrl', 'image/jpeg');
    } catch (err) {
        console.error('Stream cover error:', err);
        return res.status(500).json({ message: 'Failed to stream cover image.' });
    }
};

const streamResourceFromDoc = async (req, res, doc, keyField, fallbackUrlField, fallbackContentType) => {
    if (!doc) {
        return res.status(404).json({ message: 'Song not found.' });
    }

    const key = doc[keyField];
    const fallbackUrl = doc[fallbackUrlField];
    const rangeHeader = req.headers.range;

    if (!key) {
        if (fallbackUrl) {
            return res.redirect(fallbackUrl);
        }
        return res.status(404).json({ message: 'Resource not found.' });
    }

    try {
        const object = await streamFileFromB2(key, rangeHeader);
        const contentType = object.ContentType || fallbackContentType || 'application/octet-stream';

        if (rangeHeader) {
            res.status(206);
            if (object.ContentRange) {
                res.setHeader('Content-Range', object.ContentRange);
            }
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        if (object.ContentLength) {
            res.setHeader('Content-Length', object.ContentLength);
        }
        if (object.CacheControl) {
            res.setHeader('Cache-Control', object.CacheControl);
        }

        const body = object.Body;
        if (body && typeof body.pipe === 'function') {
            return body.pipe(res);
        }
        return res.send(body);
    } catch (err) {
        console.error('Streaming error:', err);
        return res.status(500).json({ message: 'Failed to stream resource.' });
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
            const playableUrl = doc.audioKey ? getStreamingUrl(req, doc._id, 'stream') : doc.songUrl;
            if (playableUrl) {
                const duration = await getDurationFromRemoteAudio(playableUrl);
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

module.exports = { getSongs, uploadSong, updateSongDuration, updateSongDurations, streamSong, streamCover };

