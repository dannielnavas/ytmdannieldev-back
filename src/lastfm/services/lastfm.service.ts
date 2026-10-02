import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import axios from 'axios';
import config from '../../config.js';
import type {
  LastFmArtistInfo,
  LastFmSimilarArtist,
  LastFmTag,
} from '../interfaces/lastfm.interface.js';

@Injectable()
export class LastfmService {
  private readonly logger = new Logger(LastfmService.name);
  private readonly baseUrl = 'https://ws.audioscrobbler.com/2.0/';
  private readonly cache = new Map<string, { data: any; expiresAt: number }>();
  private readonly cacheTtlMs = 24 * 60 * 60 * 1000; // 24 horas

  constructor(
    @Inject(config.KEY)
    private readonly configService: ConfigType<typeof config>,
  ) {}

  private getCached<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.data as T;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  async getArtistInfo(artistName: string): Promise<LastFmArtistInfo | null> {
    if (!artistName?.trim()) return null;
    const cleanArtist = artistName.trim();
    const cacheKey = `artist:info:${cleanArtist.toLowerCase()}`;
    const cached = this.getCached<LastFmArtistInfo>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          method: 'artist.getinfo',
          artist: cleanArtist,
          api_key: this.configService.apiKeyLastFM,
          autocorrect: 1,
          format: 'json',
        },
        timeout: 5000,
      });

      const artist = response.data?.artist;
      if (!artist) return null;

      this.setCache(cacheKey, artist);
      return artist;
    } catch (error) {
      this.logger.warn(
        `Error obteniendo info de artista "${cleanArtist}" desde Last.fm: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  async getArtistTopTags(artistName: string): Promise<LastFmTag[]> {
    if (!artistName?.trim()) return [];
    const cleanArtist = artistName.trim();
    const cacheKey = `artist:tags:${cleanArtist.toLowerCase()}`;
    const cached = this.getCached<LastFmTag[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          method: 'artist.gettoptags',
          artist: cleanArtist,
          api_key: this.configService.apiKeyLastFM,
          autocorrect: 1,
          format: 'json',
        },
        timeout: 5000,
      });

      const rawTags = response.data?.toptags?.tag;
      if (!rawTags) return [];

      const tagsArray: LastFmTag[] = Array.isArray(rawTags)
        ? rawTags
        : [rawTags];

      const tags = tagsArray
        .filter((t) => t && t.name)
        .map((t) => ({
          name: t.name.toLowerCase().trim(),
          count: typeof t.count === 'number' ? t.count : Number(t.count || 0),
          url: t.url,
        }));

      this.setCache(cacheKey, tags);
      return tags;
    } catch (error) {
      this.logger.warn(
        `Error obteniendo tags de artista "${cleanArtist}" desde Last.fm: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  async getSimilarArtists(
    artistName: string,
    limit: number = 5,
  ): Promise<LastFmSimilarArtist[]> {
    if (!artistName?.trim()) return [];
    const cleanArtist = artistName.trim();
    const cacheKey = `artist:similar:${cleanArtist.toLowerCase()}:${limit}`;
    const cached = this.getCached<LastFmSimilarArtist[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          method: 'artist.getsimilar',
          artist: cleanArtist,
          limit,
          api_key: this.configService.apiKeyLastFM,
          autocorrect: 1,
          format: 'json',
        },
        timeout: 5000,
      });

      const rawArtists = response.data?.similarartists?.artist;
      if (!rawArtists) return [];

      const artistsArray: LastFmSimilarArtist[] = Array.isArray(rawArtists)
        ? rawArtists
        : [rawArtists];

      const cleanList = artistsArray.filter((a) => a && a.name);
      this.setCache(cacheKey, cleanList);
      return cleanList;
    } catch (error) {
      this.logger.warn(
        `Error obteniendo similares de "${cleanArtist}" desde Last.fm: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  extractBestImage(images?: Array<{ '#text': string; size: string }>): string {
    if (!images || images.length === 0) return '';
    // Buscar orden descendente: mega, extralarge, large, medium, small
    const preferredSizes = ['mega', 'extralarge', 'large', 'medium', 'small'];
    for (const size of preferredSizes) {
      const img = images.find((i) => i.size === size && i['#text']);
      if (img && img['#text']) return img['#text'];
    }
    const fallback = images.find((i) => i['#text']);
    return fallback ? fallback['#text'] : '';
  }
}
