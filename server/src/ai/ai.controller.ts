import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { AiService } from '@/ai/ai.service';
import { Request } from 'express';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /** POST /api/ai/generate  body: { keyword } */
  @Post('generate')
  async generate(@Body() body: { keyword?: string }, @Req() req: Request) {
    const keyword = (body.keyword || '').trim();
    if (!keyword) {
      throw new BadRequestException('请输入图片描述关键词');
    }
    if (keyword.length > 100) {
      throw new BadRequestException('描述过长，请控制在 100 字以内');
    }

    const data = await this.aiService.generate(keyword, req.headers as Record<string, string>);
    return { status: 'success', data };
  }
}