import { YoutubeService } from './dist/youtube/services/youtube.service.js';

const cookies = `HSID=AkfmcdTOSacWt-vcP; SSID=Ade2HLHqJ4Do8qoEh; APISID=iQPGpsOQ9XAxQxm8/AHaHat_3VxUBCefIX; SAPISID=W9Ce5knhLAhIfhcy/ABpAuFTHJy7tMdeTU; __Secure-1PAPISID=W9Ce5knhLAhIfhcy/ABpAuFTHJy7tMdeTU; __Secure-3PAPISID=W9Ce5knhLAhIfhcy/ABpAuFTHJy7tMdeTU; SID=g.a000CQn5uJe9utL5dAcZMTR8xRj0H4EX9SZdKer5w4kLT9udxKO4jFyP-xKanRjzlmg9H84gBgACgYKAeYSARcSFQHGX2Mi99S0-4U7QeFf3ommsQ984BoVAUF8yKqKQFYtMrTJIB932TSPXMGC0076; __Secure-1PSID=g.a000CQn5uJe9utL5dAcZMTR8xRj0H4EX9SZdKer5w4kLT9udxKO4v0UzZJGAZ1K6uZjSVLubpQACgYKAbUSARcSFQHGX2MiSykgNBmwNyR8MfUmFAvaKhoVAUF8yKqfduNusl4Pc2jHHjDK9wz00076; __Secure-3PSID=g.a000CQn5uJe9utL5dAcZMTR8xRj0H4EX9SZdKer5w4kLT9udxKO4D9yYYnDJ8Fq3xoEXtcCDigACgYKAcESARcSFQHGX2MiAbe9035kucFBdX94vnbLYBoVAUF8yKphiDVMjvUCjTGBiOVGeSyt0076; PREF=f6=80; VISITOR_INFO1_LIVE=UjCJpmZ30xk; VISITOR_PRIVACY_METADATA=CgJDTxIEGgAgQg%3D%3D; __Secure-YNID=21.YT=MuQE-5dOQ81_XVrUiFNUZBwbrD3Y1Ygp8CeF4meV_j5mUiJsA7WmfzOq8a3kl49vKOXEUUgpKjaO9_xlpI2yL8VIFxxbY-Xf6Qg-g9PrVPlSQz0wTUglyGNWw3X6ap12ZFHm8BVpt-c0Rirs5VxupTQVgUM382fuE5Ala_ZNkeYE_m9haocCIkI6yD30G4kWD2fpuu8CtM2k33G2P7cLWOO7mT2THf0FP7iRmcx77CRKKZXOe8ElT5KkgCuVy7XdlpJkKvLLhGw6YjD9vcnj83IhDqyZus9QC2OOSMF39pkUsxHBsVnNRxVTnZxdQTwz3i7o4Vo-7pQVrzCZMChcuA; __Secure-ROLLOUT_TOKEN=CMnLweqnxtjbPhD2gYXRvdaWAxjxtOjd7t2WAw%3D%3D; __Secure-1PSIDTS=sidts-CjQBXMw41UoAc8hl0tMXRCAvCzyTzzQkBQ7cU-WGH4cJvpJ3zqZ1bYwut71YqE6oJ6Q_ca8GEAA; __Secure-3PSIDTS=sidts-CjQBXMw41UoAc8hl0tMXRCAvCzyTzzQkBQ7cU-WGH4cJvpJ3zqZ1bYwut71YqE6oJ6Q_ca8GEAA; YSC=ph4uhMBOcZg; SIDCC=AKEyXzXwg1WLbmoouqyOHaXn0lDOoJ10kCZjrmOKMkDm_hfx7By6ejWtcWk5C8iID6RUiQiO; __Secure-1PSIDCC=AKEyXzU5xCyJR1EcFH2UwWmyrab1dSLWL6iF42dzgzCro2FPfgQoLPRxfGYNFhsrsPF2C_cy; __Secure-3PSIDCC=AKEyXzVLgPu9alK3r0S_JnLGViFZ7A9vRjtH7OCVxOCGz9D2LXuISBqy3omZS_D0rryH3aUUew`;

const mockUsersService = {
  findByIdReturnYoutubeCookie: async () => cookies
};

const service = new YoutubeService(mockUsersService);

async function main() {
  const data = await service.getDashboardData(1);
  console.log('Returned dashboard sections count:', data.length);
  console.log('Sections:', data.map(s => `${s.title} (${s.contents.length} items)`));
}

main().catch(console.error);
