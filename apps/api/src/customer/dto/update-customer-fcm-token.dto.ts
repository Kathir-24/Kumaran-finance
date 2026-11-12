import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCustomerFcmTokenDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Firebase Cloud Messaging (FCM) device registration token for subscriber mobile passbook push notifications. Pass null to unregister.',
    example: 'eM3X...k9Lp:APA91bF4...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512, { message: 'FCM token must not exceed 512 characters' })
  fcmToken?: string | null;

  @ApiPropertyOptional({
    description: 'Subscriber device platform',
    enum: ['ANDROID', 'IOS', 'WEB'],
    example: 'ANDROID',
  })
  @IsOptional()
  @IsIn(['ANDROID', 'IOS', 'WEB'], {
    message: 'deviceType must be one of: ANDROID, IOS, WEB',
  })
  deviceType?: string;
}
