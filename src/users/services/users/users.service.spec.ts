import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service.js';
import { Users } from '../../entities/user.entity.js';
import config from '../../../config.js';

describe('UsersService', () => {
  let service: UsersService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: config.KEY,
          useValue: {},
        },
        {
          provide: getRepositoryToken(Users),
          useValue: {
            findOne: vi.fn(),
            create: vi.fn(),
            save: vi.fn(),
            merge: vi.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a new user if it does not exist', async () => {
    const userRepo = moduleRef.get(getRepositoryToken(Users));
    vi.spyOn(userRepo, 'findOne').mockResolvedValue(null);
    vi.spyOn(userRepo, 'create').mockImplementation((dto: any) => dto);
    vi.spyOn(userRepo, 'save').mockImplementation((user: any) =>
      Promise.resolve({ user_id: 1, ...user }),
    );

    const result = await service.create({
      is_authenticated: true,
      is_youtube_premium: true,
      full_name: 'Test User',
      email: 'test@example.com',
      profile_image: 'https://example.com/photo.jpg',
      youtube_handle: '@test',
      youtube_channel_id: 'UC123456789',
      youtube_cookies: 'test_cookies',
    });

    expect(result).toHaveProperty('user_id', 1);
    expect(result.youtube_channel_id).toBe('UC123456789');
    expect(userRepo.create).toHaveBeenCalled();
    expect(userRepo.save).toHaveBeenCalled();
  });

  it('should update existing user if already exists', async () => {
    const existing = {
      user_id: 1,
      youtube_channel_id: 'UC123456789',
      youtube_cookies: 'old_cookies',
      profile_image: null,
    };
    const userRepo = moduleRef.get(getRepositoryToken(Users));
    vi.spyOn(userRepo, 'findOne').mockResolvedValue(existing as any);
    vi.spyOn(userRepo, 'merge').mockImplementation((target: any, source: any) =>
      Object.assign(target, source),
    );
    vi.spyOn(userRepo, 'save').mockImplementation((user: any) =>
      Promise.resolve(user),
    );

    const result = await service.create({
      is_authenticated: true,
      is_youtube_premium: false,
      full_name: 'Updated Name',
      email: 'updated@example.com',
      profile_image: 'https://example.com/new.jpg',
      youtube_handle: '@updated',
      youtube_channel_id: 'UC123456789',
      youtube_cookies: 'new_cookies',
    });

    expect(result.user_id).toBe(1);
    expect(result.youtube_cookies).toBe('new_cookies');
    expect(userRepo.merge).toHaveBeenCalled();
    expect(userRepo.save).toHaveBeenCalled();
  });
});
