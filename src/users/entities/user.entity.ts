import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Users {
  @PrimaryGeneratedColumn()
  user_id: number;
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  email?: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  full_name?: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  profile_image?: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    default: 'user',
  })
  role: string;

  // --- Datos extraídos y sesión de YouTube ---
  @Column({
    type: 'text',
    nullable: true,
  })
  youtube_cookies?: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  youtube_channel_id?: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  youtube_channel_title?: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  youtube_handle?: string | null;

  @Column({
    type: 'boolean',
    default: false,
    nullable: true,
  })
  is_youtube_premium?: boolean;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  youtube_data?: Record<string, any> | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  youtube_connected_at?: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'create_at',
  })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'update_at',
  })
  updated_at: Date;
}
