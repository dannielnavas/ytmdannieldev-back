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
});

