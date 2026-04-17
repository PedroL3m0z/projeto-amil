import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

const planCatalogInclude = {
  linha_produto: { include: { operadora: true } },
  tabela_preco: { where: { ativo: true }, take: 2, orderBy: { faixa_vidas_min: 'asc' } },
  coberturas: { where: { ativo: true }, take: 8 },
} satisfies Prisma.PlanoInclude;

export type PlanCatalogRow = Prisma.PlanoGetPayload<{
  include: typeof planCatalogInclude;
}>;

const MAX_CONTEXT_CHARS = 9000;

const STOPWORDS = new Set([
  'um',
  'uma',
  'uns',
  'umas',
  'o',
  'os',
  'a',
  'as',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'por',
  'para',
  'com',
  'sem',
  'que',
  'se',
  'ou',
  'e',
  'ao',
  'aos',
  'à',
  'às',
  'eu',
  'ele',
  'ela',
  'eles',
  'elas',
  'meu',
  'minha',
  'seu',
  'sua',
  'isso',
  'isto',
  'tem',
  'ter',
  'foi',
  'ser',
  'são',
  'sim',
  'não',
  'mais',
  'muito',
  'já',
  'aqui',
  'como',
  'quero',
  'gostaria',
  'saber',
  'sobre',
  'oi',
  'olá',
  'obrigado',
  'obrigada',
]);

@Injectable()
export class PlanCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Texto para o prompt da IA: tenta alinhar ao que o cliente escreveu;
   * se não houver match, devolve resumo geral do catálogo ativo.
   */
  async buildContextForChat(lastCustomerMessagesText: string): Promise<string> {
    const raw = lastCustomerMessagesText.trim();
    const keywords = this.extractKeywords(raw);
    if (keywords.length > 0) {
      const matched = await this.searchPlansByKeywords(keywords);
      if (matched.length > 0) {
        const block = this.formatPlansForPrompt(matched);
        if (block.length >= 120) {
          return this.truncate(block, MAX_CONTEXT_CHARS);
        }
      }
    }
    const general = await this.buildGeneralCatalogSummary();
    return this.truncate(general, MAX_CONTEXT_CHARS);
  }

  private extractKeywords(text: string): string[] {
    const words = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));
    return [...new Set(words)].slice(0, 14);
  }

  private async searchPlansByKeywords(
    keywords: string[],
  ): Promise<PlanCatalogRow[]> {
    const orClause: Prisma.PlanoWhereInput[] = keywords.flatMap((k) => [
      { nome_plano: { contains: k, mode: 'insensitive' } },
      { nome_comercial: { contains: k, mode: 'insensitive' } },
      { descricao_comercial: { contains: k, mode: 'insensitive' } },
      {
        linha_produto: {
          nome_linha: { contains: k, mode: 'insensitive' },
          ativo: true,
        },
      },
      {
        coberturas: {
          some: {
            ativo: true,
            item_cobertura: { contains: k, mode: 'insensitive' },
          },
        },
      },
    ]);

    const byPlan = await this.prisma.plano.findMany({
      where: { ativo: true, OR: orClause },
      take: 14,
      include: planCatalogInclude,
    });

    if (byPlan.length > 0) return byPlan;

    const orLinha = keywords.map((k) => ({
      nome_linha: { contains: k, mode: 'insensitive' as const },
    }));
    const linhas = await this.prisma.linhaProduto.findMany({
      where: { ativo: true, OR: orLinha },
      take: 6,
      select: { id_linha_produto: true },
    });
    const ids = linhas.map((l) => l.id_linha_produto);
    if (ids.length === 0) return [];

    return this.prisma.plano.findMany({
      where: { ativo: true, id_linha_produto: { in: ids } },
      take: 12,
      include: planCatalogInclude,
    });
  }

  private async buildGeneralCatalogSummary(): Promise<string> {
    const planos = await this.prisma.plano.findMany({
      where: { ativo: true },
      take: 28,
      orderBy: { nome_plano: 'asc' },
      include: planCatalogInclude,
    });
    return this.formatPlansForPrompt(planos);
  }

  private formatPlansForPrompt(planos: PlanCatalogRow[]): string {
    const lines: string[] = [];
    lines.push('--- Catálogo (resumo para consulta interna) ---');
    for (const p of planos) {
      const op = p.linha_produto.operadora.nome_operadora;
      const linha = `${p.linha_produto.nome_linha} (${p.linha_produto.tipo_publico})`;
      lines.push('');
      lines.push(
        `Plano: ${p.nome_plano}${p.nome_comercial ? ` | Comercial: ${p.nome_comercial}` : ''}`,
      );
      lines.push(`Operadora: ${op} | Linha: ${linha}`);
      if (p.descricao_comercial?.trim()) {
        lines.push(`Descrição: ${p.descricao_comercial.trim()}`);
      }
      lines.push(
        `Flags: ortodontia=${p.possui_ortodontia} prótese=${p.possui_protese} clareamento=${p.possui_clareamento} doc_ortodontica=${p.possui_doc_ortodontica}`,
      );
      if (p.abrangencia?.trim()) lines.push(`Abrangência: ${p.abrangencia}`);
      if (p.tipo_contratacao?.trim()) lines.push(`Contratação: ${p.tipo_contratacao}`);
      for (const tp of p.tabela_preco) {
        const valor = Number(tp.valor_por_pessoa);
        lines.push(
          `  Preço (faixa ${tp.faixa_vidas_min}-${tp.faixa_vidas_max} vidas, ${tp.modalidade_preco}): R$ ${valor.toFixed(2)} / pessoa`,
        );
      }
      if (p.coberturas.length) {
        const items = p.coberturas
          .map((c) => `${c.categoria}: ${c.item_cobertura}`)
          .join('; ');
        lines.push(`  Coberturas (amostra): ${items}`);
      }
    }
    lines.push('');
    lines.push('--- Fim do catálogo ---');
    return lines.join('\n');
  }

  private truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return `${s.slice(0, max - 80)}\n\n[... texto truncado por limite de contexto ...]`;
  }
}
