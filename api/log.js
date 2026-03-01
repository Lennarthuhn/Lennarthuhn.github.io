const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const axios = require('axios');

module.exports = async (req, res) => {
  // CORS header setup for GH Pages
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', 'https://lennarthuhn.github.io');
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
  const cacheCode = process.env.OC_CACHE_CODE || 'OC18AA4';

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
      logtype: 'Comment',
      comment: '👋 Automatisch geloggt via Pose Web App (Wink-Detektion)',
      comment_format: 'plaintext'
    },
  };

  const token = { key: userToken, secret: userSecret };

  try {
    // Combine OAuth parameters and data into the body, exactly like the Android App
    const oauthData = oauth.authorize(request_data, token);
    const fullBody = { ...request_data.data, ...oauthData };
    
    const logResponse = await axios({
      url: request_data.url,
      method: request_data.method,
      data: new URLSearchParams(fullBody).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const logUuid = logResponse.data.log_uuid;

    // Optional: Image upload if image is provided (matches Android behavior)
    if (logUuid && req.body.image) {
      const base64Image = req.body.image.replace(/^data:image\/jpeg;base64,/, "");
      const image_request = {
        url: 'https://www.opencaching.de/okapi/services/logs/images/add',
        method: 'POST',
        data: {
          log_uuid: logUuid,
          caption: 'Pose Web App Overlay',
          image: base64Image,
          is_spoiler: 'false'
        }
      };
      const imageOauth = oauth.authorize(image_request, token);
      await axios({
        url: image_request.url,
        method: 'POST',
        data: new URLSearchParams({ ...image_request.data, ...imageOauth }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
    }

    res.status(200).json({ success: true, result: logResponse.data });
  } catch (error) {
    console.error('OKAPI Error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to log to OpenCaching', 
      details: error.response?.data?.error?.message || error.message 
    });
  }
};
