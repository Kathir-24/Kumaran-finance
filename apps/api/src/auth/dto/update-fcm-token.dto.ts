import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateFcmTokenDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Firebase Cloud Messaging (FCM) device registration token. Pass null or omit to deregister device on logout.',
    example: 'dK9Z...f8Qm:APA91bH7...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512, { message: 'FCM token must not exceed 512 characters' })
  fcmToken?: string | null;

  @ApiPropertyOptional({
    description: 'Client device operating system / platform',
    enum: ['ANDROID', 'IOS', 'WEB'],
    example: 'ANDROID',
  })
  @IsOptional()
  @IsIn(['ANDROID', 'IOS', 'WEB'], {
    message: 'deviceType must be one of: ANDROID, IOS, WEB',
  })
  deviceType?: string;
}
