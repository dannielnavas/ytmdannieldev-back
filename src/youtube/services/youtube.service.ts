import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../../users/services/users/users.service.js';
import { YoutubeCache } from '../entities/youtube-cache.entity.js';
import YTMusic from 'ytmusic-api';

import crypto from 'crypto';
import { Cookie, CookieJar } from 'tough-cookie';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { Innertube, Misc, Platform, UniversalCache } from 'youtubei.js';
import config from '../../config.js';
import type { ConfigType } from '@nestjs/config';

@Injectable()
export class YoutubeService implements OnModuleInit {
  private ytmusic = new YTMusic();
  yt: Innertube;
  private readonly memoryCache = new Map<
    string,
    { data: any; expiresAt: number }
  >();

  async onModuleInit() {
    Platform.shim.eval = async (data: any) => new Function(data.output)();
    await this.ytmusic.initialize(); // solo una vez
    this.yt = await Innertube.create({
      cache: new UniversalCache(false),
    });
  }

  constructor(
    private readonly usersService: UsersService,
    @Inject(config.KEY)
    private readonly configService: ConfigType<typeof config>,
    @InjectRepository(YoutubeCache)
    private readonly youtubeCacheRepository: Repository<YoutubeCache>,
  ) {}

  async getDashboardData(userId: number, forceRefresh = false) {
    const memoryKey = `dashboard:${userId}`;
    const now = Date.now();

    // 1. Nivel 1: Caché en memoria caliente (0ms)
    if (!forceRefresh) {
      const memCached = this.memoryCache.get(memoryKey);
      if (memCached && memCached.expiresAt > now) {
        return memCached.data;
      }
    }

    // 2. Nivel 2: Caché persistente en base de datos PostgreSQL (<30ms)
    let existingCache: YoutubeCache | null = null;
    try {
      existingCache = await this.youtubeCacheRepository.findOne({
        where: { user_id: userId, cache_key: 'dashboard' },
      });

      if (
        !forceRefresh &&
        existingCache &&
        existingCache.expires_at &&
        existingCache.expires_at.getTime() > now
      ) {
        this.memoryCache.set(memoryKey, {
          data: existingCache.data,
          expiresAt: existingCache.expires_at.getTime(),
        });
        return existingCache.data;
      }
    } catch (dbErr) {
      console.warn('Error querying youtube cache from database:', dbErr);
    }

    // 3. Si no existe, expiró o se solicitó refresco forzado, consultar a YouTube Music
    const rawCookies =
      await this.usersService.findByIdReturnYoutubeCookie(userId);

    if (!rawCookies) {
      if (existingCache?.data) {
        return existingCache.data;
      }
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

      // 4. Guardar en caché de base de datos y memoria
      const ttlHours = this.configService.youtubeCacheTtlHours || 6;
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

      try {
        if (existingCache) {
          existingCache.data = playlists;
          existingCache.expires_at = expiresAt;
          await this.youtubeCacheRepository.save(existingCache);
        } else {
          const newCache = this.youtubeCacheRepository.create({
            user_id: userId,
            cache_key: 'dashboard',
            data: playlists,
            expires_at: expiresAt,
          });
          await this.youtubeCacheRepository.save(newCache);
        }
      } catch (saveErr) {
        console.warn('Error saving youtube cache to database:', saveErr);
      }

      this.memoryCache.set(memoryKey, {
        data: playlists,
        expiresAt: expiresAt.getTime(),
      });

      return playlists;
    } catch (error) {
      console.error('Error fetching YouTube Music dashboard:', error);

      // Resiliencia: Devolver caché previa aunque haya expirado si la API de YouTube falla
      if (existingCache?.data) {
        console.warn('Falling back to existing youtube cache due to API error');
        return existingCache.data;
      }

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

  async getLyrics(track_name: string, artist_name: string) {
    if (!track_name) {
      throw new BadRequestException(`track_name is required`);
    }
    if (!artist_name) {
      throw new BadRequestException(`artist_name is required`);
    }
    // Sometimes youtube artist names have " - Topic" or other suffixes. Let's clean it up slightly if needed.
    const cleanArtist = artist_name.replace(/ - Topic$/, '').trim();
    console.log('track_name', track_name);
    console.log('artist_name', cleanArtist);

    // remover la parte de "(Official (Video) (Lyric)" etc, buscar el primer parentesis y todo lo que este despues se elimina
    const clearTrackName = track_name.split('(')[0].split(')')[0].trim();

    console.log('clearTrackName', clearTrackName.trim());
    console.log(this.configService.lrcLibUrl);
    try {
      const response = await axios.get(
        this.configService.lrcLibUrl || 'https://lrclib.net/api/get',
        {
          params: {
            track_name: clearTrackName,
            artist_name: cleanArtist,
          },
        },
      );
      console.log('Lyrics fetched:', response.data);
      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new NotFoundException('Lyrics not found');
        }
        throw new BadGatewayException(
          error.response?.data?.message ||
            'Error fetching lyrics from provider',
        );
      }
      throw error;
    }
  }
}
