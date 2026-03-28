const SIGNALS = [
  'experience','years','knowledge','proficiency',
  'degree','must','required','ability to',
  'familiar with','background in','understanding of'
];

function extractRequirements(description) {
  if (!description) return [];

  const lines = description
    .replace(/<[^>]+>/g, '')
    .split(/[\n\-]/)
    .map(l => l.trim())
    .filter(l => l.length > 20 && l.length < 200);

  return lines
    .filter(l => SIGNALS.some(s => l.toLowerCase().includes(s)))
    .slice(0, 6);
}

module.exports = { extractRequirements };
