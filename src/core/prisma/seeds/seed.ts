import 'dotenv/config';
import { createPrismaClient } from '../prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    // limpa filhos antes dos pais por causa das FKs
    await tx.tabelaPreco.deleteMany();
    await tx.cobertura.deleteMany();
    await tx.disponibilidadeGeografica.deleteMany();
    await tx.plano.deleteMany();
    await tx.linhaProduto.deleteMany();
    await tx.elegibilidadePme.deleteMany();
    await tx.documentoContratacao.deleteMany();
    await tx.operadora.deleteMany();

    const operadora = await tx.operadora.create({
      data: {
        nome_operadora: 'Amil Dental',
      },
    });

    const linhaIndividual = await tx.linhaProduto.create({
      data: {
        id_operadora: operadora.id_operadora,
        nome_linha: 'Dental Individual',
        tipo_publico: 'individual',
      },
    });

    const linhaEmpresarial = await tx.linhaProduto.create({
      data: {
        id_operadora: operadora.id_operadora,
        nome_linha: 'Dental PME',
        tipo_publico: 'empresarial',
      },
    });

    const planoEssencial = await tx.plano.create({
      data: {
        id_linha_produto: linhaIndividual.id_linha_produto,
        nome_plano: 'Essencial',
        nome_comercial: 'Dental Essencial',
        tipo_contratacao: 'individual',
        abrangencia: 'Nacional',
        descricao_comercial: 'Plano de entrada com cobertura odontologica essencial.',
      },
    });

    const planoCompleto = await tx.plano.create({
      data: {
        id_linha_produto: linhaEmpresarial.id_linha_produto,
        nome_plano: 'Completo PME',
        nome_comercial: 'Dental Completo PME',
        tipo_contratacao: 'empresarial',
        abrangencia: 'Nacional',
        descricao_comercial: 'Plano empresarial com cobertura ampliada.',
        possui_ortodontia: true,
        possui_clareamento: true,
      },
    });

    await tx.tabelaPreco.createMany({
      data: [
        {
          id_plano: planoEssencial.id_plano,
          codigo_plano: 'ESS-IND-01',
          modalidade_preco: 'mensal',
          faixa_vidas_min: 1,
          faixa_vidas_max: 1,
          valor_por_pessoa: 39.9,
        },
        {
          id_plano: planoCompleto.id_plano,
          codigo_plano: 'COMP-PME-01',
          modalidade_preco: 'mensal',
          faixa_vidas_min: 2,
          faixa_vidas_max: 29,
          valor_por_pessoa: 59.9,
          exige_plano_medico_amil: false,
        },
      ],
    });

    await tx.cobertura.createMany({
      data: [
        {
          id_plano: planoEssencial.id_plano,
          categoria: 'Basica',
          item_cobertura: 'Consulta odontologica',
          tipo_cobertura: 'Inclusa',
        },
        {
          id_plano: planoCompleto.id_plano,
          categoria: 'Ortodontia',
          item_cobertura: 'Documentacao ortodontica',
          tipo_cobertura: 'Inclusa',
        },
      ],
    });

    await tx.disponibilidadeGeografica.createMany({
      data: [
        {
          id_plano: planoEssencial.id_plano,
          uf: 'SP',
          cidade: 'Sao Paulo',
        },
        {
          id_plano: planoCompleto.id_plano,
          uf: 'RJ',
          cidade: 'Rio de Janeiro',
        },
      ],
    });

    await tx.elegibilidadePme.create({
      data: {
        id_operadora: operadora.id_operadora,
        tipo_empresa: 'ME',
        vidas_minimas: 2,
        vidas_maximas: 99,
        aceita_mei: true,
      },
    });

    await tx.documentoContratacao.createMany({
      data: [
        {
          id_operadora: operadora.id_operadora,
          tipo_publico: 'individual',
          nome_documento: 'RG e CPF',
        },
        {
          id_operadora: operadora.id_operadora,
          tipo_publico: 'empresarial',
          tipo_empresa: 'ME',
          nome_documento: 'Contrato social',
        },
      ],
    });
  });

  console.log('Seed compacto concluido com sucesso.');
}

main()
  .catch((error) => {
    console.error('Falha no seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
