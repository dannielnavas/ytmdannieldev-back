import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserLike } from '../../entities/user-like.entity.js';
import { Repository } from 'typeorm';
import { Track } from '../../entities/track.entity.js';
import { ToggleLikeDto } from '../../dtos/like.dto.js';

export type YoutubeTrackInput = ToggleLikeDto;

@Injectable()
export class LikesService {
  constructor(
    @InjectRepository(UserLike)
    private readonly likeRepo: Repository<UserLike>,
    @InjectRepository(Track)
    private readonly trackRepo: Repository<Track>,
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

  // 2. Obtener lista ordenada (las agregadas más recientemente primero)
  async getUserLikedTracks(userId: number): Promise<Track[]> {
    const likes = await this.likeRepo.find({
      where: { userId },
      relations: { track: true },
      order: { likedAt: 'DESC' },
    });

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

  // 4. Conteo rápido de likes
  async getUserLikesCount(userId: number): Promise<number> {
    return this.likeRepo.count({ where: { userId } });
  }

  // 5. Métricas de resumen (total canciones, duración total, artistas únicos)
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

  // 6. Top artistas con más likes
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

  // 7. Canciones recientes con like
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
