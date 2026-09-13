import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';
import { UsersService } from '../../../users/services/users/users.service.js';
import { JwtService } from '@nestjs/jwt';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {},
        },
        {
          provide: JwtService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parseYTCookies', () => {
    it('should parse standard cookie string', () => {
      const parsed = service.parseYTCookies('HSID=123; SSID=456; SAPISID=789');
      expect(parsed.cookies.HSID).toBe('123');
      expect(parsed.cookies.SSID).toBe('456');
      expect(parsed.cookies.SAPISID).toBe('789');
      expect(parsed.cookieString).toContain('SAPISID=789');
    });

    it('should parse JSON array of cookies', () => {
      const jsonStr = JSON.stringify([
        { name: 'SAPISID', value: 'secret123' },
        { name: 'SSID', value: 'ssid123' },
      ]);
      const parsed = service.parseYTCookies(jsonStr);
      expect(parsed.cookies.SAPISID).toBe('secret123');
      expect(parsed.cookies.SSID).toBe('ssid123');
    });
  });

  describe('extractYoutubeAccountInfo', () => {
    it('should extract name, email, avatar and detect premium status', async () => {
      const mockResponse = {
        actions: [
          {
            openPopupAction: {
              popup: {
                multiPageMenuRenderer: {
                  header: {
                    activeAccountHeaderRenderer: {
                      accountName: { runs: [{ text: 'Danniel Navas' }] },
                      email: { runs: [{ text: 'danniel@gmail.com' }] },
                      channelHandle: { runs: [{ text: '@dannieldev' }] },
                      accountPhoto: {
                        thumbnails: [
                          { url: 'https://lh3.googleusercontent.com/small.png', width: 40 },
                          { url: 'https://lh3.googleusercontent.com/large.png', width: 120 },
                        ],
                      },
                    },
                  },
                  sections: [
                    {
                      multiPageMenuSectionRenderer: {
                        items: [
                          {
                            compactLinkRenderer: {
                              title: { runs: [{ text: 'Tu canal' }] },
                              navigationEndpoint: {
                                browseEndpoint: { browseId: 'UC1234567890' },
                              },
                            },
                          },
                          {
                            compactLinkRenderer: {
                              title: { runs: [{ text: 'Compras y membresías' }] },
                              navigationEndpoint: {
                                browseEndpoint: { browseId: 'SPmemberships' },
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return {
          ok: true,
          json: async () => mockResponse,
        } as any;
      });

      const result = await service.extractYoutubeAccountInfo('SAPISID=test1234; SSID=xyz');
      expect(result.is_authenticated).toBe(true);
      expect(result.is_youtube_premium).toBe(true);
      expect(result.full_name).toBe('Danniel Navas');
      expect(result.email).toBe('danniel@gmail.com');
      expect(result.profile_image).toBe('https://lh3.googleusercontent.com/large.png');
      expect(result.youtube_handle).toBe('@dannieldev');
      expect(result.youtube_channel_id).toBe('UC1234567890');
    });
  });
});

