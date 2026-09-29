import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { UserLike } from './user-like.entity.js';

@Entity('tracks')
export class Track {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  youtubeId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  artist: string;

  @Column({ type: 'int', comment: 'Duración en segundos' })
  duration: number;

  @Column({ type: 'text', nullable: true })
  thumbnailUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => UserLike, (like) => like.track)
  likes: UserLike[];
}
