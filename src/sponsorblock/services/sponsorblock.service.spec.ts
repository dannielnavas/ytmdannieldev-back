import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { vi } from 'vitest';
import config from '../../config.js';
import {
  DEFAULT_MUSIC_CATEGORIES,
  SponsorblockService,
} from './sponsorblock.service.js';

vi.mock('axios');

describe('SponsorblockService', () => {
  let service: SponsorblockService;

  const mockConfig = {
    sponsorBlockUrl: 'https://sponsor.ajay.app',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SponsorblockService,
        {
          provide: config.KEY,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<SponsorblockService>(SponsorblockService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cleanVideoId', () => {
    it('should strip RDAM prefix', () => {
      expect(service.cleanVideoId('RDAMVMdQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(service.cleanVideoId('RDAMPL12345')).toBe('12345');
      expect(service.cleanVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });
  });

  describe('hashVideoId', () => {
    it('should calculate sha256 hash correctly', () => {
      const hash = service.hashVideoId('dQw4w9WgXcQ');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });
  });

  describe('getSkipSegments', () => {
    it('should fetch skip segments successfully', async () => {
      const mockSegments = [
        {
          UUID: 'uuid-1',
          segment: [10, 25],
          category: 'music_offtopic',
          actionType: 'skip',
          locked: 0,
          votes: 12,
          videoDuration: 180,
          description: '',
        },
      ];

      vi.mocked(axios.get).mockResolvedValueOnce({
        data: mockSegments,
      } as any);

      const result = await service.getSkipSegments('dQw4w9WgXcQ', {
        categories: ['music_offtopic'],
      });

      expect(result).toEqual(mockSegments);
      expect(axios.get).toHaveBeenCalledWith(
        'https://sponsor.ajay.app/api/skipSegments',
        expect.objectContaining({
          params: expect.objectContaining({
            videoID: 'dQw4w9WgXcQ',
            categories: JSON.stringify(['music_offtopic']),
            actionTypes: JSON.stringify(['skip']),
          }),
        }),
      );
    });

    it('should return empty array on 404 (no segments submitted)', async () => {
      vi.mocked(axios.get).mockRejectedValueOnce({
        response: { status: 404 },
      });

      const result = await service.getSkipSegments('dQw4w9WgXcQ');
      expect(result).toEqual([]);
    });

    it('should use default music categories when none provided', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: [],
      } as any);

      await service.getSkipSegments('dQw4w9WgXcQ');

      expect(axios.get).toHaveBeenCalledWith(
        'https://sponsor.ajay.app/api/skipSegments',
        expect.objectContaining({
          params: expect.objectContaining({
            categories: JSON.stringify(DEFAULT_MUSIC_CATEGORIES),
          }),
        }),
      );
    });

    it('should cache result on subsequent call', async () => {
      const mockSegments = [
        {
          UUID: 'uuid-cached',
          segment: [0, 15],
          category: 'sponsor',
          actionType: 'skip',
          locked: 1,
          votes: 5,
          videoDuration: 120,
          description: '',
        },
      ];

      vi.mocked(axios.get).mockResolvedValueOnce({
        data: mockSegments,
      } as any);

      const firstCall = await service.getSkipSegments('video123', {
        categories: ['sponsor'],
      });
      const secondCall = await service.getSkipSegments('video123', {
        categories: ['sponsor'],
      });

      expect(firstCall).toEqual(mockSegments);
      expect(secondCall).toEqual(mockSegments);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSkipSegmentsByHashPrefix', () => {
    it('should query hashed prefix endpoint', async () => {
      const mockData = [
        {
          videoID: 'video123',
          segments: [],
        },
      ];

      vi.mocked(axios.get).mockResolvedValueOnce({
        data: mockData,
      } as any);

      const result = await service.getSkipSegmentsByHashPrefix('abcd');
      expect(result).toEqual(mockData);
      expect(axios.get).toHaveBeenCalledWith(
        'https://sponsor.ajay.app/api/skipSegments/abcd',
        expect.anything(),
      );
    });

    it('should throw BadRequestException if prefix is too short', async () => {
      await expect(service.getSkipSegmentsByHashPrefix('ab')).rejects.toThrow();
    });
  });

  describe('submitSegments', () => {
    it('should post new segments to SponsorBlock', async () => {
      const mockResponse = [
        {
          UUID: 'new-uuid',
          category: 'music_offtopic',
          segment: [5, 20] as [number, number],
        },
      ];

      vi.mocked(axios.post).mockResolvedValueOnce({
        data: mockResponse,
      } as any);

      const result = await service.submitSegments({
        videoID: 'dQw4w9WgXcQ',
        userID: 'a'.repeat(32),
        segments: [
          {
            segment: [5, 20],
            category: 'music_offtopic',
          },
        ],
      });

      expect(result).toEqual(mockResponse);
      expect(axios.post).toHaveBeenCalledWith(
        'https://sponsor.ajay.app/api/skipSegments',
        expect.objectContaining({
          videoID: 'dQw4w9WgXcQ',
          userID: 'a'.repeat(32),
        }),
        expect.anything(),
      );
    });
  });

  describe('voteOnSegment', () => {
    it('should post vote parameters', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce({} as any);

      const result = await service.voteOnSegment({
        UUID: 'uuid-123',
        userID: 'a'.repeat(32),
        type: 1,
      });

      expect(result).toEqual({ success: true });
      expect(axios.post).toHaveBeenCalledWith(
        'https://sponsor.ajay.app/api/voteOnSponsorTime',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            UUID: 'uuid-123',
            userID: 'a'.repeat(32),
            type: 1,
          }),
        }),
      );
    });
  });

  describe('recordView', () => {
    it('should post viewed segment UUID', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce({} as any);

      const result = await service.recordView({ UUID: 'uuid-viewed' });
      expect(result).toEqual({ success: true });
      expect(axios.post).toHaveBeenCalledWith(
        'https://sponsor.ajay.app/api/viewedVideoSponsorTime',
        null,
        expect.objectContaining({
          params: { UUID: 'uuid-viewed' },
        }),
      );
    });
  });

  describe('getTotalStats', () => {
    it('should fetch global stats', async () => {
      const stats = {
        userCount: 1000,
        activeUsers: 500,
        apiUsers: 200,
        viewCount: 50000,
        totalSubmissions: 3000,
        minutesSaved: 12000,
      };

      vi.mocked(axios.get).mockResolvedValueOnce({
        data: stats,
      } as any);

      const result = await service.getTotalStats();
      expect(result).toEqual(stats);
      expect(axios.get).toHaveBeenCalledWith(
        'https://sponsor.ajay.app/api/getTotalStats',
        expect.anything(),
      );
    });
  });
});
