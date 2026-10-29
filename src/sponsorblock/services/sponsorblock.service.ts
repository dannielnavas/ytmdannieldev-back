import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import axios from 'axios';
import crypto from 'node:crypto';
import config from '../../config.js';
import type {
  SponsorBlockHashedVideo,
  SponsorBlockLockCategories,
  SponsorBlockSegment,
  SponsorBlockSegmentInfo,
  SponsorBlockSubmittedSegmentResponse,
  SponsorBlockTotalStats,
  SponsorBlockUserInfo,
  SponsorBlockUserStats,
} from '../interfaces/sponsorblock.interface.js';
import type { GetSkipSegmentsQueryDto } from '../dtos/get-skip-segments-query.dto.js';
import type { GetHashPrefixQueryDto } from '../dtos/get-hash-prefix-query.dto.js';
import type { SubmitSegmentsDto } from '../dtos/submit-segments.dto.js';
import type { VoteSegmentDto } from '../dtos/vote-segment.dto.js';
import type { ViewedSegmentDto } from '../dtos/viewed-segment.dto.js';
import type { UserInfoQueryDto } from '../dtos/user-info-query.dto.js';
import type { UserStatsQueryDto } from '../dtos/user-stats-query.dto.js';

export const DEFAULT_MUSIC_CATEGORIES = [
  'sponsor',
  'music_offtopic',
  'intro',
  'outro',
  'selfpromo',
  'preview',
  'interaction',
];

@Injectable()
export class SponsorblockService {
  private readonly logger = new Logger(SponsorblockService.name);
  private readonly baseUrl: string;
  private readonly memoryCache = new Map<
    string,
    { data: any; expiresAt: number }
  >();
  private readonly cacheTtlMs = 10 * 60 * 1000; // 10 minutes cache

  constructor(
    @Inject(config.KEY)
    private readonly configService: ConfigType<typeof config>,
  ) {
    this.baseUrl = (
      this.configService.sponsorBlockUrl || 'https://sponsor.ajay.app'
    ).replace(/\/$/, '');
  }

  private getCached<T>(key: string): T | null {
    const item = this.memoryCache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return item.data as T;
  }

