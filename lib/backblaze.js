const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const bucketName = process.env.B2_BUCKET_NAME;
const endpoint = process.env.B2_ENDPOINT;
const accessKeyId = process.env.B2_KEY_ID;
const secretAccessKey = process.env.B2_APPLICATION_KEY;

if (!bucketName || !endpoint || !accessKeyId || !secretAccessKey) {
  console.warn('Backblaze B2 is not fully configured. Please set B2_BUCKET_NAME, B2_ENDPOINT, B2_KEY_ID, and B2_APPLICATION_KEY.');
}

const s3 = new S3Client({
  region: 'us-east-1',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true,
});

const createObjectUrl = (key) => {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${endpoint.replace(/\/$/, '')}/${bucketName}/${encodedKey}`;
};

const uploadFileToB2 = async ({ buffer, key, contentType }) => {
  if (!key) {
    throw new Error('Backblaze object key is required.');
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  });

  await s3.send(command);
  return { objectUrl: createObjectUrl(key), key };
};

const getSignedUrlForKey = async (key, expiresInSeconds = 3600) => {
  if (!key) {
    throw new Error('Backblaze object key is required for signed URL generation.');
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
};

module.exports = {
  uploadFileToB2,
  getSignedUrlForKey,
};