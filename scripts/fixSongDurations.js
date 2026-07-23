// Script to fix missing song durations from Cloudinary
require('dotenv').config();
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

const Song = require('../models/Song');

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
            // continue to next resource type
        }
    }
    return 0;
};

async function fixDurations() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mellow');
        console.log('✓ Connected to MongoDB');

        console.log('Finding songs with missing/zero duration...');
        const docs = await Song.find({ $or: [{ duration: { $exists: false } }, { duration: 0 }] }).exec();

        if (docs.length === 0) {
            console.log('✓ No songs need duration updates');
            await mongoose.disconnect();
            process.exit(0);
        }

        console.log(`Found ${docs.length} songs to update...`);

        let updated = 0;
        for (const doc of docs) {
            if (doc.songUrl) {
                console.log(`\nFetching duration for: ${doc.title}`);
                const duration = await getDurationFromCloudinary(doc.songUrl);
                if (duration && duration > 0) {
                    doc.duration = duration;
                    await doc.save();
                    updated++;
                    console.log(`  ✓ Updated: ${duration} seconds (${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s)`);
                } else {
                    console.log(`  ✗ Could not fetch duration from Cloudinary`);
                }
            }
        }

        console.log(`\n✓ Successfully updated ${updated}/${docs.length} songs with duration information`);
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

fixDurations();
