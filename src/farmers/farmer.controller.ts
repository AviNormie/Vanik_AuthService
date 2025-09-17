// src/farmers/farmers.controller.ts
import { Controller, Get, UseGuards, Request, Query, Inject, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { FarmersService } from './farmer.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';

@ApiTags('farmers')
@Controller('farmers')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth('firebase-auth')
export class FarmersController {
  constructor(
    private readonly farmersService: FarmersService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all farmers (Protected)' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of all farmers retrieved successfully' 
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllFarmers(@Request() req) {
    this.logger.info('Get all farmers request', {
      context: 'FarmersController',
      method: 'getAllFarmers',
      requestedBy: req.user.phone,
    });
    
    const farmers = await this.farmersService.getAllFarmers();
    return {
      success: true,
      count: farmers.length,
      farmers,
    };
  }

  @Get('by-village')
  @ApiOperation({ summary: 'Get farmers by village (Protected)' })
  @ApiQuery({
    name: 'village',
    description: 'Village name to filter farmers',
    example: 'बागपत'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Farmers from specified village retrieved successfully' 
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFarmersByVillage(@Query('village') village: string, @Request() req) {
    this.logger.info('Get farmers by village request', {
      context: 'FarmersController',
      method: 'getFarmersByVillage',
      village,
      requestedBy: req.user.phone,
    });
    
    const farmers = await this.farmersService.getFarmersByVillage(village);
    return {
      success: true,
      village,
      count: farmers.length,
      farmers,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get farmer statistics (Protected)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Farmer statistics retrieved successfully' 
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFarmerStats(@Request() req) {
    this.logger.info('Get farmer statistics request', {
      context: 'FarmersController',
      method: 'getFarmerStats',
      requestedBy: req.user.phone,
    });
    
    const stats = await this.farmersService.getFarmerStats();
    return {
      success: true,
      statistics: stats,
    };
  }

  @Get(':firebaseUid')
  @ApiOperation({ summary: 'Get farmer by Firebase UID (Protected)' })
  @ApiParam({
    name: 'firebaseUid',
    description: 'Firebase UID of the farmer',
    example: 'abc123def456'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Farmer retrieved successfully' 
  })
  @ApiResponse({ status: 404, description: 'Farmer not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFarmerByUid(@Param('firebaseUid') firebaseUid: string, @Request() req) {
    this.logger.info('Get farmer by UID request', {
      context: 'FarmersController',
      method: 'getFarmerByUid',
      firebaseUid,
      requestedBy: req.user.phone,
    });
    
    const farmer = await this.farmersService.getFarmerByFirebaseUid(firebaseUid);
    
    if (!farmer) {
      return {
        success: false,
        message: 'Farmer not found',
      };
    }

    return {
      success: true,
      farmer,
    };
  }
}
