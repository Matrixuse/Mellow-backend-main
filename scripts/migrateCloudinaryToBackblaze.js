#!/usr/bin/env node
require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const { URL } = require('url');
const connectMongo = require('../config/mongo');
const Song = require('../models/Song');
const { uploadFileToB2 } = require('../lib/backblaze');

const argv = process.argv.slice(2);
const isDryRun = argv.includes('--dry-run');
const isRun = argv.includes('--run') || argv.includes('--execute') || argv.includes('--migrate');

const usage = () => {
    console.log(`Usage:`);
    console.log(`  node scripts/migrateCloudinaryToBackblaze.js --dry-run`);
    console.log(`  node scripts/migrateCloudinaryToBackblaze.js --run`);
    console.log(``);
    console.log(`Options:`);
    console.log(`  --dry-run   Report what would be migrated, without uploading or changing MongoDB.`);
    console.log(`  --run       Perform the actual migration.`);
};

if (!isDryRun && !isRun) {
    usage();
    process.exit(1);
}

const normalizeFileName = (value) => {
    return String(value || '')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 120)
        .replace(/^_+|_+$/g, '');
};

const createB2ObjectKey = (folder, baseName, extension) => {
    const safeBase = normalizeFileName(baseName) || 'file';
    const safeExt = extension ? (extension.startsWith('.') ? extension : `.${extension}`) : '';
    const randomHash = crypto.randomBytes(6).toString('hex');
    return `${folder}/${Date.now()}-${randomHash}-${safeBase}${safeExt}`;
};

const getExtensionFromUrl = (urlString) => {
    try {
        const parsed = new URL(urlString);
        const ext = path.extname(parsed.pathname).toLowerCase();
        return ext;
    } catch (err) {
        return '';
    }
};

const getExtensionFromContentType = (contentType) => {
    if (!contentType) return '';
    const mime = contentType.split(';')[0].trim().toLowerCase();
    switch (mime) {
        case 'audio/mpeg':
        case 'audio/mp3':
            return '.mp3';
        case 'image/jpeg':
        case 'image/jpg':
            return '.jpg';
        case 'image/png':
            return '.png';
        case 'image/webp':
            return '.webp';
        case 'image/gif':
            return '.gif';
        default:
            return '';
    }
};

const downloadRemoteFile = async (url, assetName) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Download failed for ${assetName}: HTTP ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || '';
    const urlExt = getExtensionFromUrl(url);

    return { buffer, contentType, urlExt };
};

const migrateSongDocument = async (doc) => {
    const songUrl = doc.songUrl || '';
    const coverUrl = doc.coverUrl || '';
    const hasAudioKey = Boolean(doc.audioKey);
    const hasCoverKey = Boolean(doc.coverKey);

    if (!songUrl || !coverUrl) {
        throw new Error('Missing songUrl or coverUrl for this document.');
    }

    const titleHint = `${doc._id}-${doc.title || 'song'}`;
    let audioKey = doc.audioKey || null;
    let coverKey = doc.coverKey || null;

    if (!hasAudioKey) {
        const audioSource = await downloadRemoteFile(songUrl, 'audio file');
        const audioExt = getExtensionFromUrl(songUrl) || getExtensionFromContentType(audioSource.contentType) || '.mp3';
        audioKey = createB2ObjectKey('songs', `${titleHint}-audio`, audioExt);

        if (!isDryRun) {
            await uploadFileToB2({
                buffer: audioSource.buffer,
                key: audioKey,
                contentType: audioSource.contentType || 'audio/mpeg'
            });
        }
    }

    if (!hasCoverKey) {
        const coverSource = await downloadRemoteFile(coverUrl, 'cover image');
        const coverExt = getExtensionFromUrl(coverUrl) || getExtensionFromContentType(coverSource.contentType) || '.jpg';
        coverKey = createB2ObjectKey('covers', `${titleHint}-cover`, coverExt);

        if (!isDryRun) {
            await uploadFileToB2({
                buffer: coverSource.buffer,
                key: coverKey,
                contentType: coverSource.contentType || 'application/octet-stream'
            });
        }
    }

    if (!isDryRun) {
        const updateFields = {};
        if (!hasAudioKey && audioKey) updateFields.audioKey = audioKey;
        if (!hasCoverKey && coverKey) updateFields.coverKey = coverKey;

        if (Object.keys(updateFields).length > 0) {
            await Song.updateOne({ _id: doc._id }, { $set: updateFields }).exec();
        }
    }

    return { audioKey, coverKey };
};

const run = async () => {
    const modeLabel = isDryRun ? 'DRY RUN' : 'LIVE MIGRATION';
    console.log(`\n${modeLabel} starting...`);

    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is not configured. Set it in your .env before running this script.');
        process.exit(1);
    }

    await connectMongo();

    const totalSongs = await Song.countDocuments().exec();
    const alreadyMigrated = await Song.countDocuments({ audioKey: { $exists: true }, coverKey: { $exists: true } }).exec();
    const candidates = await Song.find({
        $or: [
            { audioKey: { $exists: false } },
            { coverKey: { $exists: false } }
        ]
    }).exec();

    console.log(`Total songs in MongoDB: ${totalSongs}`);
    console.log(`Already migrated songs: ${alreadyMigrated}`);
    console.log(`Songs to evaluate for migration: ${candidates.length}\n`);

    let migratedCount = 0;
    let failedCount = 0;
    const failures = [];

    for (const doc of candidates) {
        const id = String(doc._id);
        const title = doc.title || '<untitled>';

        console.log(`Migrating song: ${id} — ${title}`);

        try {
            const result = await migrateSongDocument(doc);
            if (isDryRun) {
                console.log(`  [DRY] would set audioKey=${result.audioKey || '<existing>'} coverKey=${result.coverKey || '<existing>'}`);
            } else {
                console.log(`  ✓ migrated to B2: audioKey=${result.audioKey || '<existing>'} coverKey=${result.coverKey || '<existing>'}`);
            }
            migratedCount += 1;
        } catch (err) {
            failedCount += 1;
            const message = err && err.message ? err.message : 'Unknown error';
            failures.push({ id, title, reason: message });
            console.error(`  ✗ failed: ${message}`);
        }
    }

    console.log(`\nMigration complete`);
    console.log(`Total songs: ${totalSongs}`);
    console.log(`Already migrated: ${alreadyMigrated}`);
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Failed: ${failedCount}`);

    if (failures.length > 0) {
        console.log(`\nFailures:`);
        failures.forEach((failure) => {
            console.log(`- ${failure.id} | ${failure.title} | ${failure.reason}`);
        });
    }

    if (isDryRun) {
        console.log('\nDRY RUN complete. No uploads or MongoDB writes were performed.');
    }

    process.exit(failedCount > 0 ? 1 : 0);
};

run().catch((err) => {
    console.error('Unexpected migration error:', err && err.message ? err.message : err);
    process.exit(1);
});
