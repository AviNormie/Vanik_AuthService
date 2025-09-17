// src/farmers/entities/farmer.entity.ts
import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('farmers')
export class Farmer {
  @PrimaryColumn()
  firebaseUid: string; // Firebase UID as primary key

  @Column()
  phoneNumber: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  village: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  cropTypes: string; // JSON string array of crops

  @Column({ nullable: true, type: 'float' })
  farmSize: number; // in acres

  @Column({ nullable: true })
  language: string; // Preferred language

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
