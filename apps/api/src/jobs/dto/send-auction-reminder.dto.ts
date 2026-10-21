import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { REGEX_INDIAN_PHONE } from '../../common/constants';

export class ReminderSubscriberItemDto {
  @ApiProperty({
    example: 'S. Sundaram',
    description: 'Subscriber full name',
  })
  @IsNotEmpty({ message: 'Subscriber name is required' })
  @IsString()
  name: string;

  @ApiProperty({
    example: '9842712345',
    description: '10-digit primary mobile phone number',
  })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @Matches(REGEX_INDIAN_PHONE, { message: 'Phone must be exactly 10 digits' })
  phone: string;

  @ApiPropertyOptional({
    example: 'fcm_token_sample_abc123',
    description: 'Optional FCM device token for mobile passbook push notification',
  })
  @IsOptional()
  @IsString()
  fcmToken?: string;
}

export class SendAuctionReminderDto {
  @ApiProperty({
    example: 'KCA-1L-20M-01',
    description: 'Unique chit group code',
  })
  @IsNotEmpty({ message: 'Chit group code is required' })
  @IsString()
  chitCode: string;

  @ApiProperty({
    example: '2026-11-15',
    description: 'Scheduled auction date',
  })
  @IsNotEmpty({ message: 'Auction date is required' })
  @IsString()
  auctionDate: string;

  @ApiProperty({
    example: '10:30 AM',
    description: 'Scheduled auction time',
  })
  @IsNotEmpty({ message: 'Auction time is required' })
  @IsString()
  auctionTime: string;

  @ApiProperty({
    example: 'Head Office - Perundurai',
    description: 'Branch name where auction is physically conducted',
  })
  @IsNotEmpty({ message: 'Branch name is required' })
  @IsString()
  branchName: string;

  @ApiProperty({
    example: '14/2, Gandhi Nagar, Perundurai',
    description: 'Branch physical address',
  })
  @IsNotEmpty({ message: 'Branch address is required' })
  @IsString()
  branchAddress: string;

  @ApiProperty({
    example: '04294-220123',
    description: 'Branch contact telephone number',
  })
  @IsNotEmpty({ message: 'Branch phone is required' })
  @IsString()
  branchPhone: string;

  @ApiProperty({
    type: [ReminderSubscriberItemDto],
    description: 'List of chit subscribers to receive bilingual auction reminder',
  })
  @IsArray({ message: 'subscribers must be an array' })
  @ValidateNested({ each: true })
  @Type(() => ReminderSubscriberItemDto)
  subscribers: ReminderSubscriberItemDto[];
}
