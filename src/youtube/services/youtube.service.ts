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
import axios from 'axios';
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
  private readonly authedInnertubeCache = new Map<
    string,
    { client: Innertube; expiresAt: number }
  >();
  private readonly playlistCache = new Map<
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

  async getAuthedInnertubeByCookie(
    cookieStr: string,
  ): Promise<Innertube | null> {
    if (!cookieStr) return null;
    const cleanCookie = cookieStr.replace(/(\r\n|\n|\r)/gm, '').trim();
    if (!cleanCookie) return null;

    const cookieHash = crypto
      .createHash('md5')
      .update(cleanCookie)
      .digest('hex');
    const cached = this.authedInnertubeCache.get(cookieHash);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.client;
    }

    try {
      Platform.shim.eval = async (data: any) => new Function(data.output)();
      const client = await Innertube.create({
        cache: new UniversalCache(false),
        cookie: cleanCookie,
        location: 'CO',
        lang: 'es',
      });
      this.authedInnertubeCache.set(cookieHash, {
        client,
        expiresAt: now + 30 * 60 * 1000, // 30 minutos
      });
      return client;
    } catch (err) {
      console.warn('Error creating authed Innertube:', err);
      return null;
    }
  }

  async getAuthedInnertube(userId: number): Promise<Innertube | null> {
    const rawCookies =
      await this.usersService.findByIdReturnYoutubeCookie(userId);
    if (!rawCookies) return null;
    return this.getAuthedInnertubeByCookie(rawCookies);
  }

  private filterDashboardSections(
    sections: any[],
    userPlaylistIds: Set<string> = new Set(),
  ) {
    if (!Array.isArray(sections)) return [];

    const communitySectionRegex = /comunidad|community/i;

    return sections
      .filter((sec: any) => !communitySectionRegex.test(sec.title || ''))
      .map((sec: any) => {
        const cleanContents = (sec.contents || [])
          .filter(Boolean)
          .filter((item: any) => {
            if (item.type === 'SONG') {
              return Boolean(item.videoId && item.name);
            }
            if (item.type === 'ALBUM') {
              return Boolean(item.name);
            }
            if (item.type === 'PLAYLIST') {
              const plId = item.playlistId || '';
              const isUserPl = userPlaylistIds.has(plId.replace(/^VL/, ''));
              const isMixOrRadio =
                plId.startsWith('RD') ||
                /mix|radio|supermix|tu mezcla/i.test(item.name || '');
              const isRecap =
                plId.startsWith('RDRC') ||
                /recap|resumen/i.test(item.name || '');
              return isUserPl || isMixOrRadio || isRecap;
            }
            return false;
          });

        return {
          title: sec.title,
          contents: cleanContents,
        };
      })
      .filter((sec: any) => sec.contents && sec.contents.length > 0);
  }

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

    try {
      const userProfile = await this.usersService
        .findById(userId)
        .catch(() => null);

      // A. Cliente Innertube autenticado (reutilizado desde pool/cache para <5ms)
      const authedYtPromise = this.getAuthedInnertube(userId);

      // B. Secciones estándar de YouTube Music vía cliente ytmusic existente (con timeout de 3.5s para no retrasar)
      const ytmusicPromise = (async () => {
        try {
          return await Promise.race([
            this.ytmusic.getHomeSections(),
            new Promise<any[]>((resolve) =>
              setTimeout(() => resolve([]), 3500),
            ),
          ]);
        } catch (err) {
          console.warn('Error fetching ytmusic.getHomeSections:', err);
          return [];
        }
      })();

      const [authedYt, ytHomeSections] = await Promise.all([
        authedYtPromise,
        ytmusicPromise,
      ]);

      // Consultar biblioteca, feed personal y recap en paralelo si authedYt está disponible
      let library: any = null;
      let feed: any = null;
      let recap: any = null;
      if (authedYt) {
        const [libRes, feedRes, recapRes] = await Promise.all([
          authedYt.music.getLibrary().catch((e: any) => {
            console.warn('Error getting user library:', e?.message || e);
            return null;
          }),
          authedYt.music.getHomeFeed().catch((e: any) => {
            console.warn('Error getting home feed:', e?.message || e);
            return null;
          }),
          authedYt.music.getRecap().catch(() => null),
        ]);
        library = libRes;
        feed = feedRes;
        recap = recapRes;
      }

      // 1. Extraer playlists que le pertenecen al usuario logueado
      const rawUserPlaylists = (library?.contents?.[0]?.items || []).filter(
        (item: any) => {
          const id = item.id || '';
          return (
            id &&
            id !== 'VLSE' &&
            !id.startsWith('SE') &&
            (item.item_type === 'playlist' ||
              item.type === 'MusicTwoRowItem' ||
              item.type === 'TwoRowItem' ||
              id.startsWith('VLPL') ||
              id.startsWith('PL'))
          );
        },
      );

      const userPlaylistIds = new Set<string>(
        rawUserPlaylists.map((p: any) => String(p.id || '').replace(/^VL/, '')),
      );

      const userPlaylists = rawUserPlaylists.map((item: any) => {
        const rawId = item.id || '';
        const plId = rawId.startsWith('VLPL')
          ? rawId.replace(/^VL/, '')
          : rawId;
        return {
          type: 'PLAYLIST' as const,
          playlistId: plId,
          name: item.title?.text || item.title?.toString() || 'Playlist',
          artist: {
            name: userProfile?.full_name || 'Tú',
            artistId: null,
          },
          thumbnails: this.parseThumbnails(item.thumbnails || item.thumbnail),
        };
      });

      // 2. Extraer secciones de Recap si están disponibles
      const recapSections: any[] = [];
      if (recap?.sections?.length) {
        for (const shelf of recap.sections) {
          const shelfTitle =
            (shelf as any)?.header?.title?.text ||
            (shelf as any)?.title?.text ||
            'Tu Recap';
          const rawItems =
            (shelf as any)?.contents || (shelf as any)?.items || [];
          const items = rawItems
            .map((item: any) => {
              const rawId = item.id || item.playlist_id || item.browse_id || '';
              const plId = rawId.startsWith('VL')
                ? rawId.replace(/^VL/, '')
                : rawId;
              if (!plId) return null;
              return {
                type: 'PLAYLIST' as const,
                playlistId: plId,
                name: item.title?.text || item.title?.toString() || 'Recap',
                artist: {
                  name:
                    item.subtitle?.text ||
                    item.author?.name ||
                    userProfile?.full_name ||
                    'YouTube Music',
                  artistId: item.author?.id || null,
                },
                thumbnails: this.parseThumbnails(
                  item.thumbnails || item.thumbnail,
                ),
              };
            })
            .filter((it: any) => Boolean(it && it.playlistId && it.name));

          if (items.length > 0) {
            recapSections.push({
              title: shelfTitle,
              contents: items,
            });
          }
        }
      }

      // 3. Extraer canciones recomendadas para este usuario
      let recommendedSongs: any[] = [];
      if (feed?.sections?.length) {
        const quickPicksShelf =
          feed.sections.find((s: any) => {
            const title = (
              s.header?.title?.text ||
              s.title?.text ||
              ''
            ).toLowerCase();
            return (
              title.includes('rápida') ||
              title.includes('quick') ||
              title.includes('canciones') ||
              title.includes('para ti') ||
              title.includes('escuchar')
            );
          }) ||
          feed.sections.find((s: any) => {
            const items = s.contents || s.items || [];
            return items.some(
              (it: any) =>
                it?.type === 'MusicResponsiveListItem' ||
                (it?.id && it?.artists),
            );
          }) ||
          feed.sections[0];

        const rawSongs = (
          quickPicksShelf?.contents ||
          quickPicksShelf?.items ||
          []
        ).filter((item: any) => item && (item.id || item.video_id));

        recommendedSongs = rawSongs
          .map((item: any) => ({
            type: 'SONG' as const,
            videoId: item.id || item.video_id,
            name:
              item.title?.text || item.title?.toString() || item.title || '',
            artist: this.parseArtist(
              item.artists?.[0] || item.author,
              'Artista desconocido',
            ),
            album: item.album
              ? {
                  name: item.album.name || item.album.title || '',
                  albumId: item.album.id || null,
                }
              : null,
            duration: this.parseDuration(item.duration),
            thumbnails: this.parseThumbnails(item.thumbnails || item.thumbnail),
          }))
          .filter((song: any) => Boolean(song.videoId && song.name));
      }

      // Si Innertube no devolvió canciones recomendadas, extraer canciones válidas de ytHomeSections
      if (recommendedSongs.length === 0 && ytHomeSections?.length) {
        for (const sec of ytHomeSections) {
          const songItems = (sec.contents || []).filter(
            (c: any) => c && c.type === 'SONG' && c.videoId && c.name,
          );
          if (songItems.length > 0) {
            recommendedSongs = songItems;
            break;
          }
        }
      }

      // 4. Filtrar secciones de YouTube omitiendo playlists de la comunidad o de otras personas
      const filteredYtSections = this.filterDashboardSections(
        ytHomeSections,
        userPlaylistIds,
      );

      // 5. Ensamblar la respuesta consolidada en orden prioritario:
      // 1° Canciones recomendadas para este usuario
      // 2° Secciones de Recap si existen
      // 3° Playlists pertenecientes al usuario logueado
      // 4° Mixes recomendados, radios y álbumes recomendados por YouTube
      const finalSections: any[] = [];

      if (recommendedSongs.length > 0) {
        finalSections.push({
          title: 'Canciones recomendadas',
          contents: recommendedSongs,
        });
      }

      if (recapSections.length > 0) {
        finalSections.push(...recapSections);
      }

      if (userPlaylists.length > 0) {
        finalSections.push({
          title: 'Tus listas de reproducción',
          contents: userPlaylists,
        });
      }

      finalSections.push(...filteredYtSections);

      // Si todo quedó vacío (caso extremo), intentar devolver fallback de caché filtrada
      if (finalSections.length === 0 && existingCache?.data) {
        return this.filterDashboardSections(
          existingCache.data,
          userPlaylistIds,
        );
      }

      // 6. Guardar en caché de base de datos y memoria
      const ttlHours = this.configService.youtubeCacheTtlHours || 6;
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

      try {
        if (existingCache) {
          existingCache.data = finalSections;
          existingCache.expires_at = expiresAt;
          await this.youtubeCacheRepository.save(existingCache);
        } else {
          const newCache = this.youtubeCacheRepository.create({
            user_id: userId,
            cache_key: 'dashboard',
            data: finalSections,
            expires_at: expiresAt,
          });
          await this.youtubeCacheRepository.save(newCache);
        }
      } catch (saveErr) {
        console.warn('Error saving youtube cache to database:', saveErr);
      }

      this.memoryCache.set(memoryKey, {
        data: finalSections,
        expiresAt: expiresAt.getTime(),
      });

      return finalSections;
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

  async getRecapData(userId: number, forceRefresh = false) {
    const memoryKey = `recap:${userId}`;
    const now = Date.now();

    if (!forceRefresh) {
      const memCached = this.memoryCache.get(memoryKey);
      if (memCached && memCached.expiresAt > now) {
        return memCached.data;
      }
    }

    let existingCache: YoutubeCache | null = null;
    try {
      existingCache = await this.youtubeCacheRepository.findOne({
        where: { user_id: userId, cache_key: 'recap' },
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
      console.warn('Error querying recap cache from database:', dbErr);
    }

    const authedYt = await this.getAuthedInnertube(userId);
    if (!authedYt) {
      if (existingCache?.data) {
        return existingCache.data;
      }
      throw new UnauthorizedException(
        'No cookies found for user to load recap',
      );
    }

    const userProfile = await this.usersService
      .findById(userId)
      .catch(() => null);

    try {
      const recap = await authedYt.music.getRecap().catch((e) => {
        console.warn('Error fetching recap from Innertube:', e?.message || e);
        return null;
      });

      if (!recap) {
        const emptyResponse = {
          available: false,
          message: 'Tu Recap no está disponible en este momento.',
          title: 'Tu Recap',
          playlist: null,
          sections: [],
        };
        return emptyResponse;
      }

      // 1. Extraer playlist principal de Recap si está disponible
      let recapPlaylist: any = null;
      try {
        const pl = await recap.getPlaylist();
        if (pl && pl.contents?.length) {
          recapPlaylist = this.formatInnertubePlaylist('recap', pl);
        }
      } catch {
        // Normal si no hay playlist de highlights lista
      }

      // 2. Extraer estantes de Recap
      const sections: any[] = [];
      if (recap.sections?.length) {
        for (const shelf of recap.sections) {
          const shelfTitle =
            (shelf as any)?.header?.title?.text ||
            (shelf as any)?.title?.text ||
            'Recap';
          const rawItems =
            (shelf as any)?.contents || (shelf as any)?.items || [];
          const items = rawItems
            .map((item: any) => {
              const rawId = item.id || item.playlist_id || item.browse_id || '';
              const plId = rawId.startsWith('VL')
                ? rawId.replace(/^VL/, '')
                : rawId;
              if (!plId) return null;
              return {
                type: 'PLAYLIST' as const,
                playlistId: plId,
                name: item.title?.text || item.title?.toString() || 'Recap',
                artist: {
                  name:
                    item.subtitle?.text ||
                    item.author?.name ||
                    userProfile?.full_name ||
                    'YouTube Music',
                  artistId: item.author?.id || null,
                },
                thumbnails: this.parseThumbnails(
                  item.thumbnails || item.thumbnail,
                ),
              };
            })
            .filter((it: any) => Boolean(it && it.playlistId && it.name));

          if (items.length > 0) {
            sections.push({
              title: shelfTitle,
              contents: items,
            });
          }
        }
      }

      const result = {
        available: true,
        title: 'Tu Recap',
        playlist: recapPlaylist,
        sections,
      };

      const ttlHours = 12;
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

      try {
        if (existingCache) {
          existingCache.data = result;
          existingCache.expires_at = expiresAt;
          await this.youtubeCacheRepository.save(existingCache);
        } else {
          const newCache = this.youtubeCacheRepository.create({
            user_id: userId,
            cache_key: 'recap',
            data: result,
            expires_at: expiresAt,
          });
          await this.youtubeCacheRepository.save(newCache);
        }
      } catch (saveErr) {
        console.warn('Error saving recap cache to database:', saveErr);
      }

      this.memoryCache.set(memoryKey, {
        data: result,
        expiresAt: expiresAt.getTime(),
      });

      return result;
    } catch (err) {
      console.error('Error getting recap data:', err);
      if (existingCache?.data) {
        return existingCache.data;
      }
      throw new InternalServerErrorException(
        'Error obteniendo datos del Recap',
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
        const authedYt = await this.getAuthedInnertubeByCookie(rawCookie);
        if (authedYt) {
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

  private async ensureInnertube(): Promise<Innertube> {
    if (!this.yt) {
      Platform.shim.eval = async (data: any) => new Function(data.output)();
      this.yt = await Innertube.create({
        cache: new UniversalCache(false),
      });
    }
    return this.yt;
  }

  private parseDuration(duration: any): number {
    if (typeof duration === 'number') return duration;
    if (typeof duration?.seconds === 'number') return duration.seconds;
    if (typeof duration === 'string' || typeof duration?.text === 'string') {
      const text = (
        typeof duration === 'string' ? duration : duration.text
      ).trim();
      const parts = text.split(':').map((p: string) => parseInt(p, 10));
      if (parts.every((p: number) => !isNaN(p))) {
        if (parts.length === 3)
          return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
      }
    }
    return 0;
  }

  private parseThumbnails(
    rawThumbnails: any,
  ): { url: string; width: number; height: number }[] {
    if (!rawThumbnails) return [];
    const list = Array.isArray(rawThumbnails)
      ? rawThumbnails
      : Array.isArray(rawThumbnails.contents)
        ? rawThumbnails.contents
        : Array.isArray(rawThumbnails.thumbnails)
          ? rawThumbnails.thumbnails
          : [rawThumbnails];

    return list
      .filter((t: any) => t && (t.url || typeof t === 'string'))
      .map((t: any) => ({
        url: typeof t === 'string' ? t : t.url,
        width: t.width || 0,
        height: t.height || 0,
      }));
  }

  private parseArtist(
    rawArtist: any,
    fallbackName = 'YouTube Music',
  ): { name: string; artistId: string | null } {
    if (!rawArtist) return { name: fallbackName, artistId: null };
    if (typeof rawArtist === 'string') {
      const clean = rawArtist.trim();
      return {
        name: clean && clean !== 'N/A' ? clean : fallbackName,
        artistId: null,
      };
    }
    const name = rawArtist.name || rawArtist.text || fallbackName;
    const artistId =
      rawArtist.channel_id || rawArtist.id || rawArtist.artistId || null;
    return {
      name: name && name !== 'N/A' ? name : fallbackName,
      artistId,
    };
  }

  private formatInnertubePlaylist(rawId: string, pl: any) {
    const header = pl.header as any;
    const rawTitle = header?.title?.toString();
    const title = rawTitle && rawTitle !== 'undefined' ? rawTitle : 'Playlist';
    const rawArtist =
      header?.author?.name || header?.strapline_text_one?.toString() || '';
    const artistInfo = this.parseArtist(rawArtist, 'YouTube Music');
    const thumbnails = this.parseThumbnails(
      header?.thumbnail || header?.thumbnails,
    );

    const rawItems: any[] = pl.contents?.length
      ? pl.contents
      : (typeof pl.page?.contents_memo?.getType === 'function'
          ? pl.page.contents_memo.getType('MusicResponsiveListItem')
          : null) || [];

    const songsList = rawItems
      .map((item: any) => ({
        type: 'VIDEO' as const,
        videoId: item.id || item.video_id,
        name: item.title?.toString() || item.name || '',
        artist: this.parseArtist(
          item.artists?.[0] || item.authors?.[0] || item.author,
          artistInfo.name,
        ),
        duration: this.parseDuration(item.duration),
        thumbnails: this.parseThumbnails(item.thumbnail),
      }))
      .filter((s: any) => Boolean(s.videoId));

    return {
      infoPlaylist: {
        type: 'PLAYLIST',
        playlistId: rawId,
        name: title,
        artist: artistInfo,
        videoCount: songsList.length,
        thumbnails: thumbnails.length
          ? thumbnails
          : songsList[0]?.thumbnails || [],
      },
      songsList,
    };
  }

  async viewPlaylist(playlistId: string, userId?: number) {
    if (!playlistId || typeof playlistId !== 'string') {
      throw new BadRequestException('playlistId is required');
    }

    const rawId = decodeURIComponent(playlistId).trim();
    if (!rawId) {
      throw new BadRequestException('playlistId is required');
    }

    // 0. Caché en memoria para respuesta instantánea (0ms)
    const cacheKey = `pl:${rawId}:${userId || 'anon'}`;
    const cached = this.playlistCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    let authedYt = userId ? await this.getAuthedInnertube(userId) : null;
    if (!authedYt) {
      const fallbackCookie = await this.usersService
        .findFirstYoutubeCookie?.()
        ?.catch(() => null);
      if (fallbackCookie) {
        authedYt = await this.getAuthedInnertubeByCookie(fallbackCookie);
      }
    }
    const yt = await this.ensureInnertube();

    // Soporte especial para "recap" o "FEmusic_listening_review"
    if (rawId === 'recap' || rawId === 'FEmusic_listening_review') {
      try {
        if (authedYt) {
          const recap = await authedYt.music.getRecap().catch(() => null);
          if (recap) {
            const pl = await recap.getPlaylist().catch(() => null);
            if (pl && pl.contents?.length) {
              const result = this.formatInnertubePlaylist(rawId, pl);
              this.playlistCache.set(cacheKey, {
                data: result,
                expiresAt: Date.now() + 5 * 60 * 1000,
              });
              return result;
            }
          }
        }
      } catch (err) {
        console.warn('Error resolving recap as playlist:', err);
      }
    }

    // Soporte especial para Liked Music: "VLLM" o "LM"
    if (rawId === 'VLLM' || rawId === 'LM') {
      try {
        const client = authedYt || yt;
        const pl = await client.music.getPlaylist('LM').catch(() => null);
        if (pl && (pl.contents?.length || pl.header)) {
          const result = this.formatInnertubePlaylist(rawId, pl);
          if (result.songsList.length > 0) {
            this.playlistCache.set(cacheKey, {
              data: result,
              expiresAt: Date.now() + 5 * 60 * 1000,
            });
            return result;
          }
        }
      } catch (err) {
        console.warn('Error resolving liked music playlist:', err);
      }
    }

    // 1. Detectar Radio / Mix basado en video o canción:
    // - RDAMVM<videoId>
    // - RD<videoId> (con videoId de 11 caracteres)
    // - RDMM<videoId>
    // - videoId directo de 11 caracteres
    let radioVideoId: string | null = null;
    if (rawId.startsWith('RDAMVM')) {
      radioVideoId = rawId.replace('RDAMVM', '');
    } else if (
      rawId.startsWith('RD') &&
      !rawId.startsWith('RDCLAK') &&
      !rawId.startsWith('RDTMAK') &&
      rawId.length === 13
    ) {
      radioVideoId = rawId.slice(2);
    } else if (rawId.startsWith('RDMM') && rawId.length > 4) {
      radioVideoId = rawId.slice(4);
    } else if (/^[a-zA-Z0-9_-]{11}$/.test(rawId)) {
      radioVideoId = rawId;
    }

    if (radioVideoId) {
      try {
        const clientForUpNext = authedYt || yt;
        const [upNext, songInfo] = await Promise.all([
          clientForUpNext.music.getUpNext(radioVideoId).catch(() => null),
          clientForUpNext.music.getInfo(radioVideoId).catch(() => null),
        ]);

        if (upNext?.contents?.length) {
          const firstUpNext = (upNext.contents as any[])?.[0];
          const songTitle = songInfo?.basic_info?.title;
          const title = songTitle ? `Mix: ${songTitle}` : 'Mix Radio';
          const artistName =
            songInfo?.basic_info?.author ||
            firstUpNext?.author ||
            'YouTube Music';
          const artistId = songInfo?.basic_info?.channel_id || null;
          const thumbnails = this.parseThumbnails(
            songInfo?.basic_info?.thumbnail || firstUpNext?.thumbnail,
          );

          const songsList = upNext.contents.map((item: any) => ({
            type: 'VIDEO' as const,
            videoId: item.video_id || item.id,
            name: item.title?.toString() || '',
            artist: this.parseArtist(
              item.artists?.[0] || item.author,
              artistName,
            ),
            duration: this.parseDuration(item.duration),
            thumbnails: this.parseThumbnails(item.thumbnail),
          }));

          const result = {
            infoPlaylist: {
              type: 'PLAYLIST',
              playlistId: rawId,
              name: title,
              artist: { name: artistName, artistId },
              videoCount: songsList.length,
              thumbnails: thumbnails.length
                ? thumbnails
                : songsList[0]?.thumbnails || [],
            },
            songsList,
          };

          this.playlistCache.set(cacheKey, {
            data: result,
            expiresAt: Date.now() + 5 * 60 * 1000,
          });
          return result;
        }
      } catch (error) {
        console.warn('Error resolving video radio mix via upNext:', error);
      }
    }

    // 2. Radio basada en playlist: RDAMPL<playlistId> -> extraer id base
    let cleanId = rawId;
    if (cleanId.startsWith('RDAMPL')) {
      cleanId = cleanId.replace('RDAMPL', '');
    }

    // 3. Intentar con Innertube Music (soporta autenticado primero, RDCLAK..., RDTMAK..., RDRC..., PL..., etc.)
    const tryMusicPlaylist = async (idToTry: string) => {
      try {
        if (authedYt) {
          try {
            const pl = await authedYt.music.getPlaylist(idToTry);
            const items = pl?.contents?.length
              ? pl.contents
              : (typeof (pl as any)?.page?.contents_memo?.getType === 'function'
                  ? (pl as any).page.contents_memo.getType(
                      'MusicResponsiveListItem',
                    )
                  : null) || [];
            if (items.length > 0) {
              return this.formatInnertubePlaylist(rawId, pl);
            }
          } catch {}
        }
        const pl = await yt.music.getPlaylist(idToTry);
        const items = pl?.contents?.length
          ? pl.contents
          : (typeof (pl as any)?.page?.contents_memo?.getType === 'function'
              ? (pl as any).page.contents_memo.getType(
                  'MusicResponsiveListItem',
                )
              : null) || [];
        if (items.length > 0) {
          return this.formatInnertubePlaylist(rawId, pl);
        }
      } catch {}
      return null;
    };

    let result = await tryMusicPlaylist(cleanId);
    if (result) {
      this.playlistCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      return result;
    }

    if (!cleanId.startsWith('VL')) {
      result = await tryMusicPlaylist('VL' + cleanId);
      if (result) {
        this.playlistCache.set(cacheKey, {
          data: result,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
        return result;
      }
    } else {
      result = await tryMusicPlaylist(cleanId.slice(2));
      if (result) {
        this.playlistCache.set(cacheKey, {
          data: result,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
        return result;
      }
    }

    // 4. Fallback: Si es un álbum (OLAK... o MPREb...)
    if (cleanId.startsWith('OLAK') || cleanId.startsWith('MPREb')) {
      try {
        const album = await this.ytmusic.getAlbum(cleanId).catch(() => null);
        if (album?.songs?.length) {
          const albumResult = {
            infoPlaylist: {
              type: 'PLAYLIST',
              playlistId: rawId,
              name: album.name,
              artist: album.artist,
              videoCount: album.songs.length,
              thumbnails: this.parseThumbnails(album.thumbnails),
            },
            songsList: album.songs.map((s: any) => ({
              type: 'VIDEO' as const,
              videoId: s.videoId,
              name: s.name,
              artist: s.artist,
              duration: this.parseDuration(s.duration),
              thumbnails: this.parseThumbnails(
                s.thumbnails || album.thumbnails,
              ),
            })),
          };

          this.playlistCache.set(cacheKey, {
            data: albumResult,
            expiresAt: Date.now() + 5 * 60 * 1000,
          });
          return albumResult;
        }
      } catch {}
    }

    // 5. Fallback: Playlist general de YouTube ((authedYt || yt).getPlaylist)
    try {
      const pl = await (authedYt || yt).getPlaylist(cleanId);
      if (pl?.videos?.length) {
        const songsList = (pl.videos as any[])
          .map((v: any) => {
            const title =
              v.metadata?.title?.text ||
              v.title?.text ||
              v.title?.toString() ||
              '';
            const artistName =
              v.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]
                ?.text?.text ||
              pl.info?.author?.name ||
              'YouTube';
            return {
              type: 'VIDEO' as const,
              videoId: v.content_id || v.id,
              name: title,
              artist: { name: artistName, artistId: null },
              duration: this.parseDuration(v.duration),
              thumbnails: this.parseThumbnails(
                v.content_image?.image || v.thumbnails,
              ),
            };
          })
          .filter((s) => s.videoId);

        if (songsList.length) {
          const generalResult = {
            infoPlaylist: {
              type: 'PLAYLIST',
              playlistId: rawId,
              name: pl.info?.title || 'Playlist',
              artist: {
                name: pl.info?.author?.name || 'YouTube',
                artistId: pl.info?.author?.id || null,
              },
              videoCount: songsList.length,
              thumbnails:
                this.parseThumbnails(pl.info?.thumbnails) ||
                songsList[0]?.thumbnails ||
                [],
            },
            songsList,
          };

          this.playlistCache.set(cacheKey, {
            data: generalResult,
            expiresAt: Date.now() + 5 * 60 * 1000,
          });
          return generalResult;
        }
      }
    } catch {}

    // 6. Fallback final: ytmusic-api
    try {
      const idForYtm = cleanId.startsWith('VL') ? cleanId : 'VL' + cleanId;
      const playListData = await this.ytmusic.getPlaylist(idForYtm);
      const songsOfThePlaylist = await this.ytmusic.getPlaylistVideos(
        playListData.playlistId || idForYtm,
      );
      const ytmResult = {
        infoPlaylist: playListData,
        songsList: songsOfThePlaylist,
      };

      this.playlistCache.set(cacheKey, {
        data: ytmResult,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      return ytmResult;
    } catch {}

    throw new NotFoundException(
      `No se pudo cargar la playlist con ID "${playlistId}"`,
    );
  }

  async viewAlbum(albumId: string) {
    return this.ytmusic.getAlbum(albumId);
  }

  async getLyrics(
    track_name: string,
    artist_name: string,
    duration?: number,
  ) {
    if (!track_name) {
      throw new BadRequestException(`track_name is required`);
    }
    if (!artist_name) {
      throw new BadRequestException(`artist_name is required`);
    }

    const cleanArtist = artist_name
      .replace(/ - Topic$/i, '')
      .replace(/VEVO$/i, '')
      .trim();

    const clearTrackName = track_name
      .replace(/\[[^\]]*\]/g, '') // remover [Official Video], [Remastered], etc.
      .replace(/\([^)]*\)/g, '') // remover (feat. ...), (Lyric Video), etc.
      .replace(/ - Topic$/i, '')
      .replace(
        /Official Video|Official Audio|Music Video|Lyric Video|Audio/gi,
        '',
      )
      .trim();

    const cacheDurationKey =
      duration && !isNaN(Number(duration))
        ? Math.round(Number(duration))
        : 'nodur';
    const cacheKey = `lyrics:${cleanArtist.toLowerCase()}:${clearTrackName.toLowerCase()}:${cacheDurationKey}`;
    const cached = this.memoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const params: Record<string, any> = {
      track_name: clearTrackName,
      artist_name: cleanArtist,
    };
    if (duration && !isNaN(Number(duration))) {
      params.duration = Math.round(Number(duration));
    }

    const baseUrl =
      this.configService.lrcLibUrl || 'https://lrclib.net/api/get';

    try {
      const response = await axios.get(baseUrl, { params });
      if (response.data) {
        this.memoryCache.set(cacheKey, {
          data: response.data,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        });
      }
      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          try {
            const searchUrl = baseUrl.endsWith('/get')
              ? baseUrl.slice(0, -4) + '/search'
              : 'https://lrclib.net/api/search';

            const searchRes = await axios.get(searchUrl, {
              params: {
                track_name: clearTrackName,
                artist_name: cleanArtist,
              },
            });

            if (Array.isArray(searchRes.data) && searchRes.data.length > 0) {
              const items = searchRes.data;
              let match = null;

              if (duration && !isNaN(Number(duration))) {
                const targetDuration = Math.round(Number(duration));
                match = items.find(
                  (it: any) =>
                    it.syncedLyrics &&
                    Math.abs(Math.round(it.duration) - targetDuration) <= 3,
                );
              }

              if (!match) {
                match = items.find((it: any) => Boolean(it.syncedLyrics));
              }

              if (!match) {
                match = items[0];
              }

              if (match) {
                this.memoryCache.set(cacheKey, {
                  data: match,
                  expiresAt: Date.now() + 24 * 60 * 60 * 1000,
                });
                return match;
              }
            }
          } catch {
            // Ignorar y continuar a NotFoundException
          }
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
