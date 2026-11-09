// Toda a comunicação com o Supabase fica aqui.
(function () {
  const cfg = window.LOJA_CONFIG || {};
  const configurado = /^https?:\/\//.test(cfg.SUPABASE_URL || '') && !/COLE_AQUI/.test(cfg.SUPABASE_CHAVE || 'COLE_AQUI');
  const sb = configurado ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_CHAVE) : null;

  const MENSAGENS = [
    [/Failed to fetch|NetworkError|Load failed/i, 'Sem conexão com o servidor. Verifique a internet e tente de novo.'],
    [/JWT|Refresh Token/i, 'Sua sessão expirou. Entre novamente.'],
    [/permission denied|Acesso negado|row-level security/i, 'Seu usuário não tem acesso a esta ação.'],
  ];

  function traduzir(erro) {
    const texto = (erro && erro.message) || 'Erro inesperado';
    const achado = MENSAGENS.find(([re]) => re.test(texto));
    return new Error(achado ? achado[1] : texto);
  }

  async function dados(consulta) {
    let r;
    try { r = await consulta; } catch (e) { throw traduzir(e); }
    if (r.error) throw traduzir(r.error);
    return r.data;
  }

  const rpc = (nome, args) => dados(sb.rpc(nome, args));

  // O Supabase entrega no máximo 1.000 linhas por consulta; aqui busca em lotes até acabar.
  async function todas(montar) {
    const LOTE = 1000, linhas = [];
    for (let i = 0; ; i += LOTE) {
      const parte = await dados(montar().range(i, i + LOTE - 1));
      linhas.push(...parte);
      if (parte.length < LOTE) return linhas;
    }
  }

  // Criar login exige a chave de administrador, que fica na função do Supabase.
  async function chamarFuncao(corpo) {
    let r;
    try { r = await sb.functions.invoke('usuarios', { body: corpo }); } catch (e) { throw traduzir(e); }
    if (r.data?.erro) throw new Error(r.data.erro);
    if (r.error) {
      const detalhe = await r.error.context?.json?.().catch(() => null);
      throw new Error(detalhe?.erro || 'Não foi possível falar com a função de usuários. Confira se ela foi publicada.');
    }
    return r.data;
  }

  window.api = {
    configurado,

    // ---------- Acesso ----------
    sessao: async () => (await sb.auth.getSession()).data.session,
    aoMudarSessao: (fn) => sb.auth.onAuthStateChange((evento, sessao) => fn(evento, sessao)),
    entrar: async (email, senha) => {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : traduzir(error).message);
    },
    sair: () => sb.auth.signOut(),
    esqueciSenha: async (email) => {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw traduzir(error);
    },
    trocarSenha: async (senha) => {
      const { error } = await sb.auth.updateUser({ password: senha });
      if (error) throw traduzir(error);
    },
    meuAcesso: () => rpc('meu_acesso'),

    // ---------- Cadastros ----------
    clientes: (incluirArquivados = false) => todas(() => {
      const q = sb.from('clientes').select('*').order('nome').order('id');
      return incluirArquivados ? q : q.eq('ativo', true);
    }),
    cliente: (id) => dados(sb.from('clientes').select('*').eq('id', id).single()),
    salvarCliente: (id, c) => id
      ? dados(sb.from('clientes').update(c).eq('id', id).select().single())
      : dados(sb.from('clientes').insert(c).select().single()),

    fornecedores: () => dados(sb.from('fornecedores').select('*').eq('ativo', true).order('nome')),
    salvarFornecedor: (id, f) => id
      ? dados(sb.from('fornecedores').update(f).eq('id', id).select().single())
      : dados(sb.from('fornecedores').insert(f).select().single()),

    produtos: (incluirArquivados = false) => {
      let q = sb.from('vw_produtos').select('*').order('nome');
      if (!incluirArquivados) q = q.eq('ativo', true);
      return dados(q);
    },
    salvarProduto: (id, p) => rpc('salvar_produto', {
      p_id: id, p_nome: p.nome, p_categoria: p.categoria, p_preco_venda: p.preco_venda,
      p_estoque_minimo: p.estoque_minimo, p_controla_estoque: p.controla_estoque,
      p_custo: p.custo, p_estoque_inicial: p.estoque_inicial || 0,
    }),
    definirProdutoAtivo: (id, ativo) => rpc('definir_produto_ativo', { p_id: id, p_ativo: ativo }),
    ajustarEstoque: (id, qtd, motivo) => rpc('ajustar_estoque', { p_produto: id, p_nova_quantidade: qtd, p_motivo: motivo }),
    movimentos: (produto) => dados(sb.from('movimentos').select('*').eq('produto_id', produto)
      .order('data', { ascending: false }).order('id', { ascending: false }).limit(100)),

    // ---------- Vendas ----------
    vendas: (de, ate) => todas(() => sb.from('vw_vendas').select('*').gte('data', de).lte('data', ate)
      .order('data', { ascending: false }).order('id', { ascending: false })),
    vendasDoCliente: (id) => todas(() => sb.from('vw_vendas').select('*').eq('cliente_id', id)
      .order('data', { ascending: false }).order('id', { ascending: false })),
    vendasEmAberto: () => todas(() => sb.from('vw_vendas').select('*').gt('saldo', 0).order('data').order('id')),
    venda: (id) => dados(sb.from('vw_vendas').select('*').eq('id', id).single()),
    itensDaVenda: (id) => dados(sb.from('venda_itens').select('id,venda_id,produto_id,quantidade,preco_unitario').eq('venda_id', id).order('id')),
    pagamentosDaVenda: (id) => dados(sb.from('pagamentos').select('*').eq('venda_id', id).order('data').order('id')),
    salvarVenda: (id, v) => rpc('salvar_venda', {
      p_id: id, p_cliente_id: v.cliente_id, p_data: v.data, p_descricao: v.descricao,
      p_desconto: v.desconto, p_itens: v.itens, p_pagamento: v.pagamento || null,
      p_com_nf: !!v.com_nf, p_numero_nf: v.numero_nf || null, p_vencimento_boleto: v.vencimento_boleto || null,
    }),
    impostoDaVenda: (id) => rpc('imposto_da_venda', { p_id: id }),
    excluirVenda: (id) => rpc('excluir_venda', { p_id: id }),
    adicionarPagamento: (venda, data, forma, valor, conta) => rpc('adicionar_pagamento', { p_venda: venda, p_data: data, p_forma: forma, p_valor: valor, p_conta: conta }),
    excluirPagamento: (id) => rpc('excluir_pagamento', { p_id: id }),
    receberVendas: (vendas, data, forma, valor, conta) => rpc('receber_vendas', { p_vendas: vendas, p_data: data, p_forma: forma, p_valor: valor, p_conta: conta }),
    receberDoCliente: (cliente, data, forma, valor, conta) => rpc('receber_do_cliente', { p_cliente: cliente, p_data: data, p_forma: forma, p_valor: valor, p_conta: conta }),
    clientesEmAberto: () => todas(() => sb.from('vw_clientes_em_aberto').select('*').order('saldo', { ascending: false }).order('cliente_id')),

    // ---------- Compras ----------
    compras: (de, ate) => todas(() => sb.from('vw_compras').select('*').gte('data', de).lte('data', ate)
      .order('data', { ascending: false }).order('id', { ascending: false })),
    compra: (id) => dados(sb.from('vw_compras').select('*').eq('id', id).single()),
    itensDaCompra: (id) => dados(sb.from('compra_itens').select('*').eq('compra_id', id).order('id')),
    salvarCompra: (id, c) => rpc('salvar_compra', {
      p_id: id, p_fornecedor_id: c.fornecedor_id, p_data: c.data, p_forma: c.forma,
      p_descricao: c.descricao, p_desconto: c.desconto, p_itens: c.itens, p_conta_id: c.conta_id,
    }),
    excluirCompra: (id) => rpc('excluir_compra', { p_id: id }),

    // ---------- Contas ----------
    contas: () => dados(sb.from('contas').select('id,nome,tipo,ativo').order('nome')),
    saldosDasContas: () => dados(sb.from('vw_contas').select('*').order('nome')),
    salvarConta: (id, c) => rpc('salvar_conta', { p_id: id, p_nome: c.nome, p_tipo: c.tipo, p_saldo_inicial: c.saldo_inicial, p_ativo: c.ativo, p_data_inicio: c.data_inicio || null }),
    extrato: (conta, de, ate) => todas(() => sb.from('vw_extrato').select('*').eq('conta_id', conta).gte('data', de).lte('data', ate).order('data').order('origem').order('id')),
    saldoAntes: (conta, data) => rpc('saldo_conta_antes', { p_conta: conta, p_data: data }),
    lancamento: (id) => dados(sb.from('lancamentos').select('*').eq('id', id).single()),
    salvarLancamento: (id, l) => rpc('salvar_lancamento', {
      p_id: id, p_conta: l.conta_id, p_data: l.data, p_tipo: l.tipo, p_categoria: l.categoria, p_descricao: l.descricao, p_valor: l.valor,
    }),
    excluirLancamento: (id) => rpc('excluir_lancamento', { p_id: id }),
    transferir: (origem, destino, data, valor, descricao) => rpc('transferir', { p_origem: origem, p_destino: destino, p_data: data, p_valor: valor, p_descricao: descricao }),
    marcarConferido: (origem, id, conferido) => rpc('marcar_conferido', { p_origem: origem, p_id: id, p_conferido: conferido }),

    // ---------- Configurações ----------
    configuracoes: () => dados(sb.from('configuracoes').select('*').eq('id', 1).single()),
    salvarAliquotaNf: (aliquota) => rpc('salvar_aliquota_nf', { p_aliquota: aliquota }),

    // ---------- Usuários ----------
    usuarios: () => rpc('listar_usuarios'),
    atualizarUsuario: (u) => rpc('atualizar_usuario', { p_user: u.user_id, p_nome: u.nome, p_papel: u.papel, p_permissoes: u.permissoes, p_ativo: u.ativo }),
    criarUsuario: (u) => chamarFuncao({ acao: 'criar', ...u }),
    trocarSenhaUsuario: (userId, senha) => chamarFuncao({ acao: 'trocar_senha', user_id: userId, senha }),

    // ---------- Relatórios ----------
    relMensal: (ano) => rpc('rel_mensal', { p_ano: ano }),
    relProdutos: (de, ate, soQuitadas) => rpc('rel_produtos', { p_de: de, p_ate: ate, p_so_quitadas: soQuitadas }),
    relClientes: (de, ate) => rpc('rel_clientes', { p_de: de, p_ate: ate }),
    relFormas: (de, ate) => rpc('rel_formas', { p_de: de, p_ate: ate }),
    relDespesas: (de, ate) => rpc('rel_despesas', { p_de: de, p_ate: ate }),
    relNf: (de, ate) => rpc('rel_nf', { p_de: de, p_ate: ate }),
    impostoPago: (de, ate) => rpc('imposto_pago_periodo', { p_de: de, p_ate: ate }),
  };
})();
