import { Test, TestingModule } from '@nestjs/testing';
import { LikesController } from './likes.controller.js';
import { LikesService } from '../../services/likes/likes.service.js';

describe('LikesController', () => {
  let controller: LikesController;

  const mockLikesService = {
    toggleLike: vi.fn(),
    getUserLikedTracks: vi.fn(),
    isTrackLiked: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LikesController],
      providers: [
        {
          provide: LikesService,
          useValue: mockLikesService,
        },
      ],
    }).compile();

    controller = module.get<LikesController>(LikesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

