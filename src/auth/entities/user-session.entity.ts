// src/auth/entities/user-session.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Farmer } from '../../farmers/entities/farmer.entity';

@Entity('user_sessions')
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firebaseUid: string;

  @Column('text')
  jwtToken: string;

  @Column()
  deviceInfo: string; // Device/browser info

  @Column()
  ipAddress: string;

  @Column()
  expiresAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Farmer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'firebaseUid', referencedColumnName: 'firebaseUid' })
  farmer: Farmer;
}