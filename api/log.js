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
      comment_format: 'plaintext',
      oauth_version: '1.0'
    },
  };

  const token = { key: userToken, secret: userSecret };

  try {
    // Calculate signature including body data
    const oauthData = oauth.authorize(request_data, token);
    
    // Combine all parameters into the body, matching Android logic
    const fullBody = { ...request_data.data, ...oauthData };
    
    console.log('Submitting log for', cacheCode);
    
    const logResponse = await axios({
      url: request_data.url,
      method: 'POST',
      data: new URLSearchParams(fullBody).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'OpenClaw-Pose-WebApp/1.0'
      },
      timeout: 10000
    });

    const logUuid = logResponse.data.log_uuid;
    console.log('Log submitted, UUID:', logUuid);

    // Image upload (matches Android behavior)
    if (logUuid && req.body.image) {
      const base64Image = req.body.image.replace(/^data:image\/jpeg;base64,/, "");
      const image_request = {
        url: 'https://www.opencaching.de/okapi/services/logs/images/add',
        method: 'POST',
        data: {
          log_uuid: logUuid,
          caption: 'Pose Web App Overlay',
          image: base64Image,
          is_spoiler: 'false',
          oauth_version: '1.0'
        }
      };
      
      const imageOauth = oauth.authorize(image_request, token);
      const imageBody = { ...image_request.data, ...imageOauth };
      
      console.log('Uploading image...');
      await axios({
        url: image_request.url,
        method: 'POST',
        data: new URLSearchParams(imageBody).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'OpenClaw-Pose-WebApp/1.0'
        },
        timeout: 15000
      });
      console.log('Image uploaded successfully');
    }

    res.status(200).json({ success: true, log_uuid: logUuid });
  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error('OKAPI Error:', JSON.stringify(errorDetails));
    res.status(500).json({ 
      error: 'Failed to log to OpenCaching', 
      details: errorDetails
    });
  }
};
