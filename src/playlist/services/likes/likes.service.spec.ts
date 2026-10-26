import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LikesService } from './likes.service.js';
import { UserLike } from '../../entities/user-like.entity.js';
import { Track } from '../../entities/track.entity.js';

describe('LikesService', () => {
  let service: LikesService;

  const mockUserLikeRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    find: vi.fn(),
    count: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const mockTrackRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LikesService,
        {
          provide: getRepositoryToken(UserLike),
          useValue: mockUserLikeRepo,
        },
        {
          provide: getRepositoryToken(Track),
          useValue: mockTrackRepo,
        },
      ],
    }).compile();

    service = module.get<LikesService>(LikesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('toggleLike', () => {
    const trackInput = {
      youtubeId: 'abc123',
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    };

    it('should add like if not liked yet', async () => {
      mockTrackRepo.findOne.mockResolvedValue(null);
      mockTrackRepo.create.mockReturnValue({ id: 'uuid-track', ...trackInput });
      mockTrackRepo.save.mockResolvedValue({ id: 'uuid-track', ...trackInput });
      mockUserLikeRepo.findOne.mockResolvedValue(null);
      mockUserLikeRepo.create.mockReturnValue({
        userId: 1,
        trackId: 'uuid-track',
      });
      mockUserLikeRepo.save.mockResolvedValue({
        id: 'uuid-like',
        userId: 1,
        trackId: 'uuid-track',
      });

      const res = await service.toggleLike(1, trackInput);
      expect(res).toEqual({ isLiked: true });
      expect(mockUserLikeRepo.save).toHaveBeenCalled();
    });

    it('should remove like if already liked', async () => {
      mockTrackRepo.findOne.mockResolvedValue({
        id: 'uuid-track',
        ...trackInput,
      });
      mockUserLikeRepo.findOne.mockResolvedValue({
        id: 'uuid-like',
        userId: 1,
        trackId: 'uuid-track',
      });
      mockUserLikeRepo.remove.mockResolvedValue({});

      const res = await service.toggleLike(1, trackInput);
      expect(res).toEqual({ isLiked: false });
      expect(mockUserLikeRepo.remove).toHaveBeenCalled();
    });
  });

  describe('getUserLikedTracks', () => {
    it('should return plain track array if no pagination query is provided', async () => {
      const mockTracks = [
        { track: { id: '1', title: 'Song 1' } },
        { track: { id: '2', title: 'Song 2' } },
      ];
      const qbMock: any = {
        innerJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue(mockTracks),
      };
      mockUserLikeRepo.createQueryBuilder.mockReturnValue(qbMock);

      const res = await service.getUserLikedTracks(1);
      expect(Array.isArray(res)).toBe(true);
      expect(res).toEqual([{ id: '1', title: 'Song 1' }, { id: '2', title: 'Song 2' }]);
    });

    it('should return paginated data with meta when page or limit is provided', async () => {
      const mockTracks = [{ track: { id: '1', title: 'Song 1' } }];
      const qbMock: any = {
        innerJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([mockTracks, 1]),
      };
      mockUserLikeRepo.createQueryBuilder.mockReturnValue(qbMock);

      const res = await service.getUserLikedTracks(1, { page: 1, limit: 10, search: 'Song' });
      expect(res).toHaveProperty('data');
      expect(res).toHaveProperty('meta');
      expect((res as any).meta.total).toBe(1);
    });
  });

  describe('checkLikesBulk', () => {
    it('should return mapped booleans for requested youtube ids', async () => {
      const qbMock: any = {
        innerJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue([{ youtubeId: 'abc' }]),
      };
      mockUserLikeRepo.createQueryBuilder.mockReturnValue(qbMock);

      const res = await service.checkLikesBulk(1, ['abc', 'def']);
      expect(res.likedIds).toEqual(['abc']);
      expect(res.map).toEqual({ abc: true, def: false });
    });
  });

  describe('getForgottenLikes', () => {
    it('should return oldest liked tracks', async () => {
      mockUserLikeRepo.find.mockResolvedValue([
        { track: { id: 'track-old', title: 'Old Song' } },
      ]);

      const res = await service.getForgottenLikes(1, 5);
      expect(res).toEqual([{ id: 'track-old', title: 'Old Song' }]);
    });
  });
});
