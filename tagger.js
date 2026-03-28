// tagger.js
function extractTags(job) {
  const text = `${job.title} ${job.description}`.toLowerCase();

  // pull meaningful words automatically
  const words = text
    .replace(/[^a-z0-9\s+#]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w));

  // count frequency and return top keywords as tags
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

const STOPWORDS = new Set([
  'with','that','this','will','have','from','they',
  'your','been','more','also','than','what','when',
  'able','good','work','team','role','join','about',
  'you','our','the','and','for','are','not','but'
]);

module.exports = { extractTags };
