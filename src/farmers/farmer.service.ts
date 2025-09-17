// src/farmers/farmers.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Farmer } from './entities/farmer.entity';

@Injectable()
export class FarmersService {
  constructor(
    @InjectRepository(Farmer)
    private farmerRepository: Repository<Farmer>,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async getAllFarmers(): Promise<Farmer[]> {
    try {
      this.logger.info('Getting all farmers', {
        context: 'FarmersService',
        method: 'getAllFarmers',
      });

      const farmers = await this.farmerRepository.find({
        where: { isActive: true },
        order: { createdAt: 'DESC' }
      });

      this.logger.info('Farmers retrieved successfully', {
        context: 'FarmersService',
        count: farmers.length,
      });

      return farmers;
    } catch (error) {
      this.logger.error('Failed to get all farmers', {
        context: 'FarmersService',
        error: error.message,
      });
      throw error;
    }
  }

  async getFarmersByVillage(village: string): Promise<Farmer[]> {
    try {
      this.logger.info('Getting farmers by village', {
        context: 'FarmersService',
        method: 'getFarmersByVillage',
        village,
      });

      const farmers = await this.farmerRepository.find({
        where: { village, isActive: true },
        order: { createdAt: 'DESC' }
      });

      this.logger.info('Farmers by village retrieved successfully', {
        context: 'FarmersService',
        village,
        count: farmers.length,
      });

      return farmers;
    } catch (error) {
      this.logger.error('Failed to get farmers by village', {
        context: 'FarmersService',
        village,
        error: error.message,
      });
      throw error;
    }
  }

  async getFarmerByFirebaseUid(firebaseUid: string): Promise<Farmer | null> {
    try {
      this.logger.info('Getting farmer by Firebase UID', {
        context: 'FarmersService',
        method: 'getFarmerByFirebaseUid',
        firebaseUid,
      });

      const farmer = await this.farmerRepository.findOne({
        where: { firebaseUid }
      });

      if (farmer) {
        this.logger.info('Farmer found by Firebase UID', {
          context: 'FarmersService',
          firebaseUid,
          name: farmer.name,
        });
      } else {
        this.logger.warn('Farmer not found by Firebase UID', {
          context: 'FarmersService',
          firebaseUid,
        });
      }

      return farmer;
    } catch (error) {
      this.logger.error('Failed to get farmer by Firebase UID', {
        context: 'FarmersService',
        firebaseUid,
        error: error.message,
      });
      throw error;
    }
  }

  async createFarmer(farmerData: Partial<Farmer>): Promise<Farmer> {
    try {
      this.logger.info('Creating new farmer', {
        context: 'FarmersService',
        method: 'createFarmer',
        firebaseUid: farmerData.firebaseUid,
        phoneNumber: farmerData.phoneNumber,
      });

      const farmer = this.farmerRepository.create(farmerData);
      const savedFarmer = await this.farmerRepository.save(farmer);

      this.logger.info('Farmer created successfully', {
        context: 'FarmersService',
        firebaseUid: savedFarmer.firebaseUid,
        phoneNumber: savedFarmer.phoneNumber,
      });

      return savedFarmer;
    } catch (error) {
      this.logger.error('Failed to create farmer', {
        context: 'FarmersService',
        farmerData,
        error: error.message,
      });
      throw error;
    }
  }

  async updateFarmer(firebaseUid: string, updateData: Partial<Farmer>): Promise<Farmer> {
    try {
      this.logger.info('Updating farmer', {
        context: 'FarmersService',
        method: 'updateFarmer',
        firebaseUid,
        updateData,
      });

      await this.farmerRepository.update({ firebaseUid }, updateData);
      const updatedFarmer = await this.farmerRepository.findOne({ where: { firebaseUid } });

      this.logger.info('Farmer updated successfully', {
        context: 'FarmersService',
        firebaseUid,
        name: updatedFarmer?.name,
      });

      if (!updatedFarmer) {
        throw new Error('Farmer not found after update');
      }
      return updatedFarmer;
    } catch (error) {
      this.logger.error('Failed to update farmer', {
        context: 'FarmersService',
        firebaseUid,
        error: error.message,
      });
      throw error;
    }
  }

  async deleteFarmer(firebaseUid: string): Promise<void> {
    try {
      this.logger.info('Soft deleting farmer', {
        context: 'FarmersService',
        method: 'deleteFarmer',
        firebaseUid,
      });

      await this.farmerRepository.update({ firebaseUid }, { isActive: false });

      this.logger.info('Farmer soft deleted successfully', {
        context: 'FarmersService',
        firebaseUid,
      });
    } catch (error) {
      this.logger.error('Failed to delete farmer', {
        context: 'FarmersService',
        firebaseUid,
        error: error.message,
      });
      throw error;
    }
  }

  async getFarmerStats(): Promise<{
    totalFarmers: number;
    activeFarmers: number;
    farmersByState: { state: string; count: number }[];
    farmersByCrop: { cropType: string; count: number }[];
  }> {
    try {
      this.logger.info('Getting farmer statistics', {
        context: 'FarmersService',
        method: 'getFarmerStats',
      });

      const totalFarmers = await this.farmerRepository.count();
      const activeFarmers = await this.farmerRepository.count({ where: { isActive: true } });

      const farmersByState = await this.farmerRepository
        .createQueryBuilder('farmer')
        .select('farmer.state', 'state')
        .addSelect('COUNT(*)', 'count')
        .where('farmer.isActive = :isActive', { isActive: true })
        .andWhere('farmer.state IS NOT NULL')
        .groupBy('farmer.state')
        .getRawMany();

      // Get crop statistics (this would need more complex logic for JSON parsing)
      const farmersByCrop = []; // Simplified for now

      const stats = {
        totalFarmers,
        activeFarmers,
        farmersByState,
        farmersByCrop,
      };

      this.logger.info('Farmer statistics retrieved successfully', {
        context: 'FarmersService',
        stats,
      });

      return stats;
    } catch (error) {
      this.logger.error('Failed to get farmer statistics', {
        context: 'FarmersService',
        error: error.message,
      });
      throw error;
    }
  }
}
