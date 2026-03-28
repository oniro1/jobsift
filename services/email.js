const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const sendWelcomeEmail = async (email, name) => {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('SendGrid not configured, skipping email');
    return;
  }
  const msg = {
    to: email,
    from: process.env.FROM_EMAIL || 'noreply@jobaggregator.com',
    subject: 'Welcome to JobSift!',
    html: `
      <h1>Welcome ${name}!</h1>
      <p>Thank you for joining JobSift. Start searching for your dream job today.</p>
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}">Get Started</a>
    `,
  };
  await sgMail.send(msg);
};

const sendJobAlert = async (email, jobs) => {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('SendGrid not configured, skipping email');
    return;
  }
  const jobList = jobs.map(job => `<li><a href="${job.url}">${job.title}</a> at ${job.company}</li>`).join('');

  const msg = {
    to: email,
    from: process.env.FROM_EMAIL || 'noreply@jobaggregator.com',
    subject: 'New Jobs Matching Your Criteria',
    html: `
      <h2>New Job Matches</h2>
      <ul>${jobList}</ul>
      <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}">View All Jobs</a></p>
    `,
  };
  await sgMail.send(msg);
};

module.exports = { sendWelcomeEmail, sendJobAlert };