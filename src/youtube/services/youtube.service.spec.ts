import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YoutubeService } from './youtube.service.js';
import { UsersService } from '../../users/services/users/users.service.js';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { YoutubeCache } from '../entities/youtube-cache.entity.js';
import config from '../../config.js';
import axios from 'axios';

vi.mock('axios');

describe('YoutubeService', () => {
  let service: YoutubeService;
  let mockUsersService: Partial<UsersService>;
  let mockYoutubeCacheRepository: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockUsersService = {
      findByIdReturnYoutubeCookie: vi.fn(),
      findById: vi.fn(),
      findFirstYoutubeCookie: vi.fn().mockResolvedValue(null),
    };

    mockYoutubeCacheRepository = {
      findOne: vi.fn(),
      save: vi.fn(),
      create: vi.fn((dto) => dto),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: config.KEY,
          useValue: {
            lrcLibUrl: 'https://lrclib.net/api/get',
            youtubeCacheTtlHours: 6,
          },
        },
        {
          provide: getRepositoryToken(YoutubeCache),
          useValue: mockYoutubeCacheRepository,
        },
      ],
    }).compile();

    service = module.get<YoutubeService>(YoutubeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardData', () => {
    it('should return cached data from database if not expired', async () => {
      const mockCachedData = [{ title: 'Quick picks', contents: [] }];
      const futureDate = new Date(Date.now() + 3600 * 1000 * 4); // 4 hours in the future
      mockYoutubeCacheRepository.findOne.mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        cache_key: 'dashboard',
        data: mockCachedData,
        expires_at: futureDate,
      });

      const result = await service.getDashboardData(1);
      expect(result).toEqual(mockCachedData);
      expect(
        mockUsersService.findByIdReturnYoutubeCookie,
      ).not.toHaveBeenCalled();

      // Second call should come directly from in-memory cache without hitting the repository
      mockYoutubeCacheRepository.findOne.mockClear();
      const memResult = await service.getDashboardData(1);
      expect(memResult).toEqual(mockCachedData);
      expect(mockYoutubeCacheRepository.findOne).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if cache expired and user has no cookies', async () => {
      mockYoutubeCacheRepository.findOne.mockResolvedValueOnce(null);
      vi.spyOn(
        mockUsersService,
        'findByIdReturnYoutubeCookie',
      ).mockResolvedValue(null as any);

      await expect(service.getDashboardData(1)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return expired cached data if user has no cookies but cache exists', async () => {
      const mockCachedData = [{ title: 'Stale quick picks', contents: [] }];
      const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour in the past
      mockYoutubeCacheRepository.findOne.mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        cache_key: 'dashboard',
        data: mockCachedData,
        expires_at: pastDate,
      });
      vi.spyOn(
        mockUsersService,
        'findByIdReturnYoutubeCookie',
      ).mockResolvedValue(null as any);

      const result = await service.getDashboardData(1);
      expect(result).toEqual(mockCachedData);
    });

    it('should filter out community sections and other users playlists, while keeping mixes and user playlists', () => {
      const mockRawSections = [
        {
          title: 'De la comunidad',
          contents: [
            {
              type: 'PLAYLIST',
              playlistId: 'PLother_user_playlist',
              name: 'Bachata de Pedro',
              artist: { name: 'Pedro' },
            },
          ],
        },
        {
          title: 'Mixes personalizados',
          contents: [
            {
              type: 'PLAYLIST',
              playlistId: 'RDTMAK5uy_mix1',
              name: 'Mi supermix',
              artist: { name: 'YouTube Music' },
            },
            {
              type: 'PLAYLIST',
              playlistId: 'PLother_user_2',
              name: 'Playlist de Juan',
              artist: { name: 'Juan' },
            },
            {
              type: 'PLAYLIST',
              playlistId: 'PLmy_own_playlist',
              name: 'Mis favoritas',
              artist: { name: 'Tú' },
            },
          ],
        },
        {
          title: 'Álbumes para ti',
          contents: [
            {
              type: 'ALBUM',
              name: 'Meteora',
              albumId: 'OLAK5uy_album1',
              artist: { name: 'Linkin Park' },
            },
          ],
        },
      ];

      const userPlaylistIds = new Set(['PLmy_own_playlist']);
      const filtered = (service as any).filterDashboardSections(
        mockRawSections,
        userPlaylistIds,
      );

      // Section 'De la comunidad' should be completely omitted
      expect(
        filtered.find((s: any) => s.title === 'De la comunidad'),
      ).toBeUndefined();

      // 'Mixes personalizados' should only keep the YouTube mix and user's own playlist
      const mixSection = filtered.find(
        (s: any) => s.title === 'Mixes personalizados',
      );
      expect(mixSection).toBeDefined();
      expect(mixSection.contents).toHaveLength(2);
      expect(mixSection.contents.map((c: any) => c.playlistId)).toEqual([
        'RDTMAK5uy_mix1',
        'PLmy_own_playlist',
      ]);

      // 'Álbumes para ti' should be preserved
      const albumSection = filtered.find(
        (s: any) => s.title === 'Álbumes para ti',
      );
      expect(albumSection).toBeDefined();
      expect(albumSection.contents).toHaveLength(1);
    });
  });

  describe('getLyrics', () => {
    it('should throw BadRequestException if track_name or artist_name is missing', async () => {
      await expect(service.getLyrics('', 'Artist')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getLyrics('Track', '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return lyrics data successfully', async () => {
      const mockData = { id: 1, plainLyrics: 'hello', syncedLyrics: null };
      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockData } as any);

      const result = await service.getLyrics(
        'Song Title',
        'Artist Name - Topic',
      );
      expect(result).toEqual(mockData);
      expect(axios.get).toHaveBeenCalledWith('https://lrclib.net/api/get', {
        params: {
          track_name: 'Song Title',
          artist_name: 'Artist Name',
        },
      });
    });

    it('should clean bracketed suffixes and include duration in params when provided', async () => {
      const mockData = { id: 2, plainLyrics: 'test', syncedLyrics: '[00:01.00] test' };
      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockData } as any);

      const result = await service.getLyrics('Track [Official Video]', 'Artist', 210);
      expect(result).toEqual(mockData);
      expect(axios.get).toHaveBeenCalledWith('https://lrclib.net/api/get', {
        params: {
          track_name: 'Track',
          artist_name: 'Artist',
          duration: 210,
        },
      });
    });

    it('should throw NotFoundException on 404', async () => {
      const error: any = new Error('Not found');
      error.isAxiosError = true;
      error.response = { status: 404 };
      vi.mocked(axios.isAxiosError).mockReturnValue(true);
      vi.mocked(axios.get).mockRejectedValueOnce(error);

      await expect(service.getLyrics('Song', 'Artist')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('viewPlaylist', () => {
    it('should throw BadRequestException if playlistId is empty', async () => {
      await expect(service.viewPlaylist('')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.viewPlaylist('   ')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should resolve video radio mix (RDAMVM...) via yt.music.getUpNext', async () => {
      const mockUpNext = {
        contents: [
          {
            video_id: 'dQw4w9WgXcQ',
            title: 'Never Gonna Give You Up',
            author: 'Rick Astley',
            duration: { seconds: 212 },
            thumbnail: [{ url: 'http://thumb.jpg', width: 400, height: 225 }],
          },
        ],
      };
      const mockSongInfo = {
        basic_info: {
          title: 'Never Gonna Give You Up',
          author: 'Rick Astley',
          thumbnail: [{ url: 'http://thumb.jpg', width: 400, height: 225 }],
        },
      };

      (service as any).yt = {
        music: {
          getUpNext: vi.fn().mockResolvedValue(mockUpNext),
          getInfo: vi.fn().mockResolvedValue(mockSongInfo),
        },
      };

      const result = await service.viewPlaylist('RDAMVMdQw4w9WgXcQ');

      expect(result.infoPlaylist.name).toBe('Mix: Never Gonna Give You Up');
      expect(result.infoPlaylist.artist.name).toBe('Rick Astley');
      expect(result.songsList).toHaveLength(1);
      expect(result.songsList[0].videoId).toBe('dQw4w9WgXcQ');
      expect(result.songsList[0].duration).toBe(212);
    });

    it('should resolve mix playlist (RDCLAK...) via yt.music.getPlaylist', async () => {
      const mockPlaylist = {
        header: {
          title: 'Dancing With the Broom',
          author: { name: 'YouTube Music' },
          thumbnail: {
            contents: [{ url: 'http://cover.jpg', width: 544, height: 544 }],
          },
        },
        contents: [
          {
            id: 'VBcs8DZxBGc',
            title: 'MI EX TENIA RAZON',
            artists: [{ name: 'KAROL G', channel_id: '123' }],
            duration: { seconds: 162 },
            thumbnail: {
              contents: [{ url: 'http://thumb.jpg', width: 400, height: 225 }],
            },
          },
        ],
      };

      (service as any).yt = {
        music: {
          getPlaylist: vi.fn().mockResolvedValue(mockPlaylist),
        },
      };

      const result = await service.viewPlaylist(
        'RDCLAK5uy_k4QNAro7aEx9CClDY9Wz5-G_CC_aO6NcU',
      );

      expect(result.infoPlaylist.name).toBe('Dancing With the Broom');
      expect(result.songsList).toHaveLength(1);
      expect(result.songsList[0].videoId).toBe('VBcs8DZxBGc');
      expect(result.songsList[0].artist.name).toBe('KAROL G');
    });

    it('should preserve recap playlists and recap sections even if not in user playlist ids', () => {
      const mockRawSections = [
        {
          title: 'Tu Recap',
          contents: [
            {
              type: 'PLAYLIST',
              playlistId: 'RDRC_spring_2024',
              name: 'Recap de primavera',
              artist: { name: 'YouTube Music' },
            },
          ],
        },
        {
          title: 'Mixes y Recaps',
          contents: [
            {
              type: 'PLAYLIST',
              playlistId: 'PLsome_recap',
              name: 'Resumen del año 2024',
              artist: { name: 'YouTube Music' },
            },
            {
              type: 'PLAYLIST',
              playlistId: 'PLrandom_stranger',
              name: 'Playlist de un desconocido',
              artist: { name: 'Desconocido' },
            },
          ],
        },
      ];

      const userPlaylistIds = new Set<string>();
      const filtered = (service as any).filterDashboardSections(
        mockRawSections,
        userPlaylistIds,
      );

      const recapSection = filtered.find((s: any) => s.title === 'Tu Recap');
      expect(recapSection).toBeDefined();
      expect(recapSection.contents).toHaveLength(1);
      expect(recapSection.contents[0].playlistId).toBe('RDRC_spring_2024');

      const mixedSection = filtered.find(
        (s: any) => s.title === 'Mixes y Recaps',
      );
      expect(mixedSection).toBeDefined();
      expect(mixedSection.contents).toHaveLength(1);
      expect(mixedSection.contents[0].name).toBe('Resumen del año 2024');
    });

    it('should throw NotFoundException if all providers fail', async () => {
      (service as any).yt = {
        music: {
          getPlaylist: vi.fn().mockRejectedValue(new Error('Not found')),
        },
        getPlaylist: vi.fn().mockRejectedValue(new Error('Not found')),
      };
      (service as any).ytmusic = {
        getPlaylist: vi.fn().mockRejectedValue(new Error('Not found')),
        getAlbum: vi.fn().mockRejectedValue(new Error('Not found')),
      };

      await expect(service.viewPlaylist('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return cached playlist instantly without querying providers', async () => {
      const cachedPlaylist = {
        infoPlaylist: { name: 'Cached Playlist' },
        songsList: [],
      };
      (service as any).playlistCache.set('pl:cached_1:anon', {
        data: cachedPlaylist,
        expiresAt: Date.now() + 100000,
      });

      const result = await service.viewPlaylist('cached_1');
      expect(result).toEqual(cachedPlaylist);
    });

    it('should resolve recap playlist for rawId "recap" with authenticated Innertube', async () => {
      const mockRecapPlaylist = {
        header: {
          title: 'Tu Recap de Fin de Año',
          author: { name: 'YouTube Music' },
          thumbnail: [{ url: 'http://thumb.jpg', width: 400, height: 400 }],
        },
        contents: [
          {
            id: 'video_recap_1',
            title: 'Top Song 1',
            artists: [{ name: 'Top Artist' }],
            duration: { seconds: 200 },
          },
        ],
      };

      const mockRecapObj = {
        getPlaylist: vi.fn().mockResolvedValue(mockRecapPlaylist),
      };

      const mockAuthedClient = {
        music: {
          getRecap: vi.fn().mockResolvedValue(mockRecapObj),
        },
      };

      vi.spyOn(service, 'getAuthedInnertube').mockResolvedValue(
        mockAuthedClient as any,
      );

      const result = await service.viewPlaylist('recap', 1);

      expect(result.infoPlaylist.name).toBe('Tu Recap de Fin de Año');
      expect(result.songsList).toHaveLength(1);
      expect(result.songsList[0].videoId).toBe('video_recap_1');
    });
  });

  describe('getRecapData', () => {
    it('should return cached recap from memory if available', async () => {
      const mockCachedRecap = {
        available: true,
        title: 'Tu Recap',
        sections: [],
      };
      (service as any).memoryCache.set('recap:1', {
        data: mockCachedRecap,
        expiresAt: Date.now() + 100000,
      });

      const result = await service.getRecapData(1);
      expect(result).toEqual(mockCachedRecap);
    });

    it('should return empty recap structure gracefully if recap is unavailable from Innertube', async () => {
      mockYoutubeCacheRepository.findOne.mockResolvedValueOnce(null);
      const mockAuthedClient = {
        music: {
          getRecap: vi.fn().mockResolvedValue(null),
        },
      };
      vi.spyOn(service, 'getAuthedInnertube').mockResolvedValue(
        mockAuthedClient as any,
      );
      vi.spyOn(mockUsersService, 'findById').mockResolvedValue({
        id: 1,
        full_name: 'Test User',
      } as any);

      const result = await service.getRecapData(1);
      expect(result.available).toBe(false);
      expect(result.message).toContain('no está disponible');
    });
  });
});
