import { Injectable } from '@nestjs/common';
import {
  ImageGenerationClient,
  Config,
  HeaderUtils,
  LLMClient,
} from 'coze-coding-dev-sdk';
import { ConfigService } from '@/config/config.service';
import { StatsService } from '@/stats/stats.service';

@Injectable()
export class AiService {
  constructor(
    private readonly configService: ConfigService,
    private readonly statsService: StatsService,
  ) {}
  /**
   * 版权/合规过滤：拒绝明星、动漫IP、真人肖像等生成请求。
   * 只允许原创插画、风景、抽象、文字氛围感素材。
   */
  private isForbiddenKeyword(keyword: string): string | null {
    const kw = keyword.toLowerCase();
    const forbiddenGroups: { name: string; keywords: string[] }[] = [
      {
        name: '真人明星/名人',
        keywords: ['明星', '名人', '蔡徐坤', '杨幂', '迪丽热巴', '王俊凯', '鹿晗'],
      },
      {
        name: '动漫/游戏IP',
        keywords: ['动漫', '卡通', '皮卡丘', '柯南', '海贼王', '火影', '原神', '初音', 'vtuber'],
      },
      {
        name: '真实人物肖像/网红',
        keywords: ['网红', '真人', '偶像', '写真', '自拍', '主播', '周杰伦', '林俊杰'],
      },
      {
        name: '敏感/色情',
        keywords: ['色情', '裸露', '性感', '暴力', '血腥', '恐怖', '赌博', '算卦', '占卜', '迷信'],
      },
    ];

    for (const group of forbiddenGroups) {
      if (group.keywords.some((k) => kw.includes(k))) {
        return group.name;
      }
    }
    return null;
  }

  /** 用 LLM 将用户口语描述润色为适合图片生成的英文 prompt（原创、无版权内容） */
  private async buildPrompt(keyword: string): Promise<string> {
    const config = new Config();
    const client = new LLMClient(config);

    const messages: Array<{ role: 'user' | 'system'; content: string }> = [
      {
        role: 'user' as const,
        content:
          '请把下面的中文描述，改写成一段用于 AI 图片生成的英文提示词(prompt)。' +
          '要求：只描述原创插画、自然风景、抽象几何、极简文字氛围感这四类内容；' +
          '禁止出现任何真实明星、名人、动漫IP角色、真人肖像、品牌Logo、色情暴力内容；' +
          '以绘画/插画风格呈现；输出直接用英文，不要多余解释，控制在 80 词以内。\n' +
          `用户描述：${keyword}`,
      },
    ];

    // 后台可额外追加的系统约束（如品牌话术、配色偏好）
    const extra = this.configService.get().aiSystemPrompt?.trim();
    if (extra) {
      messages.unshift({ role: 'system', content: extra });
    }

    try {
      const response = await client.invoke(messages, {
        model: 'doubao-seed-2-0-lite-260215',
        temperature: 0.8,
      });
      const text = response.content.trim();
      return text || keyword;
    } catch (err) {
      console.error('[AI] prompt 润色失败，使用原始关键词', err);
      return keyword;
    }
  }

  /**
   * AI 生成图片
   * @param keyword 用户输入的关键词/描述
   * @returns 生成的缩略图 URL 与高清原图 URL
   */
  async generate(keyword: string, forwardHeaders: Record<string, string>) {
    const banned = this.isForbiddenKeyword(keyword);
    if (banned) {
      return {
        rejected: true,
        reason: `抱歉，暂不支持生成「${banned}」相关图片，请尝试原创插画、风景、抽象或文字氛围素材哦～`,
      };
    }

    const prompt = await this.buildPrompt(keyword);
    const config = new Config();
    const client = new ImageGenerationClient(
      config,
      HeaderUtils.extractForwardHeaders(forwardHeaders),
    );

    // 模型档位与尺寸均从后台配置读取（server/data/config.json），后台可动态调整
    const aiModel = this.configService.get().aiModel || 'doubao-seedream-4-5-251128';
    const aiSize = this.configService.get().aiSize || '2K';

    // 只生成一张 2K 原图：既作免费预览，也作“激励视频解锁后下载”的高清原图。
    // 预览内容由前端加水印遮罩保护，解锁后去水印下载原图，单图生成可显著降低成本。
    const img = await client.generate({
      prompt,
      model: aiModel,
      size: aiSize,
      watermark: false,
    });
    const imgHelper = client.getResponseHelper(img);

    if (!imgHelper.success) {
      throw new Error(
        `AI 生成失败: ${imgHelper.errorMessages.join(';')}`,
      );
    }

    const url = imgHelper.imageUrls[0];

    // 统计一次 AI 生成（首页管理看板指标）
    this.statsService.recordGenerate();

    return {
      rejected: false,
      prompt,
      thumbUrl: url,
      fullUrl: url,
      width: 2048,
      height: 2048,
      createdAt: new Date().toISOString(),
    };
  }
}