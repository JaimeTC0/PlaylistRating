// src/ratingUtils.js

/**
 * Optimistically update average rating after a new user rating
 * @param {number} currentAvg - current blended average (from server)
 * @param {number} count - number of real user ratings so far (from server)
 * @param {number} newRating - new rating user is submitting
 * @param {number} baselineWeight - how many votes baseRating counts as
 * @returns {number} updated blended average
 */
export function optimisticUpdate(currentAvg, count, newRating, baselineWeight = 3) {
  if (typeof currentAvg !== "number" || typeof count !== "number" || typeof newRating !== "number") {
    return newRating; // fallback: just show what they picked
  }
  const totalVotes = count + baselineWeight;
  const newAvg = (currentAvg * totalVotes + newRating) / (totalVotes + 1);
  return parseFloat(newAvg.toFixed(2));
}