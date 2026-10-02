import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import config from '../../config.js';
import { LastfmService } from './lastfm.service.js';

vi.mock('axios');

describe('LastfmService', () => {
  let service: LastfmService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LastfmService,
        {
          provide: config.KEY,
          useValue: {
            apiKeyLastFM: 'test-api-key',
          },
        },
      ],
    }).compile();

    service = module.get<LastfmService>(LastfmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getArtistInfo', () => {
    it('should return artist info on successful API response', async () => {
      const mockArtistData = {
        name: 'Daft Punk',
        bio: { summary: 'Daft Punk was a French duo' },
        stats: { listeners: '6000000' },
        image: [{ '#text': 'https://image.url', size: 'mega' }],
      };

      vi.mocked(axios.get).mockResolvedValueOnce({
        data: { artist: mockArtistData },
      });

      const result = await service.getArtistInfo('Daft Punk');
      expect(result).toEqual(mockArtistData);
      expect(axios.get).toHaveBeenCalledWith(
        'https://ws.audioscrobbler.com/2.0/',
        expect.objectContaining({
          params: expect.objectContaining({
            method: 'artist.getinfo',
            artist: 'Daft Punk',
            api_key: 'test-api-key',
          }),
        }),
      );
    });

    it('should return cached data if called twice', async () => {
      const mockArtistData = { name: 'Daft Punk' };
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: { artist: mockArtistData },
      });

      const first = await service.getArtistInfo('Daft Punk');
      const second = await service.getArtistInfo('Daft Punk');

      expect(first).toEqual(mockArtistData);
      expect(second).toEqual(mockArtistData);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it('should return null when artistName is empty or fails gracefully', async () => {
      expect(await service.getArtistInfo('')).toBeNull();

      vi.mocked(axios.get).mockRejectedValueOnce(new Error('Network error'));
      const result = await service.getArtistInfo('NonExistentArtist');
      expect(result).toBeNull();
    });
  });

  describe('getArtistTopTags', () => {
    it('should return mapped tags array', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          toptags: {
            tag: [
              { name: 'Electronic', count: 100 },
              { name: 'House', count: 80 },
            ],
          },
        },
      });

      const tags = await service.getArtistTopTags('Daft Punk');
      expect(tags).toHaveLength(2);
      expect(tags[0].name).toBe('electronic');
      expect(tags[0].count).toBe(100);
    });
  });

  describe('getSimilarArtists', () => {
    it('should return similar artists array', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          similarartists: {
            artist: [{ name: 'Justice', match: '0.85' }],
          },
        },
      });

      const similar = await service.getSimilarArtists('Daft Punk', 3);
      expect(similar).toHaveLength(1);
      expect(similar[0].name).toBe('Justice');
    });
  });

  describe('extractBestImage', () => {
    it('should prefer mega and extralarge sizes', () => {
      const images = [
        { '#text': 'https://small.png', size: 'small' as const },
        { '#text': 'https://large.png', size: 'large' as const },
        { '#text': 'https://mega.png', size: 'mega' as const },
      ];

      expect(service.extractBestImage(images)).toBe('https://mega.png');
    });

    it('should return empty string if no images provided', () => {
      expect(service.extractBestImage([])).toBe('');
      expect(service.extractBestImage(undefined)).toBe('');
    });
  });
});
