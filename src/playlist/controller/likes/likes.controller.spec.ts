import { Test, TestingModule } from '@nestjs/testing';
import { LikesController } from './likes.controller.js';
import { LikesService } from '../../services/likes/likes.service.js';

describe('LikesController', () => {
  let controller: LikesController;

  const mockLikesService = {
    toggleLike: vi.fn(),
    getUserLikedTracks: vi.fn(),
    isTrackLiked: vi.fn(),
    checkLikesBulk: vi.fn(),
    getForgottenLikes: vi.fn(),
    getLikedRadio: vi.fn(),
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

  it('should call checkBulk', async () => {
    mockLikesService.checkLikesBulk.mockResolvedValue({ likedIds: ['1'], map: { '1': true } });
    const fakeReq: any = { user: { sub: '1' } };
    const res = await controller.checkBulk({ youtubeIds: ['1'] }, fakeReq);
    expect(res).toEqual({ likedIds: ['1'], map: { '1': true } });
    expect(mockLikesService.checkLikesBulk).toHaveBeenCalledWith(1, ['1']);
  });

  it('should call getForgotten', async () => {
    mockLikesService.getForgottenLikes.mockResolvedValue([]);
    const fakeReq: any = { user: { sub: '1' } };
    const res = await controller.getForgotten(10, fakeReq);
    expect(res).toEqual([]);
    expect(mockLikesService.getForgottenLikes).toHaveBeenCalledWith(1, 10);
  });

  it('should call getRadio', async () => {
    mockLikesService.getLikedRadio.mockResolvedValue([]);
    const fakeReq: any = { user: { sub: '1' } };
    const res = await controller.getRadio(20, fakeReq);
    expect(res).toEqual([]);
    expect(mockLikesService.getLikedRadio).toHaveBeenCalledWith(1, 20);
  });
});
