// GitHub OAuth — step 2: exchange the code for a token and hand it back to the
// CMS popup via postMessage (the Decap/Sveltia protocol).
// Requires env vars GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET (set in Vercel).
export default async function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const provider = 'github';
  const code = req.query && req.query.code;

  const respond = (status, payload) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      `<!doctype html><html><body><script>
        (function () {
          function receive(e) {
            window.opener && window.opener.postMessage(
              'authorization:${provider}:${status}:${payload}', e.origin
            );
            window.removeEventListener('message', receive, false);
          }
          window.addEventListener('message', receive, false);
          window.opener && window.opener.postMessage('authorizing:${provider}', '*');
        })();
      </script></body></html>`
    );
  };

  if (!clientId || !clientSecret) {
    res.statusCode = 500;
    res.end('GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are not configured in this Vercel project.');
    return;
  }
  if (!code) {
    res.statusCode = 400;
    res.end('Missing ?code from GitHub.');
    return;
  }

  try {
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const data = await r.json();
    if (data.access_token) {
      respond('success', JSON.stringify({ token: data.access_token, provider }));
    } else {
      respond('error', JSON.stringify({ error: data.error_description || 'No access token returned' }));
    }
  } catch (e) {
    respond('error', JSON.stringify({ error: String(e) }));
  }
}
