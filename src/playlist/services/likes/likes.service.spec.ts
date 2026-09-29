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
    createQueryBuilder: vi.fn(),
  };

  const mockTrackRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  beforeEach(async () => {
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
});

