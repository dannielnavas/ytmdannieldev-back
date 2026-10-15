import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { SponsorblockController } from './sponsorblock.controller.js';
import { SponsorblockService } from '../services/sponsorblock.service.js';

describe('SponsorblockController', () => {
  let controller: SponsorblockController;
  let service: SponsorblockService;

  const mockSponsorblockService = {
    getSkipSegments: vi.fn(),
    getSkipSegmentsByHashPrefix: vi.fn(),
    submitSegments: vi.fn(),
    voteOnSegment: vi.fn(),
    recordView: vi.fn(),
    getUserInfo: vi.fn(),
    getUserStats: vi.fn(),
    getSegmentInfo: vi.fn(),
    getLockCategories: vi.fn(),
    getTotalStats: vi.fn(),
    getDaysSavedFormatted: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SponsorblockController],
      providers: [
        {
          provide: SponsorblockService,
          useValue: mockSponsorblockService,
        },
      ],
    }).compile();

    controller = module.get<SponsorblockController>(SponsorblockController);
    service = module.get<SponsorblockService>(SponsorblockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSkipSegments', () => {
    it('should call service with query videoID', async () => {
      mockSponsorblockService.getSkipSegments.mockResolvedValueOnce([]);

      await controller.getSkipSegments({ videoID: 'dQw4w9WgXcQ' });

      expect(service.getSkipSegments).toHaveBeenCalledWith('dQw4w9WgXcQ', {
        videoID: 'dQw4w9WgXcQ',
      });
    });

    it('should throw BadRequestException if videoID is missing', async () => {
      await expect(controller.getSkipSegments({})).rejects.toThrow();
    });
  });

  describe('getSegmentsByParam', () => {
    it('should call service with path param videoId', async () => {
      mockSponsorblockService.getSkipSegments.mockResolvedValueOnce([]);

      await controller.getSegmentsByParam('dQw4w9WgXcQ', {});

      expect(service.getSkipSegments).toHaveBeenCalledWith(
        'dQw4w9WgXcQ',
        {},
      );
    });
  });

  describe('getSegmentsByHash', () => {
    it('should call service with hash prefix', async () => {
      mockSponsorblockService.getSkipSegmentsByHashPrefix.mockResolvedValueOnce(
        [],
      );

      await controller.getSegmentsByHash('1a2b', {});

      expect(service.getSkipSegmentsByHashPrefix).toHaveBeenCalledWith(
        '1a2b',
        {},
      );
    });
  });

  describe('submitSegments', () => {
    it('should delegate to service', async () => {
      const dto = {
        videoID: 'dQw4w9WgXcQ',
        userID: 'a'.repeat(32),
        segments: [
          {
            segment: [0, 10] as [number, number],
            category: 'music_offtopic',
          },
        ],
      };
      mockSponsorblockService.submitSegments.mockResolvedValueOnce([]);

      await controller.submitSegments(dto);

      expect(service.submitSegments).toHaveBeenCalledWith(dto);
    });
  });

  describe('voteOnSegment', () => {
    it('should delegate to service', async () => {
      const dto = { UUID: 'uuid-1', userID: 'a'.repeat(32), type: 1 };
      mockSponsorblockService.voteOnSegment.mockResolvedValueOnce({
        success: true,
      });

      const res = await controller.voteOnSegment(dto);

      expect(res).toEqual({ success: true });
      expect(service.voteOnSegment).toHaveBeenCalledWith(dto);
    });
  });

  describe('recordView', () => {
    it('should delegate to service', async () => {
      const dto = { UUID: 'uuid-1' };
      mockSponsorblockService.recordView.mockResolvedValueOnce({
        success: true,
      });

      const res = await controller.recordView(dto);

      expect(res).toEqual({ success: true });
      expect(service.recordView).toHaveBeenCalledWith(dto);
    });
  });

  describe('getTotalStats', () => {
    it('should return global stats from service', async () => {
      const stats = { userCount: 100 } as any;
      mockSponsorblockService.getTotalStats.mockResolvedValueOnce(stats);

      const res = await controller.getTotalStats();

      expect(res).toEqual(stats);
      expect(service.getTotalStats).toHaveBeenCalled();
    });
  });
});
