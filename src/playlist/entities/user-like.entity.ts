import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Track } from './track.entity.js';

@Entity('user_likes')
@Unique(['userId', 'trackId']) // Evita duplicados
@Index(['userId', 'likedAt']) // Optimiza la consulta de "mis me gusta ordenados por fecha"
export class UserLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  trackId: string;

  @ManyToOne(() => Track, (track) => track.likes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trackId' })
  track: Track;

  @CreateDateColumn()
  likedAt: Date;
}
