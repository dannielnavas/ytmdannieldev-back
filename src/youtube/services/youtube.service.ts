import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../../users/services/users/users.service.js';
import YTMusic from 'ytmusic-api';

import crypto from 'crypto';
import { Cookie, CookieJar } from 'tough-cookie';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { Readable } from 'stream';
import { ClientType, Innertube, Misc, Platform, UniversalCache } from 'youtubei.js';

@Injectable()
export class YoutubeService implements OnModuleInit {
  private ytmusic = new YTMusic();
  yt: Innertube;

  async onModuleInit() {
    Platform.shim.eval = async (data: any) => new Function(data.output)();
    await this.ytmusic.initialize(); // solo una vez
    this.yt = await Innertube.create({
      cache: new UniversalCache(false),
    });
  }

  constructor(private readonly usersService: UsersService) {}

  async getDashboardData(userId: number) {
    const rawCookies =
      await this.usersService.findByIdReturnYoutubeCookie(userId);

    if (!rawCookies) {
      throw new UnauthorizedException('No cookies found for user');
    }

    const cleanCookies = rawCookies.replace(/(\r\n|\n|\r)/gm, '').trim();

    try {
      const ytmusic = new YTMusic();
      await ytmusic.initialize({ GL: 'CO', HL: 'es' });

      const session = ytmusic as unknown as {
        cookiejar: CookieJar;
        client: AxiosInstance;
      };

      // --- cookies en dominio correcto (music.youtube.com) ---
      for (const cookieStr of cleanCookies.split('; ')) {
        const cookie = Cookie.parse(cookieStr);
        if (cookie) {
          session.cookiejar.setCookieSync(cookie, 'https://music.youtube.com/');
        }
      }

      // --- SAPISIDHASH ---
      const sapisidMatch = cleanCookies.match(
        /(?:SAPISID|__Secure-3PAPISID)=([^;]+)/,
      );
      const sapisid = sapisidMatch?.[1]?.trim();

      const origin = 'https://music.youtube.com';

      const getSapisidHash = (sapisid: string): string => {
        const timestamp = Math.floor(Date.now() / 1000);
        const sha1 = crypto.createHash('sha1');
        sha1.update(`${timestamp} ${sapisid} ${origin}`);
        return `${timestamp}_${sha1.digest('hex')}`;
      };

      // --- interceptor en axios: Authorization + headers de identidad ---
      session.client.interceptors.request.use((req) => {
        req.headers['cookie'] = cleanCookies;
        req.headers['origin'] = origin;
        req.headers['referer'] = `${origin}/`;
        if (sapisid) {
          req.headers['authorization'] =
            `SAPISIDHASH ${getSapisidHash(sapisid)}`;
          req.headers['x-origin'] = origin;
          req.headers['x-goog-authuser'] = '0';
        }
        return req;
      });

      const playlists = await ytmusic.getHomeSections();
      return playlists;
    } catch (error) {
      console.error('Error initializing YTMusic with cookies:', error);
      throw new InternalServerErrorException(
        'Could not fetch YouTube Music dashboard',
      );
    }
  }

  async search(query: string) {
    const songs = await this.ytmusic.searchSongs(query); // title, artist, album, duration, thumbnail...
    const playlists = await this.ytmusic.searchPlaylists(query);
    const artists = await this.ytmusic.searchArtists(query);
    const albums = await this.ytmusic.searchAlbums(query);
    return { songs, playlists, artists, albums };
  }

  async getAudioStream(videoId: string): Promise<Misc.Format> {
    const cleanId = videoId.replace(/^RDAM(?:VM|PL)/, '');

    // 1. Intentar con cookies del usuario (YTMUSIC) para evitar bloqueos por IP de datacenter en Vercel
    try {
      const rawCookie = await this.usersService.findFirstYoutubeCookie();
      if (rawCookie) {
        const cleanCookie = rawCookie.replace(/(\r\n|\n|\r)/gm, '').trim();
        const authedYt = await Innertube.create({
          cache: new UniversalCache(false),
          cookie: cleanCookie,
          location: 'CO',
          lang: 'es',
        });
        const info = await authedYt.getBasicInfo(cleanId, {
          client: 'YTMUSIC',
        } as any);
        if (info.streaming_data) {
          let format = info.chooseFormat({ type: 'audio', quality: 'best' });
          if (!format) {
            const audioFormats = (
              info.streaming_data?.adaptive_formats || []
            ).filter((f) => f.mime_type?.includes('audio'));
            if (audioFormats.length > 0) {
              format = audioFormats[0];
            }
          }
          if (format) {
            this.yt = authedYt;
            return format;
          }
        }
      }
    } catch (err) {
      console.warn('Fallo stream autenticado con YTMUSIC:', err);
    }

    // 2. Fallback sin cookies utilizando clientes móviles
    if (!this.yt) {
      this.yt = await Innertube.create({
        cache: new UniversalCache(false),
        location: 'CO',
        lang: 'es',
      });
    }

    const clients: (string | undefined)[] = [
      'IOS',
      'ANDROID',
      'TV_EMBEDDED',
      'WEB_EMBEDDED',
      undefined,
      'VISIONOS',
    ];

    const errors: Record<string, string> = {};
    for (const client of clients) {
      try {
        const opts: any = client ? { client } : {};
        const info = await this.yt.getBasicInfo(cleanId, opts);
        if (info.streaming_data) {
          let format = info.chooseFormat({ type: 'audio', quality: 'best' });
          if (!format) {
            const audioFormats = (
              info.streaming_data?.adaptive_formats || []
            ).filter((f) => f.mime_type?.includes('audio'));
            if (audioFormats.length > 0) {
              format = audioFormats[0];
            }
          }
          if (format) {
            return format;
          } else {
            errors[client || 'default'] =
              'streaming_data present but no audio format found';
          }
        } else {
          errors[client || 'default'] = 'no streaming_data';
        }
      } catch (err: any) {
        errors[client || 'default'] = err?.message || String(err);
      }
    }

    throw new InternalServerErrorException(
      `No audio stream found for video ${cleanId}: ${JSON.stringify(errors)}`,
    );
  }

  async getMetadata(videoId: string) {
    const info = await this.yt.getInfo(videoId);

    return {
      title: info.basic_info.title,
      duration: info.basic_info.duration, // en segundos (number)
      thumbnail: info.basic_info.thumbnail?.[0]?.url,
      channel: info.basic_info.channel?.name,
      author: info.basic_info.author,
      viewCount: info.basic_info.view_count,
    };
  }

  async viewPlaylist(playlistId: string) {
    const playListData = await this.ytmusic.getPlaylist(playlistId);
    const songsOfThePlaylist = await this.ytmusic.getPlaylistVideos(
      playListData.playlistId,
    );
    return {
      infoPlaylist: playListData,
      songsList: songsOfThePlaylist,
    };
  }

  async viewAlbum(albumId: string) {
    return this.ytmusic.getAlbum(albumId);
  }
}
