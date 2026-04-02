/**
 * Audio URL builder utility
 * Constructs S3 URLs for audio files from file names
 */

/**
 * Build S3 audio URL from file name
 * @param {string} fileName - Original file name from database
 * @param {string} bucket - S3 bucket name
 * @param {string} region - S3 region
 * @param {string} prefix - S3 prefix (folder path)
 * @returns {string} - Complete S3 URL
 */
function buildAudioUrl(fileName, bucket, region, prefix) {
  if (!fileName) {
    return null;
  }
  
  let audioFilename = fileName;
  
  // Remove transcript suffixes
  if (audioFilename.endsWith('_transcript.txt')) {
    audioFilename = audioFilename.slice(0, -'_transcript.txt'.length);
  } else if (audioFilename.endsWith('.txt')) {
    audioFilename = audioFilename.slice(0, -'.txt'.length);
  }
  
  if (audioFilename.endsWith('_transcript')) {
    audioFilename = audioFilename.slice(0, -'_transcript'.length);
  }
  
  // Add .mp3 extension
  audioFilename += '.mp3';
  
  // URL encode the filename
  const encoded = encodeURIComponent(audioFilename);
  
  // Build S3 URL
  return `https://${bucket}.s3.${region}.amazonaws.com/${prefix}/${encoded}`;
}

module.exports = {
  buildAudioUrl
};
