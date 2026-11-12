import { ApiProperty } from '@nestjs/swagger';

export class BranchResponseDto {
  @ApiProperty({ example: 'branch-prd-001', description: 'Unique branch ID' })
  id: string;

  @ApiProperty({ example: 'PRD', description: 'Unique branch code' })
  code: string;

  @ApiProperty({ example: 'Head Office - Perundurai', description: 'Branch name in English' })
  name: string;

  @ApiProperty({ type: String, example: 'தலைமை கிளை - பெருந்துறை', description: 'Branch name in Tamil', nullable: true })
  nameTamil?: string | null;

  @ApiProperty({ example: '142, Erode Main Road, Perundurai - 638052', description: 'Physical address' })
  address: string;

  @ApiProperty({ example: '9876543210', description: 'Contact phone' })
  phone: string;

  @ApiProperty({ example: true, description: 'Whether branch is active' })
  isActive: boolean;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-23T10:00:00.000Z', description: 'Creation timestamp' })
  createdAt: Date | string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-23T10:00:00.000Z', description: 'Last update timestamp' })
  updatedAt: Date | string;
}
