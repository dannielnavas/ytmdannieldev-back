import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserLike } from '../../entities/user-like.entity.js';
import { Repository } from 'typeorm';
import { Track } from '../../entities/track.entity.js';
import { GetLikesQueryDto, ToggleLikeDto } from '../../dtos/like.dto.js';
import { YoutubeService } from '../../../youtube/services/youtube.service.js';

export type YoutubeTrackInput = ToggleLikeDto;

@Injectable()
export class LikesService {
  constructor(
    @InjectRepository(UserLike)
    private readonly likeRepo: Repository<UserLike>,
    @InjectRepository(Track)
    private readonly trackRepo: Repository<Track>,
    @Optional()
    private readonly youtubeService?: YoutubeService,
  ) {}

  // 1. Toggle: Da like si no existe, lo elimina si ya existía
  async toggleLike(
    userId: number,
    trackData: ToggleLikeDto,
  ): Promise<{ isLiked: boolean }> {
    // Asegurar que el track exista en DB
    let track = await this.trackRepo.findOne({
      where: { youtubeId: trackData.youtubeId },
    });
    if (!track) {
      track = this.trackRepo.create(trackData);
      track = await this.trackRepo.save(track);
    } else if (trackData.album && !track.album) {
      track.album = trackData.album;
      await this.trackRepo.save(track);
    }

    const existingLike = await this.likeRepo.findOne({
      where: { userId, trackId: track.id },
    });

    if (existingLike) {
      await this.likeRepo.remove(existingLike);
      return { isLiked: false };
    }

    const newLike = this.likeRepo.create({
      userId,
      trackId: track.id,
    });
    await this.likeRepo.save(newLike);
    return { isLiked: true };
  }

