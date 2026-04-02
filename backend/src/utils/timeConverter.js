/**
 * Time conversion utilities
 * Converts time strings (HH:MM:SS or MM:SS) to seconds
 */

/**
 * Convert time string to seconds
 * @param {string} timeStr - Time string in HH:MM:SS or MM:SS format, or "—"
 * @returns {number} - Time in seconds
 */
function timeToSeconds(timeStr) {
  if (!timeStr || timeStr === "—") {
    return 0;
  }
  
  try {
    const parts = timeStr.split(":");
    
    if (parts.length === 3) {
      // HH:MM:SS format
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    } else if (parts.length === 2) {
      // MM:SS format
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else {
      return 0;
    }
  } catch (error) {
    return 0;
  }
}

module.exports = {
  timeToSeconds
};