  private setCache(key: string, data: any, ttl = this.cacheTtlMs): void {
    this.memoryCache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Cleans a YouTube video ID by stripping common prefixes.
   */
  cleanVideoId(videoId: string): string {
    return videoId.replace(/^RDAM(?:VM|PL)/, '').trim();
  }

  /**
   * Hashes a YouTube video ID to a SHA-256 hex string.
   */
  hashVideoId(videoId: string): string {
    return crypto.createHash('sha256').update(videoId).digest('hex');
  }

  /**
   * Fetches skip segments for a specific video ID.
   * Returns empty array if no segments exist (SponsorBlock 404).
   */
  async getSkipSegments(
    videoId: string,
    query?: Partial<GetSkipSegmentsQueryDto>,
  ): Promise<SponsorBlockSegment[]> {
    const cleanId = this.cleanVideoId(videoId);
    if (!cleanId) {
      throw new BadRequestException('videoID is required');
    }

    const categories =
      query?.categories && query.categories.length > 0
        ? query.categories
        : DEFAULT_MUSIC_CATEGORIES;

    const actionTypes =
      query?.actionTypes && query.actionTypes.length > 0
        ? query.actionTypes
        : ['skip'];

    const cacheKey = `segments:${cleanId}:${categories.slice().sort().join(',')}:${actionTypes.slice().sort().join(',')}`;
    const cached = this.getCached<SponsorBlockSegment[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const params: Record<string, string> = {
      videoID: cleanId,
      categories: JSON.stringify(categories),
      actionTypes: JSON.stringify(actionTypes),
    };

    if (query?.requiredSegments && query.requiredSegments.length > 0) {
      params['requiredSegments'] = JSON.stringify(query.requiredSegments);
    }

    if (query?.service) {
      params['service'] = query.service;
    }

    try {
      const response = await axios.get<SponsorBlockSegment[]>(
        `${this.baseUrl}/api/skipSegments`,
        {
          params,
          timeout: 6000,
        },
      );

      const segments = Array.isArray(response.data) ? response.data : [];
      this.setCache(cacheKey, segments);
      return segments;
    } catch (error: any) {
      // 404 means no segments submitted for this video yet
      if (error?.response?.status === 404) {
        this.setCache(cacheKey, [], 5 * 60 * 1000); // cache empty response for 5 minutes
        return [];
      }

      this.logger.error(
        `Failed to fetch skipSegments for ${cleanId}: ${error?.message}`,
      );
      if (error?.response) {
        throw new HttpException(
          error.response.data || 'Error fetching skip segments',
          error.response.status,
        );
      }
      throw new InternalServerErrorException(
        'Error connecting to SponsorBlock',
      );
    }
  }

  /**
   * Safely fetches skip segments for a video ID without throwing exceptions.
   * Always returns an array (empty if not found or on error).
   */
  async getSkipSegmentsSafe(
    videoId?: string | null,
    query?: Partial<GetSkipSegmentsQueryDto>,
  ): Promise<SponsorBlockSegment[]> {
    if (!videoId || typeof videoId !== 'string') {
      return [];
    }
    const cleanId = this.cleanVideoId(videoId);
    if (!cleanId) {
      return [];
    }
    try {
      return await this.getSkipSegments(cleanId, query);
    } catch {
      return [];
    }
  }

  /**
   * Enriches a list of track/song objects with their SponsorBlock `skipSegments`
   * using controlled concurrency and in-memory caching.
   */
  async enrichTracksWithSegments<T extends Record<string, any>>(
    tracks: T[],
    concurrency = 8,
  ): Promise<Array<T & { skipSegments: SponsorBlockSegment[] }>> {
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return [];
    }

    const extractId = (item: Record<string, any>): string => {
      const raw = item?.videoId ?? item?.youtubeId ?? item?.video_id ?? '';
      return typeof raw === 'string' ? this.cleanVideoId(raw) : '';
    };

    const uniqueIds = Array.from(
      new Set(tracks.map(extractId).filter((id) => Boolean(id))),
    );

    const segmentsMap = new Map<string, SponsorBlockSegment[]>();

    if (uniqueIds.length > 0) {
      const workerCount = Math.max(1, Math.min(concurrency, uniqueIds.length));
      let index = 0;

      const workers = Array.from({ length: workerCount }, async () => {
        while (index < uniqueIds.length) {
          const currentIndex = index++;
          const id = uniqueIds[currentIndex];
          const segments = await this.getSkipSegmentsSafe(id);
          segmentsMap.set(id, segments);
        }
      });

      await Promise.all(workers);
    }

    return tracks.map((track) => {
      const cleanId = extractId(track);
      return {
        ...track,
        skipSegments: cleanId ? (segmentsMap.get(cleanId) ?? []) : [],
      };
    });
  }

  /**
   * Fetches segments by SHA-256 hash prefix for high privacy.
   */
  async getSkipSegmentsByHashPrefix(
    prefix: string,
    query?: Partial<GetHashPrefixQueryDto>,
  ): Promise<SponsorBlockHashedVideo[]> {
    const cleanPrefix = prefix.trim().toLowerCase();
    if (!cleanPrefix || cleanPrefix.length < 4 || cleanPrefix.length > 32) {
      throw new BadRequestException(
        'prefix must be between 4 and 32 characters',
      );
    }

    const categories =
      query?.categories && query.categories.length > 0
        ? query.categories
        : DEFAULT_MUSIC_CATEGORIES;

    const actionTypes =
      query?.actionTypes && query.actionTypes.length > 0
        ? query.actionTypes
        : ['skip'];

    const cacheKey = `hash:${cleanPrefix}:${categories.slice().sort().join(',')}:${actionTypes.slice().sort().join(',')}`;
    const cached = this.getCached<SponsorBlockHashedVideo[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const params: Record<string, any> = {
      categories: JSON.stringify(categories),
      actionTypes: JSON.stringify(actionTypes),
    };

    if (query?.requiredSegments && query.requiredSegments.length > 0) {
      params['requiredSegments'] = JSON.stringify(query.requiredSegments);
    }

    if (query?.service) {
      params['service'] = query.service;
    }

    if (query?.trimUUIDs) {
      params['trimUUIDs'] = true;
    }

    try {
      const response = await axios.get<SponsorBlockHashedVideo[]>(
        `${this.baseUrl}/api/skipSegments/${cleanPrefix}`,
        {
          params,
          timeout: 6000,
        },
      );

      const data = Array.isArray(response.data) ? response.data : [];
      this.setCache(cacheKey, data);
      return data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        this.setCache(cacheKey, [], 5 * 60 * 1000);
        return [];
      }

      this.logger.error(
        `Failed to fetch skipSegments by prefix ${cleanPrefix}: ${error?.message}`,
      );
      if (error?.response) {
        throw new HttpException(
          error.response.data || 'Error fetching hashed segments',
          error.response.status,
        );
      }
      throw new InternalServerErrorException(
        'Error connecting to SponsorBlock',
      );
    }
  }

  /**
   * Fetches skip segments for a video using the privacy hash prefix method.
   */
  async getSkipSegmentsWithPrivacy(
    videoId: string,
    query?: Partial<GetSkipSegmentsQueryDto>,
  ): Promise<SponsorBlockSegment[]> {
    const cleanId = this.cleanVideoId(videoId);
    const hash = this.hashVideoId(cleanId);
    const prefix = hash.slice(0, 4);

    const hashedVideos = await this.getSkipSegmentsByHashPrefix(prefix, {
      categories: query?.categories,
      actionTypes: query?.actionTypes,
      requiredSegments: query?.requiredSegments,
      service: query?.service,
    });

    const match = hashedVideos.find((item) => item.videoID === cleanId);
    return match ? match.segments : [];
  }

  /**
   * Submits new segments for a video.
   */
  async submitSegments(
    dto: SubmitSegmentsDto,
  ): Promise<SponsorBlockSubmittedSegmentResponse[]> {
    const cleanId = this.cleanVideoId(dto.videoID);
    const payload = {
      videoID: cleanId,
      userID: dto.userID,
      userAgent: dto.userAgent || 'ytmdannieldev/1.0.0',
      service: dto.service || 'YouTube',
      videoDuration: dto.videoDuration,
      segments: dto.segments.map((s) => ({
        segment: s.segment,
        category: s.category,
        actionType: s.actionType || 'skip',
        description: s.description || '',
      })),
    };

    try {
      const response = await axios.post<SponsorBlockSubmittedSegmentResponse[]>(
        `${this.baseUrl}/api/skipSegments`,
        payload,
        {
          timeout: 8000,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to submit segments: ${error?.message}`);
      if (error?.response) {
        throw new HttpException(
          error.response.data || 'Error submitting segments',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Error submitting segments');
    }
  }

  /**
   * Votes on a segment or changes its category.
   */
  async voteOnSegment(dto: VoteSegmentDto): Promise<{ success: boolean }> {
    const params: Record<string, any> = {
      UUID: dto.UUID,
      userID: dto.userID,
    };

    if (dto.type !== undefined) {
      params['type'] = dto.type;
    }

    if (dto.category) {
      params['category'] = dto.category;
    }

    if (dto.videoID) {
      params['videoID'] = this.cleanVideoId(dto.videoID);
    }

    try {
      await axios.post(`${this.baseUrl}/api/voteOnSponsorTime`, null, {
        params,
        timeout: 6000,
      });

      return { success: true };
    } catch (error: any) {
      this.logger.error(
        `Failed to vote on segment ${dto.UUID}: ${error?.message}`,
      );
      if (error?.response) {
        throw new HttpException(
          error.response.data || 'Error voting on segment',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Error voting on segment');
    }
  }

  /**
   * Reports that a segment has been viewed/skipped by a client.
   */
  async recordView(dto: ViewedSegmentDto): Promise<{ success: boolean }> {
    try {
      await axios.post(`${this.baseUrl}/api/viewedVideoSponsorTime`, null, {
        params: { UUID: dto.UUID },
        timeout: 6000,
      });

      return { success: true };
    } catch (error: any) {
      this.logger.error(
        `Failed to record view for ${dto.UUID}: ${error?.message}`,
      );
      if (error?.response) {
        throw new HttpException(
          error.response.data || 'Error recording view',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Error recording view');
    }
  }

  /**
   * Retrieves user profile details.
   */
  async getUserInfo(query: UserInfoQueryDto): Promise<SponsorBlockUserInfo> {
    const params: Record<string, any> = {};
    if (query.userID) params['userID'] = query.userID;
    if (query.publicUserID) params['publicUserID'] = query.publicUserID;
    if (query.values && query.values.length > 0) {
      params['values'] = JSON.stringify(query.values);
    }

    if (!params['userID'] && !params['publicUserID']) {
      throw new BadRequestException(
        'Either userID or publicUserID is required',
      );
    }

    try {
      const response = await axios.get<SponsorBlockUserInfo>(
        `${this.baseUrl}/api/userInfo`,
        { params, timeout: 6000 },
      );
      return response.data;
    } catch (error: any) {
      if (error?.response) {
        throw new HttpException(
          error.response.data || 'Error fetching user info',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Error fetching user info');
    }
  }

  /**
   * Retrieves statistical metrics for a user.
   */
  async getUserStats(query: UserStatsQueryDto): Promise<SponsorBlockUserStats> {
    const params: Record<string, any> = {};
    if (query.userID) params['userID'] = query.userID;
    if (query.publicUserID) params['publicUserID'] = query.publicUserID;
    if (query.fetchCategoryStats !== undefined) {
      params['fetchCategoryStats'] = query.fetchCategoryStats;
    }
    if (query.fetchActionTypeStats !== undefined) {
      params['fetchActionTypeStats'] = query.fetchActionTypeStats;
    }

    if (!params['userID'] && !params['publicUserID']) {
      throw new BadRequestException(
        'Either userID or publicUserID is required',
      );
    }

    try {
      const response = await axios.get<SponsorBlockUserStats>(
        `${this.baseUrl}/api/userStats`,
        { params, timeout: 6000 },
      );
      return response.data;
    } catch (error: any) {
      if (error?.response) {
        throw new HttpException(
          error.response.data || 'Error fetching user stats',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Error fetching user stats');
    }
  }

  /**
   * Fetches metadata for specific segment UUIDs.
   */
  async getSegmentInfo(uuids: string[]): Promise<SponsorBlockSegmentInfo[]> {
    if (!uuids || uuids.length === 0) {
      throw new BadRequestException('At least one UUID is required');
    }

    const limitedUuids = uuids.slice(0, 10);
    try {
      const response = await axios.get<SponsorBlockSegmentInfo[]>(
        `${this.baseUrl}/api/segmentInfo`,
        {
          params: { UUIDs: JSON.stringify(limitedUuids) },
          timeout: 6000,
        },
      );
      return response.data;
    } catch (error: any) {
      if (error?.response) {
        throw new HttpException(
          error.response.data || 'Error fetching segment info',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Error fetching segment info');
    }
  }

  /**
   * Retrieves locked categories for a video.
   */
  async getLockCategories(
    videoId: string,
    actionTypes?: string[],
  ): Promise<SponsorBlockLockCategories> {
    const cleanId = this.cleanVideoId(videoId);
    const params: Record<string, any> = { videoID: cleanId };
    if (actionTypes && actionTypes.length > 0) {
      params['actionTypes'] = JSON.stringify(actionTypes);
    }

    try {
      const response = await axios.get<SponsorBlockLockCategories>(
        `${this.baseUrl}/api/lockCategories`,
        { params, timeout: 6000 },
      );
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return { categories: [], reason: 'None locked' };
      }
      if (error?.response) {
        throw new HttpException(
          error.response.data || 'Error fetching lock categories',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Error fetching lock categories');
    }
  }

  /**
   * Fetches total global platform statistics.
   */
  async getTotalStats(): Promise<SponsorBlockTotalStats> {
    const cacheKey = 'totalStats';
    const cached = this.getCached<SponsorBlockTotalStats>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get<SponsorBlockTotalStats>(
        `${this.baseUrl}/api/getTotalStats`,
        { timeout: 6000 },
      );
      this.setCache(cacheKey, response.data, 30 * 60 * 1000); // 30 min cache
      return response.data;
    } catch (error: any) {
      if (error?.response) {
        throw new HttpException(
          error.response.data || 'Error fetching total stats',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Error fetching total stats');
    }
  }

  /**
   * Fetches human-readable formatted days saved globally.
   */
  async getDaysSavedFormatted(): Promise<{ daysSaved: string }> {
    const cacheKey = 'daysSavedFormatted';
    const cached = this.getCached<{ daysSaved: string }>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get<string | { daysSaved: string }>(
        `${this.baseUrl}/api/getDaysSavedFormatted`,
        { timeout: 6000 },
      );

      const daysSaved =
        typeof response.data === 'string'
          ? response.data
          : (response.data as any)?.daysSaved || String(response.data);

      const result = { daysSaved };
      this.setCache(cacheKey, result, 30 * 60 * 1000);
      return result;
    } catch (error: any) {
      if (error?.response) {
        throw new HttpException(
          error.response.data || 'Error fetching formatted days saved',
          error.response.status,
        );
      }
      throw new InternalServerErrorException(
        'Error fetching formatted days saved',
      );
    }
  }
}
