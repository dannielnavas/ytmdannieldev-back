import { Innertube, UniversalCache, ClientType } from 'youtubei.js';

const yt = await Innertube.create({
  cache: new UniversalCache(false),
  client_type: ClientType.IOS,
});

const info = await yt.getBasicInfo('dQw4w9WgXcQ');
const audio = (info.streaming_data?.adaptive_formats || []).filter((f) =>
  f.mime_type?.includes('audio'),
)[0];
const url = audio.url ?? (await audio.decipher(yt.session.player));

const chromeLike = {
  Range: 'bytes=0-',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

const res1 = await fetch(url, { headers: chromeLike });
console.log('WITH Range bytes=0-  ->', res1.status, res1.headers.get('content-type'), res1.headers.get('content-range'));

const res2 = await fetch(url, {
  headers: { ...chromeLike, Origin: 'http://localhost:4200' },
});
console.log('WITH Origin:4200     ->', res2.status, res2.headers.get('content-type'));

const res3 = await fetch(url, { headers: { ...chromeLike, Range: 'bytes=0-100' } });
console.log('Range bytes=0-100    ->', res3.status, res3.headers.get('content-type'), res3.headers.get('content-range'));