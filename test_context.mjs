import YTMusic from 'ytmusic-api';
import crypto from 'crypto';

const rawCookies = `HSID=AkfmcdTOSacWt-vcP; SSID=Ade2HLHqJ4Do8qoEh; APISID=iQPGpsOQ9XAxQxm8/AHaHat_3VxUBCefIX; SAPISID=W9Ce5knhLAhIfhcy/ABpAuFTHJy7tMdeTU; __Secure-1PAPISID=W9Ce5knhLAhIfhcy/ABpAuFTHJy7tMdeTU; __Secure-3PAPISID=W9Ce5knhLAhIfhcy/ABpAuFTHJy7tMdeTU; SID=g.a000CQn5uJe9utL5dAcZMTR8xRj0H4EX9SZdKer5w4kLT9udxKO4jFyP-xKanRjzlmg9H84gBgACgYKAeYSARcSFQHGX2Mi99S0-4U7QeFf3ommsQ984BoVAUF8yKqKQFYtMrTJIB932TSPXMGC0076; __Secure-1PSID=g.a000CQn5uJe9utL5dAcZMTR8xRj0H4EX9SZdKer5w4kLT9udxKO4v0UzZJGAZ1K6uZjSVLubpQACgYKAbUSARcSFQHGX2MiSykgNBmwNyR8MfUmFAvaKhoVAUF8yKqfduNusl4Pc2jHHjDK9wz00076; __Secure-3PSID=g.a000CQn5uJe9utL5dAcZMTR8xRj0H4EX9SZdKer5w4kLT9udxKO4D9yYYnDJ8Fq3xoEXtcCDigACgYKAcESARcSFQHGX2MiAbe9035kucFBdX94vnbLYBoVAUF8yKphiDVMjvUCjTGBiOVGeSyt0076; PREF=f6=80; VISITOR_INFO1_LIVE=UjCJpmZ30xk; VISITOR_PRIVACY_METADATA=CgJDTxIEGgAgQg%3D%3D; __Secure-YNID=21.YT=MuQE-5dOQ81_XVrUiFNUZBwbrD3Y1Ygp8CeF4meV_j5mUiJsA7WmfzOq8a3kl49vKOXEUUgpKjaO9_xlpI2yL8VIFxxbY-Xf6Qg-g9PrVPlSQz0wTUglyGNWw3X6ap12ZFHm8BVpt-c0Rirs5VxupTQVgUM382fuE5Ala_ZNkeYE_m9haocCIkI6yD30G4kWD2fpuu8CtM2k33G2P7cLWOO7mT2THf0FP7iRmcx77CRKKZXOe8ElT5KkgCuVy7XdlpJkKvLLhGw6YjD9vcnj83IhDqyZus9QC2OOSMF39pkUsxHBsVnNRxVTnZxdQTwz3i7o4Vo-7pQVrzCZMChcuA; __Secure-ROLLOUT_TOKEN=CMnLweqnxtjbPhD2gYXRvdaWAxjxtOjd7t2WAw%3D%3D; __Secure-1PSIDTS=sidts-CjQBXMw41UoAc8hl0tMXRCAvCzyTzzQkBQ7cU-WGH4cJvpJ3zqZ1bYwut71YqE6oJ6Q_ca8GEAA; __Secure-3PSIDTS=sidts-CjQBXMw41UoAc8hl0tMXRCAvCzyTzzQkBQ7cU-WGH4cJvpJ3zqZ1bYwut71YqE6oJ6Q_ca8GEAA; YSC=ph4uhMBOcZg; SIDCC=AKEyXzXwg1WLbmoouqyOHaXn0lDOoJ10kCZjrmOKMkDm_hfx7By6ejWtcWk5C8iID6RUiQiO; __Secure-1PSIDCC=AKEyXzU5xCyJR1EcFH2UwWmyrab1dSLWL6iF42dzgzCro2FPfgQoLPRxfGYNFhsrsPF2C_cy; __Secure-3PSIDCC=AKEyXzVLgPu9alK3r0S_JnLGViFZ7A9vRjtH7OCVxOCGz9D2LXuISBqy3omZS_D0rryH3aUUew`;

function getSapisidHash(sapisid, origin = 'https://music.youtube.com') {
  const timestamp = Math.floor(Date.now() / 1000);
  const sha1 = crypto.createHash('sha1');
  sha1.update(`${timestamp} ${sapisid} ${origin}`);
  return `${timestamp}_${sha1.digest('hex')}`;
}

async function test() {
  const yt = new YTMusic();

  const sapisidMatch = rawCookies.match(/(?:__Secure-3PAPISID|__Secure-1PAPISID|SAPISID)=([^;]+)/);
  const sapisid = sapisidMatch ? sapisidMatch[1].trim() : null;

  yt.client.interceptors.request.use((req) => {
    req.headers['cookie'] = rawCookies;
    req.headers['origin'] = 'https://music.youtube.com';
    req.headers['referer'] = 'https://music.youtube.com/';
    if (sapisid) {
      const auth = `SAPISIDHASH ${getSapisidHash(sapisid, 'https://music.youtube.com')}`;
      req.headers['authorization'] = auth;
      req.headers['X-Origin'] = 'https://music.youtube.com';
      req.headers['X-Goog-AuthUser'] = '0';
    }
    return req;
  });

  await yt.initialize({ GL: 'CO', HL: 'es' });

  console.log('INNERTUBE_CONTEXT:', JSON.stringify(yt.config.INNERTUBE_CONTEXT, null, 2));
}

test().catch(console.error);
