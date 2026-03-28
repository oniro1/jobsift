// fetcher.js
const axios = require('axios');

async function fetchJobs(query = 'developer', country = 'gb', page = 1) {
  try {
    // Use JSearch API for real job data
    const options = {
      method: 'GET',
      url: 'https://jsearch.p.rapidapi.com/search',
      params: {
        query: `${query} in ${country}`,
        page: page.toString(),
        num_pages: '1'
      },
      headers: {
        'X-RapidAPI-Key': process.env.JSEARCH_API_KEY || 'demo_key',
        'X-RapidAPI-Host': process.env.JSEARCH_HOST || 'jsearch.p.rapidapi.com'
      }
    };

    const response = await axios.request(options);
    const jobs = response.data.data || [];

    // Transform JSearch data to our format
    return jobs.map(job => ({
      id: job.job_id || `jsearch-${Date.now()}-${Math.random()}`,
      title: job.job_title || 'Untitled Position',
      company: { display_name: job.employer_name || 'Company' },
      location: { display_name: job.job_city && job.job_state ?
        `${job.job_city}, ${job.job_state}` : job.job_country || 'Remote' },
      salary_min: job.job_min_salary || 0,
      salary_max: job.job_max_salary || 0,
      redirect_url: job.job_apply_link || job.job_google_link || '#',
      employer_logo: job.employer_logo || null,
      employer_website: job.employer_website || null,
      description: job.job_description || 'No description available',
      created: job.job_posted_at_datetime_utc || new Date().toISOString(),
      tags: job.job_required_skills || [],
      requirements: job.job_required_skills || []
    }));

  } catch (error) {
    console.error('JSearch API error:', error.response?.data || error.message);

    // Try The Muse API as fallback
    try {
      const museResponse = await axios.get('https://www.themuse.com/api/public/jobs', {
        params: {
          page: page,
          desc: query,
          location: country === 'gb' ? 'United Kingdom' :
                   country === 'us' ? 'United States' :
                   country === 'de' ? 'Germany' :
                   country === 'fr' ? 'France' : ''
        }
      });

      return museResponse.data.results.map(job => ({
        id: `muse-${job.id}`,
        title: job.name,
        company: { display_name: job.company.name },
        location: { display_name: job.locations.length > 0 ?
          job.locations[0].name : 'Remote' },
        salary_min: 0,
        redirect_url: job.refs.landing_page,
        description: job.contents,
        created: job.publication_date,
        tags: job.tags.map(tag => tag.name),
        requirements: job.tags.map(tag => tag.name)
      }));

    } catch (museError) {
      console.error('Muse API error:', museError.message);

      // Final fallback to mock data
      console.log('Using mock data as final fallback');
      return [{
        id: 'mock1',
        title: 'Mock Developer Job',
        company: { display_name: 'Mock Company' },
        location: { display_name: 'Mock City' },
        salary_min: 50000,
        redirect_url: 'https://example.com',
        description: 'This is a mock job for development purposes.',
        created: new Date().toISOString(),
        tags: ['mock', 'developer'],
        requirements: ['mock', 'developer']
      }];
    }
  }
}

module.exports = { fetchJobs };
