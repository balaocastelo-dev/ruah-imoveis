// Dados de exemplo (opcional, escolhido no primeiro acesso). Tudo marcado como "Exemplo" para apagar depois.
const crypto = require('crypto');
const { run, one } = require('./db');
const { hashSenha } = require('./auth');

function senhaTemp() { return 'Ruah' + crypto.randomInt(100000, 999999) + crypto.randomBytes(2).toString('hex'); }

function seedExemplo() {
  const corretores = [['Marina (Exemplo)', 'marina@exemplo.ruah'], ['Rafael (Exemplo)', 'rafael@exemplo.ruah']];
  const credenciais = [];
  const ids = corretores.map(([nome, email]) => {
    const s = senhaTemp(); credenciais.push({ nome, email, senha: s });
    return Number(run('INSERT INTO usuarios(nome,email,perfil,senha_hash,telefone) VALUES(?,?,?,?,?)', nome, email, 'corretor', hashSenha(s), '19999990000').lastInsertRowid);
  });
  const [marina, rafael] = ids;

  const cond = (nome, cep, log, n, bairro, ano, lazer) => Number(run('INSERT INTO condominios(nome,cep,logradouro,numero,bairro,cidade,uf,ano_construcao,lazer) VALUES(?,?,?,?,?,?,?,?,?)', nome, cep, log, n, bairro, 'Campinas', 'SP', ano, lazer).lastInsertRowid);
  const c1 = cond('Rossi Antilhas (Exemplo)', '13087000', 'Rua Exemplo das Antilhas', '200', 'Mansões Santo Antônio', '2011', 'Piscina, academia, salão de festas, quadra');
  const c2 = cond('Mirante Cambuí (Exemplo)', '13025000', 'Rua Exemplo do Cambuí', '1100', 'Cambuí', '2016', 'Piscina, academia, espaço gourmet');

  const dono = (nome, cpf, tel) => Number(run('INSERT INTO proprietarios(nome,cpf,telefone,origem_dado) VALUES(?,?,?,?)', nome, cpf, tel, 'Exemplo').lastInsertRowid);
  const im = (codigo, tipo, status, condId, log, n, bairro, q, s, v, a, valor, corr, donoId, excl) =>
    Number(run(`INSERT INTO imoveis(codigo,tipo,status,condominio_id,logradouro,numero,bairro,cidade,uf,quartos,suites,vagas,area_util,valor,corretor_id,proprietario_id,exclusivo,descricao)
      VALUES(?,?,?,?,?,?,?,'Campinas','SP',?,?,?,?,?,?,?,?,?)`, codigo, tipo, status, condId, log, n, bairro, q, s, v, a, valor, corr, donoId, excl, 'Imóvel de exemplo para testar o sistema.').lastInsertRowid);
  const i1 = im('AP0001', 'Apartamento', 'publicado', c1, 'Rua Exemplo das Antilhas', '200', 'Mansões Santo Antônio', 4, 2, 3, 181, 2250000, marina, dono('Proprietário Exemplo Um', '529.982.247-25', '19988887777'), 1);
  im('AP0002', 'Apartamento', 'captacao', c2, 'Rua Exemplo do Cambuí', '1100', 'Cambuí', 3, 1, 2, 128, 1350000, rafael, null, 0);
  im('CC0001', 'Casa em condomínio', 'off_market', null, 'Alameda Exemplo', '45', 'Alphaville Dom Pedro', 4, 4, 4, 340, 3900000, rafael, null, 1);

  const lead = (nome, tel, origem, etapa, temp, corr, busca, tipo, q, v, valor, bairros) =>
    Number(run(`INSERT INTO leads(nome,telefone,origem,etapa,temperatura,corretor_id,busca,tipo_desejado,quartos_min,vagas_min,valor_max,bairros,ultimo_contato) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`,
      nome, tel, origem, etapa, temp, corr, busca, tipo, q, v, valor, bairros).lastInsertRowid);
  const l1 = lead('Fernanda (Exemplo)', '5519900000001', 'ZAP Imóveis', 'qualificado', 'quente', marina, '4 quartos, 3 vagas, até 2,4 mi', 'Apartamento', 4, 3, 2400000, 'Mansões Santo Antônio, Dom Pedro');
  lead('Carlos (Exemplo)', '5519900000002', 'Site RUAH', 'novo', 'quente', marina, '4 quartos perto do Dom Pedro', 'Apartamento', 4, 2, 2500000, 'Dom Pedro');
  lead('André (Exemplo)', '5519900000003', 'Imovelweb', 'visita', 'morno', rafael, 'Apto 3 quartos no Cambuí', 'Apartamento', 3, 2, 1400000, 'Cambuí');
  lead('Investidor (Exemplo)', '5519900000004', 'Indicação', 'novo', 'morno', rafael, 'Alto padrão para renda', null, 3, null, 5000000, null);

  run("INSERT INTO mensagens(lead_id,telefone,direcao,texto,status,autor,criado_em) VALUES(?,?,?,?,?,?,datetime('now','localtime','-20 minute'))", l1, '5519900000001', 'entrada', 'Oi! Vi o apartamento do Rossi Antilhas. Aceita financiamento?', 'recebida', 'Fernanda');
  run("INSERT INTO visitas(lead_id,imovel_id,corretor_id,data_hora,status) VALUES(?,?,?,datetime('now','localtime','+1 day','start of day','+10 hour'),'confirmada')", l1, i1, marina);
  run('INSERT INTO interacoes(lead_id,tipo,texto) VALUES(?,?,?)', l1, 'sistema', 'Lead de exemplo.');
  return { corretores: credenciais };
}

module.exports = { seedExemplo };
