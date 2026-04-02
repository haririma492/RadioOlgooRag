/**
 * Audio utilities
 */

/**
 * Extract panel code from file name (fallback)
 * @param {string} fileName - File name
 * @returns {string} - Panel code or "Unknown"
 */
export function extractPanelCode(fileName) {
  if (!fileName) return 'Unknown';
  const match = fileName.match(/(\d+)/);
  return match ? match[1] : 'Unknown';
}

/**
 * Format audio URL (if needed client-side)
 * Note: Audio URLs are typically built on the backend
 * @param {string} fileName - File name
 * @returns {string} - Audio URL
 */
export function formatAudioUrl(fileName) {
  // This is a fallback - backend should provide audio_url
  if (!fileName) return null;
  
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
  
  audioFilename += '.mp3';
  const encoded = encodeURIComponent(audioFilename);
  
  return `https://cspc-rag.s3.ca-central-1.amazonaws.com/audio/${encoded}`;
}
