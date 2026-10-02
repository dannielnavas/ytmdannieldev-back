import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service.js';
import { LikesService } from '../../playlist/services/likes/likes.service.js';
import { LastfmService } from '../../lastfm/services/lastfm.service.js';
import { YoutubeService } from '../../youtube/services/youtube.service.js';

describe('DashboardService', () => {
  let service: DashboardService;

  const mockLikesService = {
    getUserStatsSummary: vi.fn(),
    getTopArtists: vi.fn(),
    getRecentLikes: vi.fn(),
  };

  const mockLastfmService = {
    getArtistInfo: vi.fn(),
    getArtistTopTags: vi.fn(),
    getSimilarArtists: vi.fn(),
    extractBestImage: vi.fn(),
  };

  const mockYoutubeService = {
    getDashboardData: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: LikesService, useValue: mockLikesService },
        { provide: LastfmService, useValue: mockLastfmService },
        { provide: YoutubeService, useValue: mockYoutubeService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboard - Fallback a YouTube si no hay likes', () => {
    it('should return activeView "youtube" and personal null when user has 0 likes', async () => {
      mockLikesService.getUserStatsSummary.mockResolvedValueOnce({
        totalLikes: 0,
        totalDurationSeconds: 0,
        uniqueArtistsCount: 0,
      });

      const mockYtSections = [{ title: 'Recomendaciones', items: [] }];
      mockYoutubeService.getDashboardData.mockResolvedValueOnce(mockYtSections);

      const result = await service.getDashboard(1);

      expect(result.hasPersonalData).toBe(false);
      expect(result.activeView).toBe('youtube');
      expect(result.personal).toBeNull();
      expect(result.youtube).toEqual(mockYtSections);
      expect(mockYoutubeService.getDashboardData).toHaveBeenCalledWith(1, false);
    });
  });

  describe('getDashboard - Personal Dashboard protagonista cuando hay likes', () => {
    it('should return activeView "personal", enriched data with Last.fm, and secondary youtube feed', async () => {
      mockLikesService.getUserStatsSummary.mockResolvedValueOnce({
        totalLikes: 10,
        totalDurationSeconds: 2400,
        uniqueArtistsCount: 3,
      });

      mockLikesService.getTopArtists.mockResolvedValueOnce([
        { artist: 'Daft Punk', likesCount: 6, totalDuration: 1500 },
        { artist: 'Gorillaz', likesCount: 4, totalDuration: 900 },
      ]);

      mockLikesService.getRecentLikes.mockResolvedValueOnce([
        {
          id: 'track-1',
          youtubeId: 'yt-1',
          title: 'One More Time',
          artist: 'Daft Punk',
          duration: 320,
        },
      ]);

      mockLastfmService.getArtistInfo.mockResolvedValue({
        name: 'Daft Punk',
        bio: { summary: 'French electronic duo <a href="...">Read more</a>' },
        stats: { listeners: '5000000' },
        image: [{ '#text': 'https://image.url', size: 'mega' }],
        url: 'https://last.fm/music/Daft+Punk',
      });
      mockLastfmService.extractBestImage.mockReturnValue('https://image.url');

      mockLastfmService.getArtistTopTags.mockImplementation(
        async (artist: string) => {
          if (artist === 'Daft Punk') {
            return [
              { name: 'electronic', count: 100 },
              { name: 'house', count: 80 },
            ];
          }
          return [{ name: 'alternative rock', count: 90 }];
        },
      );

      mockLastfmService.getSimilarArtists.mockResolvedValue([
        { name: 'Justice', match: '0.88', url: 'https://last.fm/music/Justice' },
      ]);

      const mockYtSections = [{ title: 'Novedades', items: [] }];
      mockYoutubeService.getDashboardData.mockResolvedValueOnce(mockYtSections);

      const result = await service.getDashboard(1);

      expect(result.hasPersonalData).toBe(true);
      expect(result.activeView).toBe('personal');
      expect(result.personal).toBeDefined();

      // KPIs
      expect(result.personal?.kpis.totalLikes).toBe(10);
      expect(result.personal?.kpis.favoriteArtist).toBe('Daft Punk');
      expect(result.personal?.kpis.totalMinutes).toBe(40);

      // Top artists enriquecidos
      expect(result.personal?.topArtists).toHaveLength(2);
      expect(result.personal?.topArtists[0].bio).toBe(
        'French electronic duo Read more',
      );
      expect(result.personal?.topArtists[0].imageUrl).toBe('https://image.url');

      // Géneros
      expect(result.personal?.topGenres.length).toBeGreaterThan(0);

      // Recomendaciones
      expect(result.personal?.recommendations).toHaveLength(1);
      expect(result.personal?.recommendations[0].name).toBe('Justice');

      // YouTube coexistiendo
      expect(result.youtube).toEqual(mockYtSections);
    });
  });
});
