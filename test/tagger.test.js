const { extractTags } = require('./tagger');

describe('extractTags', () => {
  test('extracts tags from job text', () => {
    const job = {
      title: 'Software Developer',
      description: 'We need a skilled JavaScript developer with React experience.'
    };
    const tags = extractTags(job);
    expect(tags).toContain('javascript');
    expect(tags).toContain('developer');
  });
});