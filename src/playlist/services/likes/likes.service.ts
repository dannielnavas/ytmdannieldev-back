import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserLike } from '../../entities/user-like.entity.js';
import { Repository } from 'typeorm';
import { Track } from '../../entities/track.entity.js';

export interface YoutubeTrackInput {
  youtubeId: string;
  title: string;
  artist: string;
  duration: number;
  thumbnailUrl?: string;
}

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
    userId: string,
    trackData: YoutubeTrackInput,
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
  async getUserLikedTracks(userId: string): Promise<Track[]> {
    const likes = await this.likeRepo.find({
      where: { userId },
      relations: { track: true },
      order: { likedAt: 'DESC' },
    });

    return likes.map((like) => like.track);
  }

  // 3. Chequear estado para la canción actual
  async isTrackLiked(userId: string, youtubeId: string): Promise<boolean> {
    const count = await this.likeRepo
      .createQueryBuilder('like')
      .innerJoin('like.track', 'track')
      .where('like.userId = :userId', { userId })
      .andWhere('track.youtubeId = :youtubeId', { youtubeId })
      .getCount();

    return count > 0;
  }
}
