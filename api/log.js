const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const axios = require('axios');

module.exports = async (req, res) => {
  // CORS header setup for GH Pages
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Secrets from Vercel Environment Variables
  const consumerKey = process.env.OC_CONSUMER_KEY;
  const consumerSecret = process.env.OC_CONSUMER_SECRET;
  const userToken = process.env.OC_TOKEN;
  const userSecret = process.env.OC_SECRET;
  const cacheCode = process.env.OC_CACHE_CODE || 'OC18915';

  if (!consumerKey || !consumerSecret || !userToken || !userSecret) {
    return res.status(500).json({ error: 'Server configuration missing: OC secrets' });
  }

  const oauth = OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
      return crypto.createHmac('sha1', key).update(base_string).digest('base64');
    },
  });

  const request_data = {
    url: 'https://www.opencaching.de/okapi/services/logs/submit',
    method: 'POST',
    data: {
      cache_code: cacheCode,
      logtype: 'Found it',
      comment: '👋 Automatisch geloggt via Pose Web App (Wink-Detektion)',
      comment_format: 'plaintext'
    },
  };

  const token = { key: userToken, secret: userSecret };

  try {
    const response = await axios({
      url: request_data.url,
      method: request_data.method,
      params: oauth.authorize(request_data, token),
      data: new URLSearchParams(request_data.data).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    res.status(200).json({ success: true, result: response.data });
  } catch (error) {
    console.error('OKAPI Error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to log to OpenCaching', 
      details: error.response?.data?.error?.message || error.message 
    });
  }
};
