import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YoutubeService } from './youtube.service.js';
import { UsersService } from '../../users/services/users/users.service.js';
import { UnauthorizedException } from '@nestjs/common';

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
});
