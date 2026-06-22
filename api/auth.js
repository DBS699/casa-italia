// GitHub OAuth — step 1: redirect the CMS popup to GitHub's authorize page.
// Requires env var GITHUB_CLIENT_ID (set in the Vercel project).
export default function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    res.statusCode = 500;
    res.end('GITHUB_CLIENT_ID is not configured in this Vercel project.');
    return;
  }
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers.host;
  const redirectUri = `${proto}://${host}/api/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'repo',
    redirect_uri: redirectUri,
  });
  res.writeHead(302, { Location: `https://github.com/login/oauth/authorize?${params}` });
  res.end();
}
