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
  })
  email: string;
  @Column({
    type: 'varchar',
    length: 255,
  })
  full_name: string;
  @Column({
    type: 'varchar',
    length: 255,
  })
  profile_image: string;
  @Column({
    type: 'varchar',
    length: 255,
  })
  role: string;
  @Column({
    type: 'varchar',
    length: 255,
  })
  password: string;
  @Column({
    type: 'boolean',
    default: false,
  })
  accept_terms?: boolean;
  @Column({
    type: 'jsonb',
    nullable: true,
    default: {
      email_notifications: true,
      dark_mode: true,
      task_reminders: true,
    },
  })
  preferences?: Record<string, any>;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  stripe_customer_id?: string;
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