  // 2. Obtener lista con soporte de búsqueda, ordenamiento y paginación
  async getUserLikedTracks(
    userId: number,
    query?: GetLikesQueryDto,
  ): Promise<
    | Track[]
    | {
        data: Track[];
        meta: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        };
      }
  > {
    const qb = this.likeRepo
      .createQueryBuilder('like')
      .innerJoinAndSelect('like.track', 'track')
      .where('like.userId = :userId', { userId });

    if (query?.search && query.search.trim().length > 0) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere('(track.title ILIKE :term OR track.artist ILIKE :term)', {
        term,
      });
    }

    const sortBy = query?.sortBy || 'likedAt';
    const orderDirection =
      (query?.order?.toUpperCase() as 'ASC' | 'DESC') || 'DESC';

    if (sortBy === 'title') {
      qb.orderBy('track.title', orderDirection);
    } else if (sortBy === 'artist') {
      qb.orderBy('track.artist', orderDirection);
    } else if (sortBy === 'duration') {
      qb.orderBy('track.duration', orderDirection);
    } else {
      qb.orderBy('like.likedAt', orderDirection);
    }

    const isPaginated = query?.page !== undefined || query?.limit !== undefined;

    if (isPaginated) {
      const page = Math.max(1, query?.page || 1);
      const limit = Math.max(1, Math.min(100, query?.limit || 30));
      qb.skip((page - 1) * limit).take(limit);

      const [likes, total] = await qb.getManyAndCount();
      return {
        data: likes.map((like) => like.track),
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    const likes = await qb.getMany();
    return likes.map((like) => like.track);
  }

  // 3. Chequear estado para la canción actual
  async isTrackLiked(userId: number, youtubeId: string): Promise<boolean> {
    const count = await this.likeRepo
      .createQueryBuilder('like')
      .innerJoin('like.track', 'track')
      .where('like.userId = :userId', { userId })
      .andWhere('track.youtubeId = :youtubeId', { youtubeId })
      .getCount();

    return count > 0;
  }

  // 4. Chequear estado de múltiples canciones en una sola llamada (bulk check)
  async checkLikesBulk(
    userId: number,
    youtubeIds: string[],
  ): Promise<{ likedIds: string[]; map: Record<string, boolean> }> {
    if (!youtubeIds || youtubeIds.length === 0) {
      return { likedIds: [], map: {} };
    }

    // Limitar para seguridad
    const safeIds = Array.from(new Set(youtubeIds)).slice(0, 200);

    const likes = await this.likeRepo
      .createQueryBuilder('like')
      .innerJoin('like.track', 'track')
      .select('track.youtubeId', 'youtubeId')
      .where('like.userId = :userId', { userId })
      .andWhere('track.youtubeId IN (:...safeIds)', { safeIds })
      .getRawMany();

    const likedIds: string[] = likes.map((l) => l.youtubeId);
    const map: Record<string, boolean> = {};
    for (const id of safeIds) {
      map[id] = likedIds.includes(id);
    }

    return { likedIds, map };
  }

  // 5. Joyas olvidadas: canciones guardadas hace más tiempo (antiguas)
  async getForgottenLikes(
    userId: number,
    limit: number = 10,
  ): Promise<Track[]> {
    const safeLimit = Math.max(1, Math.min(50, limit));
    const likes = await this.likeRepo.find({
      where: { userId },
      relations: { track: true },
      order: { likedAt: 'ASC' },
      take: safeLimit,
    });

    return likes.map((like) => like.track);
  }

  // 6. Radio / Mix basado en canciones guardadas
  async getLikedRadio(userId: number, limit: number = 20): Promise<any[]> {
    const safeLimit = Math.max(5, Math.min(50, limit));
    const likes = await this.likeRepo.find({
      where: { userId },
      relations: { track: true },
      take: 30,
    });

    if (!likes || likes.length === 0) {
      return [];
    }

    const randomSeed = likes[Math.floor(Math.random() * likes.length)].track;

    if (this.youtubeService) {
      try {
        const authedClient = await this.youtubeService.getAuthedInnertube(userId);
        const client = authedClient || this.youtubeService.yt;
        if (client?.music) {
          const upNext = await client.music.getUpNext(randomSeed.youtubeId);
          if (upNext?.contents?.length) {
            const list = (upNext.contents as any[])
              .filter((item: any) => item.video_id || item.id)
              .map((item: any) => ({
                type: 'VIDEO',
                videoId: item.video_id || item.id,
                name: item.title?.toString() || '',
                artist:
                  item.artists?.[0]?.name ||
                  item.author?.name ||
                  item.author ||
                  'Artista',
                duration: item.duration?.seconds || 0,
                thumbnailUrl:
                  item.thumbnail?.thumbnails?.[0]?.url ||
                  item.thumbnails?.[0]?.url ||
                  '',
              }))
              .slice(0, safeLimit);

            if (list.length > 0) {
              return list;
            }
          }
        }
      } catch {
        // Fallback abajo si falla la llamada remota de Innertube
      }
    }

    // Fallback: aleatorizar las canciones con like del usuario
    return likes
      .map((l) => l.track)
      .sort(() => Math.random() - 0.5)
      .slice(0, safeLimit);
  }

  // 7. Conteo rápido de likes
  async getUserLikesCount(userId: number): Promise<number> {
    return this.likeRepo.count({ where: { userId } });
  }

  // 8. Métricas de resumen (total canciones, duración total, artistas únicos)
  async getUserStatsSummary(userId: number): Promise<{
    totalLikes: number;
    totalDurationSeconds: number;
    uniqueArtistsCount: number;
  }> {
    const raw = await this.likeRepo
      .createQueryBuilder('like')
      .innerJoin('like.track', 'track')
      .select('COUNT(like.id)', 'totalLikes')
      .addSelect('COALESCE(SUM(track.duration), 0)', 'totalDuration')
      .addSelect('COUNT(DISTINCT track.artist)', 'uniqueArtists')
      .where('like.userId = :userId', { userId })
      .getRawOne();

    return {
      totalLikes: parseInt(raw?.totalLikes || '0', 10),
      totalDurationSeconds: parseInt(raw?.totalDuration || '0', 10),
      uniqueArtistsCount: parseInt(raw?.uniqueArtists || '0', 10),
    };
  }

  // 9. Top artistas con más likes
  async getTopArtists(
    userId: number,
    limit: number = 5,
  ): Promise<
    Array<{ artist: string; likesCount: number; totalDuration: number }>
  > {
    const raw = await this.likeRepo
      .createQueryBuilder('like')
      .innerJoin('like.track', 'track')
      .select('track.artist', 'artist')
      .addSelect('COUNT(like.id)', 'likesCount')
      .addSelect('COALESCE(SUM(track.duration), 0)', 'totalDuration')
      .where('like.userId = :userId', { userId })
      .groupBy('track.artist')
      .orderBy('COUNT(like.id)', 'DESC')
      .limit(limit)
      .getRawMany();

    return raw.map((r) => ({
      artist: r.artist,
      likesCount: parseInt(r.likesCount || '0', 10),
      totalDuration: parseInt(r.totalDuration || '0', 10),
    }));
  }

  // 10. Canciones recientes con like
  async getRecentLikes(userId: number, limit: number = 6): Promise<Track[]> {
    const likes = await this.likeRepo.find({
      where: { userId },
      relations: { track: true },
      order: { likedAt: 'DESC' },
      take: limit,
    });

    return likes.map((like) => like.track);
  }
}
