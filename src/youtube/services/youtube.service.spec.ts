import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YoutubeService } from './youtube.service.js';
import { UsersService } from '../../users/services/users/users.service.js';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import config from '../../config.js';
import axios from 'axios';

vi.mock('axios');

describe('YoutubeService', () => {
  let service: YoutubeService;
  let mockUsersService: Partial<UsersService>;

  beforeEach(async () => {
    mockUsersService = {
      findByIdReturnYoutubeCookie: vi.fn(),
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
          },
        },
      ],
    }).compile();

    service = module.get<YoutubeService>(YoutubeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw UnauthorizedException if user has no cookies', async () => {
    vi.spyOn(mockUsersService, 'findByIdReturnYoutubeCookie').mockResolvedValue(
      null as any,
    );

    await expect(service.getDashboardData(1)).rejects.toThrow(
      UnauthorizedException,
    );
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

      const result = await service.getLyrics('Song Title', 'Artist Name - Topic');
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

