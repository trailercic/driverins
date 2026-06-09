const SHEET_ID = '1YToD-mn3_TfQZ2z44F-tOoOsjHrohmse0tIluzxcktI';
const CLIENT_EMAIL = 'driverinsp-app@driverinsp.iam.gserviceaccount.com';
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDZPLBO82rN4qUE
wzCLXFyNC3M3m8EHuiUyypnDvSviJOi6plx3q7wlsGML3Nz1epUpHzPfgP//JGvK
o0FR4z8YwP32F/XgIs+j2RvSnZWiib88qmsEOIv/hYxgj08ONo6DyFO8zSCb+YGO
EAXLnKGeSOJ7eCiV3IZ17gjYMhloF43KQKF7xN2T7J5p+Jmcv145/D0jHZu3nork
Z84NiQUlrd51r24NiBzxJeBSyqlObh/BygextGDaZ6CFc+haeGbvPuRPUOe/wAXD
zDO10/yfF6GIGPa6dIQXSfCQFlE2CRTbfsuO6YK7ceU+WKQgnQ+ROKRn6bDyNSt7
W+beIAMTAgMBAAECggEABTL7I0CXJ0tL2MPVJxi0TFngTY3oPkeZuU/5AyLFaJmq
ikEOCH0vORWyISgNj8B5zmylQK2lMtWL0OM8XnnaWjzQNzIWm+EpaAn7rPxBhwzV
611Gx2iVDS4EkJENetEacxP50RR1udXsYFqI0Pk0MwYaiYr0KbYH782dH5N/YSrX
2ircAa007HdtzRZJWB535/eqm0UNM5tV+JEhUPwcuGVQNLBykWpww7vM7gJSInsj
cLoiPckh20jbXliIWt1Doue4NFFLBAZkzA5agDwER5WCWRs80EwG3KB200M10gpt
i268YQ2ik3aSe4t2noah19ATeY+BEybvygriaMFYsQKBgQDzeN9Hw8gGihuYyftu
bSLZFOk3Vw54JcxNvAQjPJ8Y3KoJUPeYUl/Al/maFqkul2b5TwxtSe5JxnfwHIeQ
ZkbsSQNRQBXyJwv05pDFqMNxZd3eeT2NlJLkHVG2DRQYOP6Zm+0OlNotwwrEW44w
4t/0u7q1uV0IOgLh/ItytZy0sQKBgQDkajxasS3zaL/CYOSI4sS/gQh7uqav6DyP
RRkt8GzzI41SvFF1S1rtaqBK1f//RsY0Qv0ZJ1M/FCVxYF7i8mDkdytRHYMLlBEL
fIDzDjRJBiyiZYJkFS2TI54PoZr6B11MWOc2CKpIJF1YMjPw1eTeX1a21zFml7cS
Fn4e20V1AwKBgCqPNniVAKIkAi7zH8Bt02me/iVuUlkuQkhUVWTTc/wklpSKUr2N
qK9B4Z/N1kUOsjFiYAm6oqzCxLR0SD41orArEylgynVJ3g0xQJ1Mot1vsRjymI/n
KMY3WdE4+ApD7D1txEKIQps9POSWHITvI7bkGf8qJ9kISvi17KpglMQBAoGAIIyO
+zGCZcxIfy+FgYgnF08Q4WjQtgJ3Fsd29hfrvp4TVnXlebx6QZjPLLrgFwWD2xCs
tnfnIfcB+u0LuHVnn0boElANS4oW/7cHPRuKEdniZGXotdBaxTvvGzUhO33vKqEE
mauUcGFWN+o3gptIWPPnDHkP3hnCib5QzJ7cf/cCgYBYNf3Pc5+eVx4DPuPkjgG6
npk3anhWaxPxeRXCxW6LICkaQbvYYYSgZC3v5+LwQKfkDfo9jlveWb+uo1tbL/03
aLUSPSlYjdHrzX/OdCr+9tEVXua8oH9VmTEP5kKMQGMImO0RtEf6KKKDTNvfS++G
eZxB0x4HTC3iQpmieYBxFQ==
-----END PRIVATE KEY-----`;

const crypto = require('crypto');

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }));

  const sigInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(sigInput);
  const signature = sign.sign(PRIVATE_KEY, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = `${sigInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Auth failed: ' + JSON.stringify(data));
  return data.access_token;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { action, data } = JSON.parse(event.body);
    const token = await getAccessToken();

    // ── ENSURE HEADER ──
    async function ensureHeader() {
      const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A1:F1`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const d = await r.json();
      if (!d.values || d.values.length === 0) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A1:F1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [['Date & Time', 'Full Name', 'Truck Number', 'Trailer Number', 'Truck Photos', 'Trailer Photos']] })
        });
      }
    }

    if (action === 'upload_image') {
      // Upload image to Drive
      const { base64, mimeType, filename } = data;
      const boundary = 'boundary123456789';
      const meta = JSON.stringify({ name: filename, mimeType });
      const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`;

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.id) throw new Error('Upload failed: ' + JSON.stringify(uploadData));

      // Make public
      await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ url: `https://drive.google.com/uc?id=${uploadData.id}` })
      };
    }

    if (action === 'append_row') {
      await ensureHeader();
      const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [data.row] })
        }
      );
      const appendData = await appendRes.json();
      return { statusCode: 200, headers, body: JSON.stringify(appendData) };
    }

    if (action === 'get_rows') {
      const r = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A1:Z1000`,
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
      const d = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify(d) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
