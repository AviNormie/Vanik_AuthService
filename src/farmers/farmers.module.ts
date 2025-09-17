// src/farmers/farmers.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmersController } from './farmer.controller';
import { FarmersService } from './farmer.service';
import { Farmer } from './entities/farmer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Farmer])],
  controllers: [FarmersController],
  providers: [FarmersService],
  exports: [FarmersService],
})
export class FarmersModule {}
