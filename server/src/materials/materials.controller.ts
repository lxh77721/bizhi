import {
  Controller,
  Get,
  Query,
  Param,
  NotFoundException,
} from '@nestjs/common';
import {
  MaterialsService,
  QueryMaterialDto,
} from '@/materials/materials.service';

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  /** GET /api/materials?category=girl&keyword=女生 */
  @Get()
  getList(@Query() query: QueryMaterialDto) {
    const data = this.materialsService.queryList(query);
    return { status: 'success', data };
  }

  /** GET /api/materials/:id */
  @Get(':id')
  getDetail(@Param('id') id: string) {
    const item = this.materialsService.findById(id);
    if (!item) {
      throw new NotFoundException(`素材不存在: ${id}`);
    }
    return { status: 'success', data: item };
  }
}