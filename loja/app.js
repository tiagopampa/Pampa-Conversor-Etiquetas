// Telas do sistema. Tudo que vem do banco passa por esc() antes de entrar no HTML.
(function () {
  const raiz = document.getElementById('app');
  let acesso = null;   // { nome, papel, permissoes }
  const master = () => acesso?.papel === 'master';
  const pode = (p) => master() || !!acesso?.permissoes?.includes(p);

  // ---------- Utilidades ----------
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const numBr = (n, d = 2) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const dataBr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
  const p2 = (n) => String(n).padStart(2, '0');
  const isoLocal = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const hoje = () => isoLocal(new Date());
  const mesAtual = () => hoje().slice(0, 7);
  const fimDoMes = (m) => { const [a, b] = m.split('-').map(Number); return isoLocal(new Date(a, b, 0)); };
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const FORMAS = { dinheiro: 'Dinheiro', pix: 'PIX / Transferência', boleto: 'Boleto', credito: 'Cartão de crédito', debito: 'Cartão de débito', cheque: 'Cheque', cortesia: 'Cortesia' };
  const FORMAS_COMPRA = { dinheiro: 'Dinheiro', pix: 'PIX / Transferência', boleto: 'Boleto', credito: 'Cartão de crédito', debito: 'Cartão de débito', cheque: 'Cheque' };
  const opcoes = (mapa, sel) => Object.entries(mapa).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const contem = (texto, busca) => normalizar(String(texto ?? '')).includes(normalizar(busca));

  // Aceita "1.234,56", "1234,56", "12,5" e "12.50".
  function lerNumero(v) {
    let s = String(v ?? '').replace(/[^\d,.-]/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }
  const paraCampo = (n) => (n === null || n === undefined || n === '' ? '' : numBr(n));
  const arred = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  function aviso(msg, erro = false) {
    document.querySelector('.aviso-toast')?.remove();
    const el = document.createElement('div');
    el.className = 'aviso-toast' + (erro ? ' erro-toast' : '');
    el.setAttribute('role', 'status');
    el.textContent = msg;
    (document.querySelector('dialog[open]') || document.body).appendChild(el);
    setTimeout(() => el.remove(), erro ? 6000 : 3000);
  }

  function erroTela(e) { console.error(e); aviso(e.message || 'Erro inesperado', true); }

  function linkZap(telefone, texto) {
    let n = String(telefone || '').replace(/\D/g, '');
    if (!n) return null;
    if (n.length <= 11) n = '55' + n;
    return `https://wa.me/${n}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
  }

  function baixarCsv(nome, cabecalho, linhas) {
    const celula = (v) => {
      let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
      if (typeof v !== 'number' && /^[=+\-@]/.test(s)) s = "'" + s;   // evita fórmula no Excel
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- Janela (modal) ----------
  function janela({ titulo, corpo, pe = '' }) {
    const d = document.createElement('dialog');
    d.className = 'janela';
    d.innerHTML = `<div class="janela-casca">
      <div class="janela-topo"><h2>${esc(titulo)}</h2><button class="fechar" type="button" aria-label="Fechar">×</button></div>
      <div class="janela-corpo">${corpo}</div>
      ${pe ? `<div class="janela-pe">${pe}</div>` : ''}
    </div>`;
    document.body.appendChild(d);
    const fechar = () => { d.close(); d.remove(); };
    d.querySelector('.fechar').onclick = fechar;
    d.addEventListener('cancel', (e) => { e.preventDefault(); fechar(); });
    d.showModal();
    d.fechar = fechar;
    return d;
  }

  function confirmar(titulo, texto, botao = 'Confirmar') {
    return new Promise((ok) => {
      const d = janela({
        titulo, corpo: `<p style="margin:0">${esc(texto)}</p>`,
        pe: `<button class="btn" data-n>Voltar</button><button class="btn primario" data-s>${esc(botao)}</button>`,
      });
      d.querySelector('[data-n]').onclick = () => { d.fechar(); ok(false); };
      d.querySelector('[data-s]').onclick = () => { d.fechar(); ok(true); };
    });
  }

  // Evita clique duplo gravar duas vezes.
  async function comTrava(botao, fn) {
    if (botao.disabled) return;
    botao.disabled = true;
    try { await fn(); } catch (e) { erroTela(e); } finally { botao.disabled = false; }
  }

  // Campo de busca com lista (cliente, produto, fornecedor).
  function combo(host, { itens, rotulo, sub, marcador, aoEscolher, valor = '' }) {
    host.classList.add('combo');
    host.innerHTML = `<input type="text" placeholder="${esc(marcador || 'Digite para buscar')}" value="${esc(valor)}" autocomplete="off"><div class="combo-lista" hidden></div>`;
    const input = host.querySelector('input');
    const lista = host.querySelector('.combo-lista');
    let atual = null;
    function mostrar() {
      const achados = itens.filter((i) => contem(rotulo(i), input.value)).slice(0, 40);
      lista.innerHTML = achados.map((i, n) => `<button type="button" class="combo-item" data-n="${n}">${esc(rotulo(i))}${sub ? `<span class="sub"> ${esc(sub(i))}</span>` : ''}</button>`).join('')
        || '<div class="combo-item sub">Nada encontrado</div>';
      lista.hidden = false;
      lista.querySelectorAll('[data-n]').forEach((b) => {
        b.onmousedown = (e) => e.preventDefault();
        b.onclick = () => { atual = achados[+b.dataset.n]; input.value = rotulo(atual); lista.hidden = true; aoEscolher(atual); };
      });
    }
    input.onfocus = () => { input.select(); mostrar(); };
    input.oninput = () => { if (atual) { atual = null; aoEscolher(null); } mostrar(); };
    input.onblur = () => { lista.hidden = true; };
    return { limpar() { input.value = ''; atual = null; } };
  }

  // ---------- Conta do pagamento ----------
  const opcoesConta = (contas, sel, vazio) =>
    (vazio ? `<option value="">${esc(vazio)}</option>` : '<option value="">Escolha a conta</option>')
    + contas.filter((c) => c.ativo || c.id === sel).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');

  function lembrarConta(id) { try { localStorage.setItem('loja_conta', String(id)); } catch { /* sem armazenamento */ } }
  function contaLembrada() { try { return +localStorage.getItem('loja_conta') || null; } catch { return null; } }

  // Dinheiro sugere a conta do caixa, cortesia não usa conta e os demais sugerem a última usada.
  function ligarConta(selForma, selConta, contas) {
    const atualizar = () => {
      const f = selForma.value;
      selConta.disabled = f === 'cortesia';
      if (f === 'cortesia') { selConta.value = ''; return; }
      const caixa = contas.find((c) => c.tipo === 'dinheiro' && c.ativo);
      const ultima = contas.find((c) => c.id === contaLembrada() && c.ativo && c.tipo !== 'dinheiro');
      const sugestao = f === 'dinheiro' ? caixa : ultima || contas.find((c) => c.tipo === 'banco' && c.ativo);
      if (sugestao) selConta.value = sugestao.id;
    };
    selForma.addEventListener('change', atualizar);
    atualizar();
  }

  // ---------- Boleto ----------
  const boletoVencido = (v) => v.vencimento_boleto && v.saldo > 0 && v.vencimento_boleto < hoje();
  const seloBoleto = (v) => (!v.vencimento_boleto || v.saldo <= 0 ? ''
    : `<span class="selo ${boletoVencido(v) ? 'perigo' : 'alerta'}">Boleto ${boletoVencido(v) ? 'venceu' : 'vence'} ${dataBr(v.vencimento_boleto).slice(0, 5)}</span>`);

  // ---------- Selos ----------
  const seloVenda = (s) => ({
    quitada: '<span class="selo ok">Quitada</span>', parcial: '<span class="selo alerta">Parcial</span>', aberta: '<span class="selo perigo">Em aberto</span>',
  }[s] || '');
  const seloEstoque = (p) => ({
    servico: '<span class="selo neutro">Serviço</span>',
    sem_estoque: `<span class="selo perigo">${p.estoque} · sem estoque</span>`,
    pouco_estoque: `<span class="selo alerta">${p.estoque} · pouco estoque</span>`,
    com_estoque: `<span class="selo ok">${p.estoque} em estoque</span>`,
  }[p.situacao] || '');

  // ---------- Formulários de itens (venda e compra) ----------
  function editorDeItens(host, { produtos, tipo, itensIniciais = [], semPrevia = false, aliquotaNf = () => null, aoMudar }) {
    const campoValor = tipo === 'venda' ? 'preco_unitario' : 'custo_unitario';
    const candidatos = tipo === 'venda'
      ? produtos.filter((p) => p.ativo)
      : produtos.filter((p) => p.ativo && p.controla_estoque);
    let itens = [];

    function nota(it) {
      const p = it.produto;
      if (!p) return '';
      if (tipo === 'venda') {
        const a = aliquotaNf();
        const sugerido = a !== null && p.preco_venda > 0 ? arred(p.preco_venda / (1 - a / 100)) : null;
        const dica = sugerido === null ? '' : `<span class="item-nota">Sugerido com NF: <strong>${brl(sugerido)}</strong> <button type="button" class="link" data-usar="${paraCampo(sugerido)}">Usar</button></span>`;
        if (p.controla_estoque && it.quantidade > p.estoque + (it.qtdOriginal || 0)) {
          return `<span class="item-nota aviso">Estoque atual: ${p.estoque}. A venda deixará o estoque negativo.</span>${dica ? `<br>${dica}` : ''}`;
        }
        return (p.controla_estoque ? `<span class="item-nota">Em estoque: ${p.estoque}</span>` : '') + (dica ? `${p.controla_estoque ? '<br>' : ''}${dica}` : '');
      }
      if (semPrevia) return '';
      // Prévia do novo custo médio. O valor final é calculado pelo banco.
      const base = Math.max(p.estoque, 0);
      const c = Number(p.custo_medio);
      const q = it.quantidade, novo = lerNumero(it.valorTxt);
      if (!q) return '';
      const media = p.custo_medio === null || base === 0 ? novo : (base * c + q * novo) / (base + q);
      return `<span class="item-nota">Custo médio: ${p.custo_medio === null ? '—' : brl(c)} → <strong>${brl(media)}</strong> · estoque ${p.estoque} → ${p.estoque + q}</span>`;
    }

    function linhaHtml(i, it) {
      return `<div class="item-linha" data-i="${i}">
        <label class="campo item-produto">Produto<div data-combo></div></label>
        <label class="campo">Qtd<input data-qtd inputmode="numeric" value="${it.quantidade || ''}"></label>
        <label class="campo">${tipo === 'venda' ? 'Preço un.' : 'Custo un.'}<input data-val inputmode="decimal" value="${esc(it.valorTxt)}"></label>
        <button type="button" class="remover" aria-label="Remover item" data-rem>×</button>
        <div data-nota class="item-nota-host" style="grid-column:1/-1">${nota(it)}</div>
      </div>`;
    }

    function desenhar() {
      host.innerHTML = itens.map((it, i) => linhaHtml(i, it)).join('');
      host.querySelectorAll('.item-linha').forEach((el) => {
        const i = +el.dataset.i, it = itens[i];
        const atualizarNota = () => { el.querySelector('[data-nota]').innerHTML = nota(it); aoMudar(); };
        combo(el.querySelector('[data-combo]'), {
          itens: candidatos, valor: it.produto?.nome || '', marcador: 'Buscar produto',
          rotulo: (p) => p.nome, sub: (p) => (tipo === 'venda' ? brl(p.preco_venda) : ''),
          aoEscolher: (p) => {
            it.produto = p;
            if (p) {
              it.valorTxt = tipo === 'venda' ? paraCampo(p.preco_venda) : paraCampo(p.custo_medio);
              el.querySelector('[data-val]').value = it.valorTxt;
              if (!it.quantidade) { it.quantidade = 1; el.querySelector('[data-qtd]').value = 1; }
            }
            atualizarNota();
          },
        });
        el.querySelector('[data-nota]').onclick = (e) => {
          const b = e.target.closest('[data-usar]');
          if (!b) return;
          it.valorTxt = b.dataset.usar;
          el.querySelector('[data-val]').value = it.valorTxt;
          atualizarNota();
        };
        el.querySelector('[data-qtd]').oninput = (e) => { it.quantidade = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0; atualizarNota(); };
        el.querySelector('[data-val]').oninput = (e) => { it.valorTxt = e.target.value; atualizarNota(); };
        el.querySelector('[data-rem]').onclick = () => { itens.splice(i, 1); desenhar(); aoMudar(); };
      });
    }

    itens = itensIniciais.map((it) => ({
      produto: produtos.find((p) => p.id === it.produto_id) || null,
      quantidade: it.quantidade, qtdOriginal: it.quantidade, valorTxt: paraCampo(it[campoValor]),
    }));
    desenhar();

    return {
      atualizar() { desenhar(); },
      adicionar() { itens.push({ produto: null, quantidade: 0, valorTxt: '' }); desenhar(); host.querySelector('.item-linha:last-child input')?.focus(); },
      subtotal: () => arred(itens.reduce((s, it) => s + it.quantidade * lerNumero(it.valorTxt), 0)),
      coletar() {
        if (!itens.length) throw new Error('Adicione ao menos um item.');
        return itens.map((it) => {
          if (!it.produto) throw new Error('Escolha o produto de todos os itens.');
          if (!it.quantidade) throw new Error(`Informe a quantidade de ${it.produto.nome}.`);
          return { produto_id: it.produto.id, quantidade: it.quantidade, [campoValor]: lerNumero(it.valorTxt) };
        });
      },
    };
  }

  // ---------- Venda: formulário ----------
  async function formVenda(id, aoSalvar) {
    const [produtos, clientes, contas, config] = await Promise.all([api.produtos(true), api.clientes(), api.contas(), api.configuracoes()]);
    const venda = id ? await api.venda(id) : null;
    const aliquota = Number(config.aliquota_nf);
    let comNf = !!venda?.com_nf;
    const itensIni = id ? await api.itensDaVenda(id) : [];
    let cliente = venda?.cliente_id ? clientes.find((c) => c.id === venda.cliente_id) || { id: venda.cliente_id, nome: venda.cliente_nome } : null;
    let tipoDesc = 'reais';

    const d = janela({
      titulo: id ? `Editar venda nº ${id}` : 'Nova venda',
      corpo: `<div class="pilha">
        <div class="form-grade">
          <label class="campo inteiro">Cliente (em branco = balcão)<div data-cliente></div></label>
          <label class="campo">Data<input type="date" data-data value="${venda?.data || hoje()}"></label>
          <label class="campo">Descrição (opcional)<input data-desc value="${esc(venda?.descricao)}" maxlength="200"></label>
          <label class="check"><input type="checkbox" data-nf ${comNf ? 'checked' : ''}> Com NF</label>
          <label class="campo" data-nf-campo ${comNf ? '' : 'hidden'}>Número da NF (opcional)<input data-nf-num value="${esc(venda?.numero_nf)}" maxlength="30"></label>
        </div>
        <div><h2>Itens</h2><div data-itens></div>
          <button type="button" class="btn" data-add style="width:100%">Adicionar item</button></div>
        <div class="form-grade manter2">
          <label class="campo">Desconto
            <input data-desconto inputmode="decimal" value="${venda?.desconto > 0 ? paraCampo(venda.desconto) : ''}"></label>
          <label class="campo">Tipo do desconto
            <select data-tipo-desc><option value="reais">R$</option><option value="pct">%</option></select></label>
        </div>
        <div class="totais">
          <div class="linha-conta sub"><span>Subtotal</span><span data-sub></span></div>
          <div class="linha-conta sub"><span>Desconto</span><span data-dtotal></span></div>
          <div class="linha-conta grande"><span>Total</span><span data-total></span></div>
          ${pode('relatorios') ? `<div class="linha-conta sub" data-imp-linha hidden><span>Imposto previsto (${numBr(aliquota)}%)</span><span data-imp></span></div>` : ''}
        </div>
        ${id ? `<label class="campo">Vencimento do boleto (deixe em branco se não for boleto)<input type="date" data-venc value="${venda.vencimento_boleto || ''}"></label>
        <p class="sub" style="margin:0">Já pago: ${brl(venda.pago)}. Pagamentos são lançados no detalhe da venda.</p>` : `
        <div class="cartao">
          <h2>Recebido agora</h2>
          <div class="form-grade manter2">
            <label class="campo">Forma<select data-forma>${opcoes(FORMAS, 'pix')}</select></label>
            <label class="campo" data-campo-valor>Valor<input data-pago inputmode="decimal" placeholder="0,00"></label>
            <label class="campo" data-campo-venc hidden>Vencimento do boleto<input type="date" data-venc></label>
            <label class="campo inteiro" style="grid-column:1/-1" data-campo-conta>Conta<select data-conta>${opcoesConta(contas)}</select></label>
          </div>
          <div class="acoes-linha" data-acoes-pag>
            <button type="button" class="btn pequeno" data-tudo>Pagou tudo</button>
            <button type="button" class="btn pequeno" data-nada>Vai pagar depois</button>
          </div>
          <p class="sub" data-resta style="margin:8px 0 0"></p>
        </div>`}
      </div>`,
      pe: `<button class="btn" data-voltar>Cancelar</button><button class="btn primario" data-salvar>${id ? 'Salvar alterações' : 'Salvar venda'}</button>`,
    });

    combo(d.querySelector('[data-cliente]'), {
      itens: clientes, valor: cliente?.nome || '', marcador: 'Buscar cliente',
      rotulo: (c) => c.nome, sub: (c) => c.telefone || '', aoEscolher: (c) => { cliente = c; recalcular(); },
    });

    const calcDesconto = (sub) => {
      const v = lerNumero(d.querySelector('[data-desconto]').value);
      return tipoDesc === 'pct' ? arred(sub * v / 100) : arred(v);
    };
    function recalcular() {
      const sub = editor.subtotal(), desc = calcDesconto(sub), tot = arred(sub - desc);
      d.querySelector('[data-sub]').textContent = brl(sub);
      d.querySelector('[data-dtotal]').textContent = brl(desc);
      d.querySelector('[data-total]').textContent = brl(tot);
      const impLinha = d.querySelector('[data-imp-linha]');
      if (impLinha) { impLinha.hidden = !comNf; d.querySelector('[data-imp]').textContent = brl(arred(tot * aliquota / 100)); }
      const resta = d.querySelector('[data-resta]');
      if (resta && d.querySelector('[data-forma]').value === 'boleto') {
        const venc = d.querySelector('[data-venc]').value;
        resta.textContent = cliente
          ? `Boleto de ${brl(tot)} para ${cliente.nome}${venc ? `, vencendo em ${dataBr(venc)}` : ''}. A venda fica em aberto até o pagamento.`
          : 'Para vender no boleto, escolha um cliente.';
      } else if (resta) {
        const falta = arred(tot - lerNumero(d.querySelector('[data-pago]').value));
        resta.textContent = falta > 0
          ? (cliente ? `Fica em aberto para ${cliente.nome}: ${brl(falta)}` : `Faltam ${brl(falta)}. Para deixar em aberto, escolha um cliente.`)
          : '';
      }
    }
    const editor = editorDeItens(d.querySelector('[data-itens]'), { produtos, tipo: 'venda', itensIniciais: itensIni, aliquotaNf: () => (comNf ? aliquota : null), aoMudar: () => recalcular() });
    d.querySelector('[data-add]').onclick = () => editor.adicionar();
    d.querySelector('[data-nf]').onchange = (e) => {
      comNf = e.target.checked;
      d.querySelector('[data-nf-campo]').hidden = !comNf;
      editor.atualizar();
      recalcular();
    };
    d.querySelector('[data-desconto]').oninput = recalcular;
    d.querySelector('[data-tipo-desc]').onchange = (e) => { tipoDesc = e.target.value; recalcular(); };
    if (!id) {
      d.querySelector('[data-pago]').oninput = recalcular;
      ligarConta(d.querySelector('[data-forma]'), d.querySelector('[data-conta]'), contas);
      const formaSel = d.querySelector('[data-forma]');
      const mostrarBoleto = () => {
        const boleto = formaSel.value === 'boleto';
        d.querySelector('[data-campo-valor]').hidden = boleto;
        d.querySelector('[data-campo-conta]').hidden = boleto;
        d.querySelector('[data-acoes-pag]').hidden = boleto;
        d.querySelector('[data-campo-venc]').hidden = !boleto;
        if (boleto) d.querySelector('[data-pago]').value = '';
        recalcular();
      };
      formaSel.addEventListener('change', mostrarBoleto);
      d.querySelector('[data-venc]').onchange = recalcular;
      d.querySelector('[data-tudo]').onclick = () => {
        const sub = editor.subtotal();
        d.querySelector('[data-pago]').value = paraCampo(arred(sub - calcDesconto(sub)));
        recalcular();
      };
      d.querySelector('[data-nada]').onclick = () => { d.querySelector('[data-pago]').value = ''; recalcular(); };
      editor.adicionar();
    }
    recalcular();

    d.querySelector('[data-voltar]').onclick = d.fechar;
    d.querySelector('[data-salvar]').onclick = (e) => comTrava(e.target, async () => {
      const itens = editor.coletar();
      const desconto = calcDesconto(editor.subtotal());
      const dados = {
        cliente_id: cliente?.id ?? null, data: d.querySelector('[data-data]').value || hoje(),
        descricao: d.querySelector('[data-desc]').value, desconto, itens,
        com_nf: comNf, numero_nf: comNf ? d.querySelector('[data-nf-num]').value : null,
      };
      const vencTxt = d.querySelector('[data-venc]')?.value || null;
      if (id) {
        dados.vencimento_boleto = vencTxt;
      } else if (d.querySelector('[data-forma]').value === 'boleto') {
        if (!vencTxt) throw new Error('Informe o vencimento do boleto.');
        dados.vencimento_boleto = vencTxt;
      } else {
        const valor = lerNumero(d.querySelector('[data-pago]').value);
        if (valor > 0) {
          const conta = +d.querySelector('[data-conta]').value || null;
          dados.pagamento = { forma: d.querySelector('[data-forma]').value, valor, conta_id: conta };
          if (conta) lembrarConta(conta);
        }
      }
      const novoId = await api.salvarVenda(id, dados);
      d.fechar();
      aviso(id ? 'Venda atualizada.' : 'Venda salva.');
      aoSalvar?.(novoId);
    });
  }

  // ---------- Venda: detalhe ----------
  async function detalheVenda(id, aoMudar) {
    const [v, itens, pags, produtos, contas] = await Promise.all([api.venda(id), api.itensDaVenda(id), api.pagamentosDaVenda(id), api.produtos(true), api.contas()]);
    const imposto = v.com_nf && pode('relatorios') ? await api.impostoDaVenda(id) : null;
    const nomeConta = (cid) => contas.find((c) => c.id === cid)?.nome;
    const nomeProd = (pid) => produtos.find((p) => p.id === pid)?.nome || 'Produto';
    const d = janela({
      titulo: `Venda nº ${v.id}`,
      corpo: `<div class="pilha">
        <div class="linha-conta"><div><strong>${esc(v.cliente_nome)}</strong><div class="sub">${dataBr(v.data)}${v.vendedor ? ' · por ' + esc(v.vendedor) : ''}</div></div><div>${v.com_nf ? '<span class="selo neutro">NF</span> ' : ''}${seloVenda(v.situacao)}</div></div>
        ${v.numero_nf ? `<div class="sub">NF nº ${esc(v.numero_nf)}</div>` : ''}
        ${v.vencimento_boleto ? `<div class="sub">Boleto com vencimento em ${dataBr(v.vencimento_boleto)} ${seloBoleto(v)}</div>` : ''}
        ${v.descricao ? `<div class="sub">${esc(v.descricao)}</div>` : ''}
        <div class="linhas">${itens.map((i) => `<div class="linha-conta"><span>${i.quantidade} x ${esc(nomeProd(i.produto_id))}<span class="sub"> a ${brl(i.preco_unitario)}</span></span><span class="num">${brl(i.quantidade * i.preco_unitario)}</span></div>`).join('')}</div>
        <div class="totais">
          ${v.desconto > 0 ? `<div class="linha-conta sub"><span>Desconto</span><span>${brl(v.desconto)}</span></div>` : ''}
          <div class="linha-conta"><span>Total</span><strong>${brl(v.total)}</strong></div>
          ${imposto ? `<div class="linha-conta sub"><span>Imposto (${numBr(imposto.aliquota)}%)</span><span>${brl(imposto.imposto)}</span></div>` : ''}
          <div class="linha-conta"><span>Pago</span><span>${brl(v.pago)}</span></div>
          <div class="linha-conta grande"><span>Saldo</span><span>${brl(v.saldo)}</span></div>
        </div>
        <div><h2>Pagamentos</h2>
          ${pags.length ? `<div class="linhas">${pags.map((p) => `<div class="linha-conta"><span>${dataBr(p.data)} · ${esc(FORMAS[p.forma])}${nomeConta(p.conta_id) ? ` · ${esc(nomeConta(p.conta_id))}` : ''}</span><span class="num">${brl(p.valor)}${pode('vendas_editar') ? ` <button class="btn pequeno perigo" data-exp="${p.id}" aria-label="Excluir pagamento">Excluir</button>` : ''}</span></div>`).join('')}</div>` : '<div class="sub">Nenhum pagamento lançado.</div>'}
        </div>
      </div>`,
      pe: `${pode('vendas_editar') ? '<button class="btn perigo" data-excluir>Excluir venda</button><button class="btn" data-editar>Editar</button>' : ''}${v.saldo > 0 ? '<button class="btn primario" data-pagar>Adicionar pagamento</button>' : ''}<button class="btn" data-fechar-det>Fechar</button>`,
    });
    const reabrir = () => { d.fechar(); aoMudar?.(); detalheVenda(id, aoMudar).catch(erroTela); };
    d.querySelector('[data-fechar-det]').onclick = d.fechar;
    if (pode('vendas_editar')) {
      d.querySelector('[data-editar]').onclick = () => { d.fechar(); formVenda(id, () => { aoMudar?.(); }).catch(erroTela); };
      d.querySelector('[data-excluir]').onclick = (e) => comTrava(e.target, async () => {
        if (!await confirmar('Excluir venda', `Excluir a venda nº ${v.id} de ${brl(v.total)}? Os itens voltam para o estoque e os pagamentos são apagados.`, 'Excluir')) return;
        await api.excluirVenda(id); d.fechar(); aviso('Venda excluída.'); aoMudar?.();
      });
    }
    d.querySelectorAll('[data-exp]').forEach((b) => {
      b.onclick = () => comTrava(b, async () => {
        if (!await confirmar('Excluir pagamento', 'O valor volta a ficar em aberto. Continuar?', 'Excluir')) return;
        await api.excluirPagamento(+b.dataset.exp); reabrir();
      });
    });
    const pagar = d.querySelector('[data-pagar]');
    if (pagar) pagar.onclick = () => formPagamento({ titulo: 'Novo pagamento', maximo: v.saldo, aoEnviar: async (data, forma, valor, conta) => { await api.adicionarPagamento(id, data, forma, valor, conta); reabrir(); } }).catch(erroTela);
  }

  // Um pagamento para uma ou várias vendas do cliente. O banco divide o valor
  // entre as vendas marcadas, das mais antigas para as mais novas.
  async function formReceberVendas(nome, vendasAbertas, aoFim) {
    const contas = await api.contas();
    const ordem = [...vendasAbertas].sort((a, b) => (a.data === b.data ? a.id - b.id : a.data < b.data ? -1 : 1));
    const d = janela({
      titulo: `Receber de ${nome}`,
      corpo: `<div class="pilha">
        <div>
          <div class="linha-conta"><h2 style="margin:0">Vendas</h2><button type="button" class="link" data-todas>Desmarcar todas</button></div>
          <div data-lista-rec>${ordem.map((v) => `<label class="escolha-venda"><input type="checkbox" data-sel="${v.id}" checked>
            <span><span class="num-venda">nº ${v.id}</span> · ${dataBr(v.data)} ${seloBoleto(v)}<br><span class="sub">${esc(v.itens_resumo)}</span></span>
            <strong class="num">${brl(v.saldo)}</strong></label>`).join('')}</div>
        </div>
        <div class="linha-conta"><span>Selecionado</span><strong data-sel-total></strong></div>
        <div class="form-grade">
          <label class="campo">Data<input type="date" data-data value="${hoje()}"></label>
          <label class="campo">Forma<select data-forma>${opcoes(FORMAS, 'pix')}</select></label>
          <label class="campo">Conta<select data-conta>${opcoesConta(contas)}</select></label>
          <label class="campo">Valor recebido<input data-valor inputmode="decimal"></label>
        </div>
        <p class="sub" style="margin:0">Se o valor for menor que o selecionado, ele abate das vendas marcadas mais antigas primeiro.</p>
      </div>`,
      pe: '<button class="btn" data-v>Cancelar</button><button class="btn primario" data-s>Salvar recebimento</button>',
    });
    const caixas = [...d.querySelectorAll('[data-sel]')];
    const marcadas = () => caixas.filter((c) => c.checked).map((c) => +c.dataset.sel);
    const atualizar = () => {
      const total = arred(ordem.filter((v) => marcadas().includes(v.id)).reduce((s, v) => s + Number(v.saldo), 0));
      d.querySelector('[data-sel-total]').textContent = `${brl(total)} em ${marcadas().length} venda(s)`;
      d.querySelector('[data-valor]').value = paraCampo(total);
      d.querySelector('[data-todas]').textContent = marcadas().length ? 'Desmarcar todas' : 'Marcar todas';
    };
    caixas.forEach((c) => { c.onchange = atualizar; });
    d.querySelector('[data-todas]').onclick = () => { const marcar = !marcadas().length; caixas.forEach((c) => { c.checked = marcar; }); atualizar(); };
    ligarConta(d.querySelector('[data-forma]'), d.querySelector('[data-conta]'), contas);
    atualizar();
    d.querySelector('[data-v]').onclick = d.fechar;
    d.querySelector('[data-s]').onclick = (e) => comTrava(e.target, async () => {
      const ids = marcadas();
      if (!ids.length) throw new Error('Marque ao menos uma venda.');
      const conta = +d.querySelector('[data-conta]').value || null;
      await api.receberVendas(ids, d.querySelector('[data-data]').value || hoje(), d.querySelector('[data-forma]').value, lerNumero(d.querySelector('[data-valor]').value), conta);
      if (conta) lembrarConta(conta);
      d.fechar();
      aviso('Recebimento lançado.');
      aoFim?.();
    });
  }

  async function formPagamento({ titulo, maximo, aoEnviar, ajuda = '' }) {
    const contas = await api.contas();
    const d = janela({
      titulo,
      corpo: `<div class="form-grade">
        <label class="campo">Data<input type="date" data-data value="${hoje()}"></label>
        <label class="campo">Forma<select data-forma>${opcoes(FORMAS, 'pix')}</select></label>
        <label class="campo">Conta<select data-conta>${opcoesConta(contas)}</select></label>
        <label class="campo">Valor<input data-valor inputmode="decimal" value="${paraCampo(maximo)}"></label>
        <p class="sub inteiro" style="margin:0">Saldo: ${brl(maximo)}. ${esc(ajuda)}</p>
      </div>`,
      pe: `<button class="btn" data-v>Cancelar</button><button class="btn primario" data-s>Salvar pagamento</button>`,
    });
    ligarConta(d.querySelector('[data-forma]'), d.querySelector('[data-conta]'), contas);
    d.querySelector('[data-v]').onclick = d.fechar;
    d.querySelector('[data-s]').onclick = (e) => comTrava(e.target, async () => {
      const conta = +d.querySelector('[data-conta]').value || null;
      await aoEnviar(d.querySelector('[data-data]').value || hoje(), d.querySelector('[data-forma]').value, lerNumero(d.querySelector('[data-valor]').value), conta);
      if (conta) lembrarConta(conta);
      d.fechar();
      aviso('Pagamento lançado.');
    });
  }

  // ---------- Telas ----------
  const telas = {};

  telas.inicio = async (el) => {
    const m = mesAtual(), ano = +m.slice(0, 4), mes = +m.slice(5, 7);
    const [mensal, abertos, produtos, contas] = await Promise.all([
      pode('relatorios') ? api.relMensal(ano) : [], api.clientesEmAberto(), api.produtos(), pode('contas') ? api.saldosDasContas() : [],
    ]);
    const atual = mensal.find((x) => x.mes === mes) || {};
    const totalAberto = abertos.reduce((s, c) => s + Number(c.saldo), 0);
    const baixo = produtos.filter((p) => ['pouco_estoque', 'sem_estoque'].includes(p.situacao));
    const ativas = contas.filter((c) => c.ativo);
    el.innerHTML = `
      <div class="topo"><h1>${MESES[mes - 1]} de ${ano}</h1><div class="topo-acoes"><button class="btn primario" data-nova>Nova venda</button></div></div>
      <div class="pilha">
        ${pode('relatorios') ? `<div class="grade g4">
          <div class="cartao kpi"><div class="rotulo">Vendido no mês</div><div class="valor">${brl(atual.vendido)}</div></div>
          <div class="cartao kpi"><div class="rotulo">Recebido no mês</div><div class="valor">${brl(atual.recebido)}</div></div>
          <div class="cartao kpi"><div class="rotulo">Resultado do mês</div><div class="valor">${brl(atual.resultado)}</div></div>
          <div class="cartao kpi alerta"><div class="rotulo">Total a receber</div><div class="valor">${brl(totalAberto)}</div></div>
        </div>` : `<div class="cartao kpi alerta"><div class="rotulo">Total a receber</div><div class="valor">${brl(totalAberto)}</div></div>`}
        ${pode('contas') ? `<div class="cartao"><h2>Saldo das contas</h2>
          ${ativas.length ? `<div class="linhas">${ativas.map((c) => `<div class="linha-conta"><a href="#/contas/${c.id}">${esc(c.nome)}</a><strong class="num">${brl(c.saldo)}</strong></div>`).join('')}</div>` : '<div class="sub">Nenhuma conta criada.</div>'}
        </div>` : ''}
        <div class="grade g2">
          <div class="cartao"><h2>Maiores contas em aberto</h2>
            ${abertos.length ? `<div class="linhas">${abertos.slice(0, 6).map((c) => `<div class="linha-conta"><a href="#/clientes/${c.cliente_id}">${esc(c.cliente_nome)}</a><strong class="num">${brl(c.saldo)}</strong></div>`).join('')}</div>` : '<div class="sub">Nenhuma conta em aberto.</div>'}
          </div>
          <div class="cartao"><h2>Estoque baixo</h2>
            ${baixo.length ? `<div class="linhas">${baixo.map((p) => `<div class="linha-conta"><span>${esc(p.nome)}</span>${seloEstoque(p)}</div>`).join('')}</div>` : '<div class="sub">Nenhum produto abaixo do mínimo.</div>'}
          </div>
        </div>
      </div>`;
    el.querySelector('[data-nova]').onclick = () => formVenda(null, () => mostrar()).catch(erroTela);
  };

  const ORDEM_SITUACAO = { aberta: 0, parcial: 1, quitada: 2 };
  const COLUNAS_VENDA = [
    ['id', 'Nº'], ['cliente', 'Cliente'], ['data', 'Data'], ['itens', 'Itens'],
    ['total', 'Total'], ['saldo', 'Saldo'], ['situacao', 'Situação'],
  ];
  function compararVendas(col) {
    const porData = (a, b) => (a.data === b.data ? a.id - b.id : a.data < b.data ? -1 : 1);
    return {
      id: (a, b) => a.id - b.id,
      cliente: (a, b) => a.cliente_nome.localeCompare(b.cliente_nome, 'pt-BR') || porData(a, b),
      data: porData,
      total: (a, b) => a.total - b.total || porData(a, b),
      saldo: (a, b) => a.saldo - b.saldo || porData(a, b),
      situacao: (a, b) => ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] || porData(a, b),
    }[col];
  }

  telas.vendas = async (el, estado) => {
    estado.modo ??= 'mes'; estado.mes ??= mesAtual(); estado.ano ??= mesAtual().slice(0, 4);
    estado.sit ??= 'todas'; estado.nf ??= ''; estado.busca ??= '';
    estado.col ??= 'data'; estado.dir ??= 'desc';
    const LOTE_TELA = 100;
    let visiveis = LOTE_TELA;
    const opcoesOrdem = {
      'data:desc': 'Mais recentes', 'data:asc': 'Mais antigas', 'id:desc': 'Número (maior)', 'id:asc': 'Número (menor)',
      'cliente:asc': 'Cliente (A–Z)', 'cliente:desc': 'Cliente (Z–A)', 'total:desc': 'Maior total', 'total:asc': 'Menor total',
      'saldo:desc': 'Maior saldo', 'saldo:asc': 'Menor saldo', 'situacao:asc': 'Situação: em aberto primeiro', 'situacao:desc': 'Situação: quitadas primeiro',
    };
    el.innerHTML = `
      <div class="topo"><h1>Vendas</h1><div class="topo-acoes">${pode('relatorios') ? '<button class="btn" data-csv>Exportar</button>' : ''}<button class="btn primario" data-nova>Nova venda</button></div></div>
      <div class="filtros">
        <label class="campo">Período<select data-modo>${opcoes({ mes: 'Por mês', ano: 'Por ano', tudo: 'Tudo' }, estado.modo)}</select></label>
        <label class="campo" data-campo-mes>Mês<input type="month" data-mes value="${estado.mes}"></label>
        <label class="campo" data-campo-ano>Ano<input data-ano inputmode="numeric" maxlength="4" value="${estado.ano}"></label>
        <label class="campo">Situação<select data-sit>
          ${opcoes({ todas: 'Todas', pendentes: 'Com saldo em aberto', quitada: 'Quitadas', boleto: 'Boleto em aberto', vencido: 'Boleto vencido' }, estado.sit)}</select></label>
        <label class="campo">Nota<select data-nf>${opcoes({ '': 'Com e sem NF', com: 'Com NF', sem: 'Sem NF' }, estado.nf)}</select></label>
        <label class="campo">Buscar<input data-busca placeholder="Nº da venda, cliente, produto ou NF" value="${esc(estado.busca)}"></label>
        <label class="campo so-celular">Ordenar por<select data-ordem-cel>${opcoes(opcoesOrdem, `${estado.col}:${estado.dir}`)}</select></label>
      </div>
      <div data-lista><div class="vazio">Carregando…</div></div>`;
    let vendas = [];
    const periodo = () => (estado.modo === 'mes' ? [`${estado.mes}-01`, fimDoMes(estado.mes)]
      : estado.modo === 'ano' ? [`${estado.ano}-01-01`, `${estado.ano}-12-31`]
        : ['2000-01-01', '2100-12-31']);
    // Só números (ou "nº 123") busca pelo número da venda ou da NF.
    const numeroBuscado = () => (estado.busca.match(/^\s*(?:n[º°o.]?\s*)?(\d+)\s*$/i) || [])[1];
    const filtradas = () => {
      const n = numeroBuscado();
      const lista = vendas.filter((v) =>
        (estado.sit === 'todas'
          || (estado.sit === 'pendentes' && v.saldo > 0)
          || (estado.sit === 'quitada' && v.situacao === 'quitada')
          || (estado.sit === 'boleto' && v.vencimento_boleto && v.saldo > 0)
          || (estado.sit === 'vencido' && boletoVencido(v)))
        && (!estado.nf || (estado.nf === 'com') === v.com_nf)
        && (!estado.busca || (n ? String(v.id) === n || v.numero_nf === n
          : contem(`${v.cliente_nome} ${v.descricao || ''} ${v.itens_resumo || ''} ${v.numero_nf || ''}`, estado.busca))));
      const cmp = compararVendas(estado.col);
      return lista.sort((a, b) => (estado.dir === 'asc' ? cmp(a, b) : cmp(b, a)));
    };
    function cabecalho() {
      return COLUNAS_VENDA.map(([k, r]) => {
        const num = ['total', 'saldo'].includes(k) ? ' class="num"' : '';
        if (k === 'itens') return `<th${num}>${r}</th>`;
        const ativa = estado.col === k;
        const seta = ativa ? (estado.dir === 'asc' ? '▲' : '▼') : '▲▼';
        return `<th${num} aria-sort="${ativa ? (estado.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="ordena${ativa ? ' ativa' : ''}" data-col="${k}">${r}<span class="seta">${seta}</span></button></th>`;
      }).join('');
    }
    function lista() {
      const f = filtradas(), box = el.querySelector('[data-lista]');
      const emAberto = f.reduce((a, v) => a + Number(v.saldo), 0);
      const parte = f.slice(0, visiveis);
      box.innerHTML = `<p class="sub" style="margin:0 0 8px">${f.length} venda(s) · Em aberto ${brl(emAberto)}</p>
      <div class="tabela-caixa">${f.length ? `<table class="responsiva"><thead><tr>${cabecalho()}</tr></thead><tbody>
        ${parte.map((v) => `<tr class="clicavel" data-id="${v.id}"><td data-r="Nº"><span class="num-venda">nº ${v.id}</span></td><td class="principal">${esc(v.cliente_nome)}${v.com_nf ? ' <span class="selo neutro">NF</span>' : ''}${v.descricao ? `<div class="sub">${esc(v.descricao)}</div>` : ''}</td>
          <td data-r="Data">${dataBr(v.data)}</td><td data-r="Itens"><span class="sub">${esc(v.itens_resumo)}</span></td><td class="num" data-r="Total">${brl(v.total)}</td><td class="num" data-r="Saldo">${brl(v.saldo)}</td><td data-r="Situação">${seloVenda(v.situacao)} ${seloBoleto(v)}</td></tr>`).join('')}
      </tbody></table>` : '<div class="vazio">Nenhuma venda encontrada.</div>'}</div>
      ${f.length > parte.length ? `<div style="text-align:center;margin-top:12px"><button class="btn" data-mais>Mostrar mais (${f.length - parte.length} restantes)</button></div>` : ''}`;
      box.querySelectorAll('[data-id]').forEach((tr) => { tr.onclick = () => detalheVenda(+tr.dataset.id, carregar).catch(erroTela); });
      box.querySelectorAll('[data-col]').forEach((b) => {
        b.onclick = () => {
          const col = b.dataset.col;
          if (estado.col === col) estado.dir = estado.dir === 'asc' ? 'desc' : 'asc';
          else { estado.col = col; estado.dir = ['data', 'id', 'total', 'saldo'].includes(col) ? 'desc' : 'asc'; }
          el.querySelector('[data-ordem-cel]').value = `${estado.col}:${estado.dir}`;
          lista();
        };
      });
      const mais = box.querySelector('[data-mais]');
      if (mais) mais.onclick = () => { visiveis += LOTE_TELA; lista(); };
    }
    async function carregar() {
      el.querySelector('[data-campo-mes]').hidden = estado.modo !== 'mes';
      el.querySelector('[data-campo-ano]').hidden = estado.modo !== 'ano';
      const [de, ate] = periodo();
      vendas = await api.vendas(de, ate);
      lista();
    }
    const refazFiltro = (fn) => (e) => { fn(e); visiveis = LOTE_TELA; lista(); };
    const recarrega = () => { visiveis = LOTE_TELA; carregar().catch(erroTela); };
    el.querySelector('[data-modo]').onchange = (e) => { estado.modo = e.target.value; recarrega(); };
    el.querySelector('[data-mes]').onchange = (e) => { if (e.target.value) { estado.mes = e.target.value; recarrega(); } };
    el.querySelector('[data-ano]').onchange = (e) => { if (/^\d{4}$/.test(e.target.value)) { estado.ano = e.target.value; recarrega(); } };
    el.querySelector('[data-sit]').onchange = refazFiltro((e) => { estado.sit = e.target.value; });
    el.querySelector('[data-nf]').onchange = refazFiltro((e) => { estado.nf = e.target.value; });
    el.querySelector('[data-busca]').oninput = refazFiltro((e) => { estado.busca = e.target.value; });
    el.querySelector('[data-ordem-cel]').onchange = refazFiltro((e) => { [estado.col, estado.dir] = e.target.value.split(':'); });
    el.querySelector('[data-nova]').onclick = () => formVenda(null, carregar).catch(erroTela);
    const exportarVendas = el.querySelector('[data-csv]');
    if (exportarVendas) exportarVendas.onclick = () => baixarCsv(`vendas-${estado.modo === 'mes' ? estado.mes : estado.modo === 'ano' ? estado.ano : 'todas'}.csv`,
      ['Venda', 'Data', 'Cliente', 'Itens', 'Descrição', 'Total', 'Pago', 'Saldo', 'Situação', 'NF', 'Número da NF', 'Vencimento do boleto'],
      filtradas().map((v) => [v.id, dataBr(v.data), v.cliente_nome, v.itens_resumo, v.descricao, Number(v.total), Number(v.pago), Number(v.saldo), v.situacao, v.com_nf ? 'Sim' : 'Não', v.numero_nf, dataBr(v.vencimento_boleto)]));
    await carregar();
  };

  telas.receber = async (el, estado) => {
    estado.busca ??= ''; estado.atraso ??= '0'; estado.ordem ??= 'saldo'; estado.aberto ??= null; estado.boleto ??= '';
    el.innerHTML = `
      <div class="topo"><h1>A receber</h1><div class="topo-acoes"><button class="btn" data-csv>Exportar</button></div></div>
      <div class="filtros">
        <label class="campo">Buscar cliente<input data-busca value="${esc(estado.busca)}"></label>
        <label class="campo">Em aberto há<select data-atraso>${opcoes({ 0: 'Qualquer prazo', 7: 'Mais de 7 dias', 30: 'Mais de 30 dias', 60: 'Mais de 60 dias' }, estado.atraso)}</select></label>
        <label class="campo">Boleto<select data-boleto>${opcoes({ '': 'Todos', vencido: 'Com boleto vencido', avencer: 'Com boleto a vencer' }, estado.boleto)}</select></label>
        <label class="campo">Ordenar por<select data-ordem>${opcoes({ saldo: 'Maior saldo', dias: 'Mais antigo', nome: 'Nome' }, estado.ordem)}</select></label>
      </div>
      <div data-lista><div class="vazio">Carregando…</div></div>`;
    let contas = [], vendas = [];
    const filtradas = () => contas
      .filter((c) => (!estado.busca || contem(c.cliente_nome, estado.busca)) && (!+estado.atraso || c.dias > +estado.atraso)
        && (!estado.boleto || vendas.some((v) => v.cliente_id === c.cliente_id && v.vencimento_boleto
          && (estado.boleto === 'vencido' ? boletoVencido(v) : !boletoVencido(v)))))
      .sort((a, b) => (estado.ordem === 'saldo' ? b.saldo - a.saldo : estado.ordem === 'dias' ? b.dias - a.dias : a.cliente_nome.localeCompare(b.cliente_nome, 'pt-BR')));
    function lista() {
      const f = filtradas(), box = el.querySelector('[data-lista]');
      const tot = f.reduce((s, c) => s + Number(c.saldo), 0);
      box.innerHTML = `<div class="cartao kpi alerta" style="margin-bottom:12px"><div class="rotulo">${f.length} cliente(s) em aberto</div><div class="valor">${brl(tot)}</div></div>
      <div class="pilha" style="gap:8px">${f.map((c) => {
        const vs = vendas.filter((v) => v.cliente_id === c.cliente_id);
        const msg = `Olá, ${c.cliente_nome}! Consta em aberto o valor de ${brl(c.saldo)}.`;
        const zap = linkZap(c.cliente_telefone, msg);
        return `<div class="cartao conta-cliente">
          <div class="linha-conta"><div><a class="nome" href="#/clientes/${c.cliente_id}">${esc(c.cliente_nome)}</a><div class="sub">${c.vendas} venda(s) · desde ${dataBr(c.desde)} · ${c.dias} dia(s)</div>${vs.some(boletoVencido) ? '<span class="selo perigo">Boleto vencido</span>' : ''}</div><div class="saldo">${brl(c.saldo)}</div></div>
          <div class="acoes-linha">
            <button class="btn pequeno primario" data-rec="${c.cliente_id}">Receber</button>
            <button class="btn pequeno" data-ver="${c.cliente_id}">${estado.aberto === c.cliente_id ? 'Ocultar vendas' : 'Ver vendas'}</button>
            ${zap ? `<a class="btn pequeno" href="${esc(zap)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          </div>
          ${estado.aberto === c.cliente_id ? `<div class="conta-detalhe linhas">${vs.map((v) => `<div class="linha-conta clicavel" data-venda="${v.id}" style="cursor:pointer"><span><span class="num-venda">nº ${v.id}</span> · ${dataBr(v.data)} ${seloBoleto(v)} <span class="sub">${esc(v.itens_resumo)}</span></span><strong class="num">${brl(v.saldo)}</strong></div>`).join('')}</div>` : ''}
        </div>`;
      }).join('') || '<div class="cartao vazio">Nenhuma conta em aberto com esse filtro.</div>'}</div>`;
      box.querySelectorAll('[data-ver]').forEach((b) => { b.onclick = () => { estado.aberto = estado.aberto === +b.dataset.ver ? null : +b.dataset.ver; lista(); }; });
      box.querySelectorAll('[data-venda]').forEach((b) => { b.onclick = () => detalheVenda(+b.dataset.venda, carregar).catch(erroTela); });
      box.querySelectorAll('[data-rec]').forEach((b) => {
        b.onclick = () => {
          const c = contas.find((x) => x.cliente_id === +b.dataset.rec);
          formReceberVendas(c.cliente_nome, vendas.filter((v) => v.cliente_id === c.cliente_id), carregar).catch(erroTela);
        };
      });
    }
    async function carregar() {
      [contas, vendas] = await Promise.all([api.clientesEmAberto(), api.vendasEmAberto()]);
      lista();
    }
    el.querySelector('[data-busca]').oninput = (e) => { estado.busca = e.target.value; lista(); };
    el.querySelector('[data-atraso]').onchange = (e) => { estado.atraso = e.target.value; lista(); };
    el.querySelector('[data-ordem]').onchange = (e) => { estado.ordem = e.target.value; lista(); };
    el.querySelector('[data-boleto]').onchange = (e) => { estado.boleto = e.target.value; lista(); };
    el.querySelector('[data-csv]').onclick = () => baixarCsv('contas-em-aberto.csv', ['Cliente', 'Telefone', 'Vendas', 'Saldo', 'Desde', 'Dias'],
      filtradas().map((c) => [c.cliente_nome, c.cliente_telefone, c.vendas, Number(c.saldo), dataBr(c.desde), c.dias]));
    await carregar();
  };

  function formCliente(c, aoSalvar) {
    const v = c || {};
    const d = janela({
      titulo: c ? 'Editar cliente' : 'Novo cliente',
      corpo: `<div class="form-grade">
        <label class="campo inteiro">Nome *<input data-c="nome" value="${esc(v.nome)}" maxlength="120"></label>
        <label class="campo">Telefone / WhatsApp<input data-c="telefone" inputmode="tel" value="${esc(v.telefone)}"></label>
        <label class="campo">Outro telefone<input data-c="telefone2" inputmode="tel" value="${esc(v.telefone2)}"></label>
        <label class="campo">CPF / CNPJ<input data-c="documento" value="${esc(v.documento)}"></label>
        <label class="campo">E-mail<input data-c="email" type="email" value="${esc(v.email)}"></label>
        <label class="campo inteiro">Endereço<input data-c="endereco" value="${esc(v.endereco)}"></label>
        <label class="campo">Bairro<input data-c="bairro" value="${esc(v.bairro)}"></label>
        <label class="campo">Cidade<input data-c="cidade" value="${esc(v.cidade)}"></label>
        <label class="campo inteiro">Observações<textarea data-c="observacoes">${esc(v.observacoes)}</textarea></label>
      </div>`,
      pe: `<button class="btn" data-v>Cancelar</button><button class="btn primario" data-s>Salvar cliente</button>`,
    });
    d.querySelector('[data-v]').onclick = d.fechar;
    d.querySelector('[data-s]').onclick = (e) => comTrava(e.target, async () => {
      const dados = {};
      d.querySelectorAll('[data-c]').forEach((i) => { dados[i.dataset.c] = i.value.trim() || null; });
      if (!dados.nome) throw new Error('Informe o nome do cliente.');
      if (!c) {
        const fone = (dados.telefone || '').replace(/\D/g, '');
        const ja = (await api.clientes()).find((x) => normalizar(x.nome) === normalizar(dados.nome) || (fone && (x.telefone || '').replace(/\D/g, '') === fone));
        if (ja && !await confirmar('Possível duplicado', `Já existe "${ja.nome}" com esse nome ou telefone. Cadastrar mesmo assim?`, 'Cadastrar')) return;
      }
      const salvo = await api.salvarCliente(c?.id, dados);
      d.fechar();
      aviso('Cliente salvo.');
      aoSalvar?.(salvo);
    });
  }

  telas.clientes = async (el, estado) => {
    estado.busca ??= '';
    el.innerHTML = `
      <div class="topo"><h1>Clientes</h1><div class="topo-acoes"><button class="btn" data-csv>Exportar</button><button class="btn primario" data-novo>Novo cliente</button></div></div>
      <div class="filtros"><label class="campo">Buscar<input data-busca placeholder="Nome, telefone ou cidade" value="${esc(estado.busca)}"></label></div>
      <div data-lista><div class="vazio">Carregando…</div></div>`;
    let clientes = [], saldos = new Map();
    const filtrados = () => clientes.filter((c) => !estado.busca || contem(`${c.nome} ${c.telefone || ''} ${c.cidade || ''} ${c.bairro || ''}`, estado.busca));
    function lista() {
      const f = filtrados(), box = el.querySelector('[data-lista]');
      box.innerHTML = `<div class="tabela-caixa">${f.length ? `<table class="responsiva"><thead><tr><th>Nome</th><th>Telefone</th><th>Cidade</th><th class="num">Em aberto</th></tr></thead><tbody>
        ${f.map((c) => `<tr class="clicavel" data-id="${c.id}"><td class="principal">${esc(c.nome)}</td><td data-r="Telefone">${esc(c.telefone)}</td><td data-r="Cidade">${esc(c.cidade)}</td><td class="num" data-r="Em aberto">${saldos.get(c.id) ? `<span class="selo perigo">${brl(saldos.get(c.id))}</span>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="vazio">${clientes.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</div>`}</div>`;
      box.querySelectorAll('[data-id]').forEach((tr) => { tr.onclick = () => { location.hash = `#/clientes/${tr.dataset.id}`; }; });
    }
    async function carregar() {
      const [cs, ab] = await Promise.all([api.clientes(), api.clientesEmAberto()]);
      clientes = cs; saldos = new Map(ab.map((a) => [a.cliente_id, a.saldo]));
      lista();
    }
    el.querySelector('[data-busca]').oninput = (e) => { estado.busca = e.target.value; lista(); };
    el.querySelector('[data-novo]').onclick = () => formCliente(null, carregar);
    el.querySelector('[data-csv]').onclick = () => baixarCsv('clientes.csv', ['Nome', 'Telefone', 'Outro telefone', 'CPF/CNPJ', 'E-mail', 'Endereço', 'Bairro', 'Cidade', 'Observações'],
      filtrados().map((c) => [c.nome, c.telefone, c.telefone2, c.documento, c.email, c.endereco, c.bairro, c.cidade, c.observacoes]));
    await carregar();
  };

  telas.cliente = async (el, _estado, id) => {
    const [c, vendas] = await Promise.all([api.cliente(id), api.vendasDoCliente(id)]);
    const saldo = vendas.reduce((s, v) => s + Number(v.saldo), 0);
    const total = vendas.reduce((s, v) => s + Number(v.total), 0);
    const zap = linkZap(c.telefone);
    const endereco = [c.endereco, c.bairro, c.cidade].filter(Boolean).join(', ');
    el.innerHTML = `
      <div class="topo"><div><a href="#/clientes" class="sub">← Clientes</a><h1>${esc(c.nome)}</h1>${c.ativo ? '' : '<span class="selo neutro">Arquivado</span>'}</div>
        <div class="topo-acoes">
          ${zap ? `<a class="btn" href="${esc(zap)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          <button class="btn" data-editar>Editar</button>
          ${pode('vendas_editar') ? `<button class="btn ${c.ativo ? 'perigo' : ''}" data-arquivar>${c.ativo ? 'Arquivar' : 'Reativar'}</button>` : ''}
          ${saldo > 0 ? '<button class="btn primario" data-rec>Receber</button>' : ''}
        </div></div>
      <div class="pilha">
        <div class="grade g4">
          <div class="cartao kpi ${saldo > 0 ? 'alerta' : ''}"><div class="rotulo">Em aberto</div><div class="valor">${brl(saldo)}</div></div>
          <div class="cartao kpi"><div class="rotulo">Total comprado</div><div class="valor">${brl(total)}</div></div>
          <div class="cartao kpi"><div class="rotulo">Vendas</div><div class="valor">${vendas.length}</div></div>
          <div class="cartao kpi"><div class="rotulo">Última compra</div><div class="valor">${vendas[0] ? dataBr(vendas[0].data) : '—'}</div></div>
        </div>
        <div class="cartao"><h2>Dados</h2><div class="linhas">
          ${[['Telefone', [c.telefone, c.telefone2].filter(Boolean).join(' / ')], ['CPF / CNPJ', c.documento], ['E-mail', c.email], ['Endereço', endereco]].filter(([, x]) => x).map(([r, x]) => `<div class="linha-conta"><span class="sub">${r}</span><span style="text-align:right">${esc(x)}</span></div>`).join('')}
          ${c.observacoes ? `<div><div class="sub">Observações</div><div style="white-space:pre-wrap">${esc(c.observacoes)}</div></div>` : ''}
        </div></div>
        <div><h2>Histórico de compras</h2><div class="tabela-caixa">${vendas.length ? `<table class="responsiva"><thead><tr><th>Data</th><th>Itens</th><th class="num">Total</th><th class="num">Saldo</th><th>Situação</th></tr></thead><tbody>
          ${vendas.map((v) => `<tr class="clicavel" data-id="${v.id}"><td class="principal"><span class="num-venda">nº ${v.id}</span> · ${dataBr(v.data)}</td><td data-r="Itens"><span class="sub">${esc(v.itens_resumo)}</span></td><td class="num" data-r="Total">${brl(v.total)}</td><td class="num" data-r="Saldo">${brl(v.saldo)}</td><td data-r="Situação">${seloVenda(v.situacao)} ${seloBoleto(v)}</td></tr>`).join('')}
        </tbody></table>` : '<div class="vazio">Nenhuma compra registrada.</div>'}</div></div>
      </div>`;
    el.querySelector('[data-editar]').onclick = () => formCliente(c, () => mostrar());
    const arquivar = el.querySelector('[data-arquivar]');
    if (arquivar) arquivar.onclick = (e) => comTrava(e.target, async () => {
      if (c.ativo && !await confirmar('Arquivar cliente', 'O cliente sai da lista, mas o histórico de compras é mantido.', 'Arquivar')) return;
      await api.salvarCliente(c.id, { ativo: !c.ativo }); mostrar();
    });
    const rec = el.querySelector('[data-rec]');
    if (rec) rec.onclick = () => formReceberVendas(c.nome, vendas.filter((v) => v.saldo > 0), () => mostrar()).catch(erroTela);
    el.querySelectorAll('[data-id]').forEach((tr) => { tr.onclick = () => detalheVenda(+tr.dataset.id, () => mostrar()).catch(erroTela); });
  };

  function formProduto(p, categorias, aoSalvar) {
    const v = p || { controla_estoque: true };
    const d = janela({
      titulo: p ? 'Editar produto' : 'Novo produto',
      corpo: `<div class="form-grade">
        <label class="campo inteiro">Nome *<input data-nome value="${esc(v.nome)}"></label>
        <label class="campo">Categoria<input data-cat list="lista-cat" value="${esc(v.categoria)}"><datalist id="lista-cat">${categorias.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="campo">Preço de venda<input data-preco inputmode="decimal" value="${paraCampo(v.preco_venda)}"></label>
        ${pode('custos') || !p ? `<label class="campo">${p ? 'Custo médio' : 'Custo inicial'}<input data-custo inputmode="decimal" value="${paraCampo(v.custo_medio)}"></label>` : ''}
        <label class="campo">Estoque mínimo<input data-min inputmode="numeric" value="${v.estoque_minimo ?? ''}"></label>
        ${p ? '' : '<label class="campo">Estoque inicial<input data-ini inputmode="numeric"></label>'}
        <label class="check inteiro"><input type="checkbox" data-ctrl ${v.controla_estoque ? 'checked' : ''}> Controla estoque (desmarque para serviços)</label>
        ${p ? `<p class="sub inteiro" style="margin:0">${pode('custos') ? 'O custo médio é recalculado a cada entrada. Alterar aqui registra uma correção manual. ' : ''}A quantidade muda em "Ajustar estoque".</p>` : ''}
      </div>`,
      pe: `<button class="btn" data-v>Cancelar</button><button class="btn primario" data-s>Salvar produto</button>`,
    });
    d.querySelector('[data-v]').onclick = d.fechar;
    d.querySelector('[data-s]').onclick = (e) => comTrava(e.target, async () => {
      const custoTxt = d.querySelector('[data-custo]')?.value.trim();
      await api.salvarProduto(p?.id ?? null, {
        nome: d.querySelector('[data-nome]').value, categoria: d.querySelector('[data-cat]').value,
        preco_venda: lerNumero(d.querySelector('[data-preco]').value),
        custo: custoTxt ? lerNumero(custoTxt) : null,
        estoque_minimo: parseInt(d.querySelector('[data-min]').value, 10) || 0,
        estoque_inicial: parseInt(d.querySelector('[data-ini]')?.value, 10) || 0,
        controla_estoque: d.querySelector('[data-ctrl]').checked,
      });
      d.fechar(); aviso('Produto salvo.'); aoSalvar?.();
    });
  }

  function detalheProduto(p, categorias, aoMudar) {
    const d = janela({
      titulo: p.nome,
      corpo: `<div class="pilha">
        <div class="grade g2">
          ${pode('custos') ? `<div class="cartao kpi"><div class="rotulo">Custo médio</div><div class="valor">${p.custo_medio === null ? '—' : brl(p.custo_medio)}</div></div>` : ''}
          <div class="cartao kpi"><div class="rotulo">Estoque</div><div class="valor">${p.controla_estoque ? p.estoque : 'Serviço'}</div></div>
        </div>
        ${pode('custos') ? '<div><h2>Histórico</h2><div data-hist class="sub">Carregando…</div></div>' : ''}
      </div>`,
      pe: pode('produtos') ? `<button class="btn perigo" data-arq>${p.ativo ? 'Arquivar' : 'Reativar'}</button>${p.controla_estoque ? '<button class="btn" data-aj>Ajustar estoque</button>' : ''}<button class="btn primario" data-ed>Editar</button>` : '',
    });
    const TIPOS = { inicial: 'Saldo inicial', entrada: 'Entrada', venda: 'Venda', ajuste: 'Ajuste', custo: 'Correção de custo' };
    if (pode('custos')) api.movimentos(p.id).then((ms) => {
      const box = d.querySelector('[data-hist]');
      if (!box) return;
      box.className = 'linhas';
      box.innerHTML = ms.map((m) => `<div class="linha-conta"><span>${dataBr(m.data)} · ${TIPOS[m.tipo]}${m.motivo ? `<span class="sub"> ${esc(m.motivo)}</span>` : ''}</span><span class="num">${m.quantidade ? (m.quantidade > 0 ? '+' : '') + m.quantidade : ''}${m.custo_unitario !== null ? ` <span class="sub">a ${brl(m.custo_unitario)}</span>` : ''}</span></div>`).join('') || 'Sem movimentos.';
    }).catch(erroTela);
    if (!pode('produtos')) return;
    d.querySelector('[data-ed]').onclick = () => { d.fechar(); formProduto(p, categorias, aoMudar); };
    d.querySelector('[data-arq]').onclick = (e) => comTrava(e.target, async () => {
      if (p.ativo && !await confirmar('Arquivar produto', 'O produto sai das listas e não aparece em novas vendas. O histórico é mantido.', 'Arquivar')) return;
      await api.definirProdutoAtivo(p.id, !p.ativo); d.fechar(); aoMudar?.();
    });
    const aj = d.querySelector('[data-aj]');
    if (aj) aj.onclick = () => {
      const f = janela({
        titulo: 'Ajustar estoque',
        corpo: `<div class="form-grade"><label class="campo">Quantidade real<input data-q inputmode="numeric" value="${p.estoque}"></label>
          <label class="campo">Motivo *<input data-m placeholder="Contagem, quebra, uso da loja…"></label></div>`,
        pe: '<button class="btn" data-v>Cancelar</button><button class="btn primario" data-s>Salvar ajuste</button>',
      });
      f.querySelector('[data-v]').onclick = f.fechar;
      f.querySelector('[data-s]').onclick = (e) => comTrava(e.target, async () => {
        const q = parseInt(f.querySelector('[data-q]').value, 10);
        if (Number.isNaN(q)) throw new Error('Informe a quantidade.');
        await api.ajustarEstoque(p.id, q, f.querySelector('[data-m]').value);
        f.fechar(); d.fechar(); aviso('Estoque ajustado.'); aoMudar?.();
      });
    };
  }

  telas.produtos = async (el, estado) => {
    estado.busca ??= ''; estado.cat ??= ''; estado.sit ??= '';
    el.innerHTML = `
      <div class="topo"><h1>Produtos</h1><div class="topo-acoes">${pode('custos') ? '<button class="btn" data-csv>Exportar</button>' : ''}${pode('produtos') ? '<button class="btn primario" data-novo>Novo produto</button>' : ''}</div></div>
      <div data-kpis class="grade g4" style="margin-bottom:14px"></div>
      <div class="filtros">
        <label class="campo">Buscar<input data-busca value="${esc(estado.busca)}"></label>
        <label class="campo">Categoria<select data-cat></select></label>
        <label class="campo">Situação<select data-sit>${opcoes({ '': 'Todas', com_estoque: 'Com estoque', pouco_estoque: 'Pouco estoque', sem_estoque: 'Sem estoque', servico: 'Serviços' }, estado.sit)}</select></label>
      </div>
      <div data-lista><div class="vazio">Carregando…</div></div>`;
    let produtos = [], categorias = [];
    const filtrados = () => produtos.filter((p) => (!estado.busca || contem(p.nome, estado.busca)) && (!estado.cat || p.categoria === estado.cat) && (!estado.sit || p.situacao === estado.sit));
    function lista() {
      const f = filtrados(), box = el.querySelector('[data-lista]'), m = pode('custos'), abre = m || pode('produtos');
      box.innerHTML = `<div class="tabela-caixa">${f.length ? `<table class="responsiva"><thead><tr><th>Produto</th><th>Categoria</th>${m ? '<th class="num">Custo médio</th>' : ''}<th class="num">Preço</th>${m ? '<th class="num">Margem</th>' : ''}<th>Estoque</th>${m ? '<th class="num">Patrimônio (custo)</th>' : ''}</tr></thead><tbody>
        ${f.map((p) => {
          const margem = p.preco_venda > 0 && p.custo_medio !== null ? ((p.preco_venda - p.custo_medio) / p.preco_venda * 100) : null;
          return `<tr ${abre ? `class="clicavel" data-id="${p.id}"` : ''}><td class="principal">${esc(p.nome)}</td><td data-r="Categoria">${esc(p.categoria)}</td>${m ? `<td class="num" data-r="Custo médio">${p.custo_medio === null ? '—' : brl(p.custo_medio)}</td>` : ''}<td class="num" data-r="Preço">${brl(p.preco_venda)}</td>${m ? `<td class="num" data-r="Margem">${margem === null ? '—' : numBr(margem, 0) + '%'}</td>` : ''}<td data-r="Estoque">${seloEstoque(p)}</td>${m ? `<td class="num" data-r="Patrimônio">${p.controla_estoque ? brl(p.patrimonio_custo) : '—'}</td>` : ''}</tr>`;
        }).join('')}
      </tbody></table>` : `<div class="vazio">${produtos.length ? 'Nenhum produto com esse filtro.' : 'Nenhum produto cadastrado ainda.'}</div>`}</div>`;
      box.querySelectorAll('[data-id]').forEach((tr) => { tr.onclick = () => detalheProduto(produtos.find((p) => p.id === +tr.dataset.id), categorias, carregar); });
    }
    async function carregar() {
      produtos = await api.produtos();
      categorias = [...new Set(produtos.map((p) => p.categoria).filter(Boolean))].sort();
      const fisicos = produtos.filter((p) => p.controla_estoque);
      const soma = (k) => fisicos.reduce((s, p) => s + Number(p[k]), 0);
      const baixos = produtos.filter((p) => ['pouco_estoque', 'sem_estoque'].includes(p.situacao)).length;
      el.querySelector('[data-kpis]').innerHTML = `
        <div class="cartao kpi"><div class="rotulo">Itens em estoque</div><div class="valor">${fisicos.reduce((s, p) => s + Math.max(p.estoque, 0), 0)}</div></div>
        ${pode('custos') ? `<div class="cartao kpi"><div class="rotulo">Patrimônio a custo</div><div class="valor">${brl(soma('patrimonio_custo'))}</div></div>
        <div class="cartao kpi"><div class="rotulo">Valor de venda</div><div class="valor">${brl(soma('patrimonio_venda'))}</div></div>` : ''}
        <div class="cartao kpi"><div class="rotulo">Abaixo do mínimo</div><div class="valor">${baixos}</div></div>`;
      const sel = el.querySelector('[data-cat]');
      sel.innerHTML = '<option value="">Todas</option>' + categorias.map((c) => `<option ${c === estado.cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
      lista();
    }
    el.querySelector('[data-busca]').oninput = (e) => { estado.busca = e.target.value; lista(); };
    el.querySelector('[data-cat]').onchange = (e) => { estado.cat = e.target.value; lista(); };
    el.querySelector('[data-sit]').onchange = (e) => { estado.sit = e.target.value; lista(); };
    const novoProd = el.querySelector('[data-novo]');
    if (novoProd) novoProd.onclick = () => formProduto(null, categorias, carregar);
    if (pode('custos')) {
      el.querySelector('[data-csv]').onclick = () => baixarCsv('produtos.csv', ['Produto', 'Categoria', 'Custo médio', 'Preço', 'Estoque', 'Mínimo', 'Patrimônio a custo'],
        filtrados().map((p) => [p.nome, p.categoria, Number(p.custo_medio || 0), Number(p.preco_venda), p.estoque, p.estoque_minimo, Number(p.patrimonio_custo)]));
    }
    await carregar();
  };

  async function formCompra(id, aoSalvar) {
    const [produtos, fornecedores, contas] = await Promise.all([api.produtos(true), api.fornecedores(), api.contas()]);
    const compra = id ? await api.compra(id) : null;
    const itensIni = id ? await api.itensDaCompra(id) : [];
    let fornecedor = compra?.fornecedor_id ? fornecedores.find((f) => f.id === compra.fornecedor_id) || null : null;
    const d = janela({
      titulo: id ? `Editar compra nº ${id}` : 'Nova compra (entrada de estoque)',
      corpo: `<div class="pilha">
        <div class="form-grade">
          <label class="campo inteiro">Fornecedor (opcional)<div data-forn></div></label>
          <label class="campo">Data<input type="date" data-data value="${compra?.data || hoje()}"></label>
          <label class="campo">Forma de pagamento<select data-forma>${opcoes(FORMAS_COMPRA, compra?.forma_pagamento || 'pix')}</select></label>
          <label class="campo inteiro">Saiu de qual conta<select data-conta>${opcoesConta(contas, compra?.conta_id ?? null, 'Ainda não paga / não controlar')}</select></label>
          <label class="campo inteiro">Descrição (opcional)<input data-desc value="${esc(compra?.descricao)}" placeholder="Número da nota, observações"></label>
        </div>
        <div><h2>Itens</h2><div data-itens></div><button type="button" class="btn" data-add style="width:100%">Adicionar item</button></div>
        <label class="campo">Desconto da compra (R$)<input data-desconto inputmode="decimal" value="${compra?.desconto > 0 ? paraCampo(compra.desconto) : ''}"></label>
        <div class="totais"><div class="linha-conta grande"><span>Total</span><span data-total></span></div></div>
        <p class="sub" style="margin:0">Ao salvar, o estoque aumenta e o custo médio de cada produto é recalculado.</p>
      </div>`,
      pe: `<button class="btn" data-voltar>Cancelar</button><button class="btn primario" data-salvar>${id ? 'Salvar alterações' : 'Salvar compra'}</button>`,
    });
    combo(d.querySelector('[data-forn]'), { itens: fornecedores, valor: fornecedor?.nome || '', marcador: 'Buscar fornecedor', rotulo: (f) => f.nome, aoEscolher: (f) => { fornecedor = f; } });
    const recalcular = () => { d.querySelector('[data-total]').textContent = brl(Math.max(editor.subtotal() - lerNumero(d.querySelector('[data-desconto]').value), 0)); };
    // Na edição o estoque já inclui esta compra, então a prévia do custo ficaria errada.
    const editor = editorDeItens(d.querySelector('[data-itens]'), { produtos, tipo: 'compra', itensIniciais: itensIni, semPrevia: !!id, aoMudar: () => recalcular() });
    d.querySelector('[data-add]').onclick = () => editor.adicionar();
    d.querySelector('[data-desconto]').oninput = recalcular;
    if (!id) editor.adicionar();
    recalcular();
    d.querySelector('[data-voltar]').onclick = d.fechar;
    d.querySelector('[data-salvar]').onclick = (e) => comTrava(e.target, async () => {
      await api.salvarCompra(id, {
        fornecedor_id: fornecedor?.id ?? null, data: d.querySelector('[data-data]').value || hoje(),
        forma: d.querySelector('[data-forma]').value, descricao: d.querySelector('[data-desc]').value,
        desconto: lerNumero(d.querySelector('[data-desconto]').value), itens: editor.coletar(),
        conta_id: +d.querySelector('[data-conta]').value || null,
      });
      d.fechar(); aviso('Compra salva. Estoque e custo atualizados.'); aoSalvar?.();
    });
  }

  function formFornecedor(f, aoSalvar) {
    const v = f || {};
    const d = janela({
      titulo: f ? 'Editar fornecedor' : 'Novo fornecedor',
      corpo: `<div class="form-grade">
        <label class="campo inteiro">Nome *<input data-c="nome" value="${esc(v.nome)}"></label>
        <label class="campo">Telefone<input data-c="telefone" value="${esc(v.telefone)}"></label>
        <label class="campo">CNPJ<input data-c="documento" value="${esc(v.documento)}"></label>
        <label class="campo inteiro">Observações<textarea data-c="observacoes">${esc(v.observacoes)}</textarea></label>
      </div>`,
      pe: `${f ? '<button class="btn perigo" data-a>Arquivar</button>' : ''}<button class="btn" data-v>Cancelar</button><button class="btn primario" data-s>Salvar fornecedor</button>`,
    });
    d.querySelector('[data-v]').onclick = d.fechar;
    const arq = d.querySelector('[data-a]');
    if (arq) arq.onclick = (e) => comTrava(e.target, async () => { await api.salvarFornecedor(f.id, { ativo: false }); d.fechar(); aoSalvar?.(); });
    d.querySelector('[data-s]').onclick = (e) => comTrava(e.target, async () => {
      const dados = {};
      d.querySelectorAll('[data-c]').forEach((i) => { dados[i.dataset.c] = i.value.trim() || null; });
      if (!dados.nome) throw new Error('Informe o nome do fornecedor.');
      await api.salvarFornecedor(f?.id, dados);
      d.fechar(); aviso('Fornecedor salvo.'); aoSalvar?.();
    });
  }

  telas.compras = async (el, estado) => {
    estado.aba ??= 'compras'; estado.ano ??= mesAtual().slice(0, 4);
    el.innerHTML = `
      <div class="topo"><h1>Compras</h1><div class="topo-acoes"><button class="btn primario" data-novo></button></div></div>
      <div class="abas"><button class="aba" data-aba="compras">Entradas de estoque</button><button class="aba" data-aba="fornecedores">Fornecedores</button></div>
      <div data-corpo></div>`;
    const corpo = el.querySelector('[data-corpo]');
    const novo = el.querySelector('[data-novo]');

    async function compras() {
      corpo.innerHTML = `<div class="filtros"><label class="campo">Ano<input data-ano inputmode="numeric" value="${estado.ano}"></label></div><div data-lista><div class="vazio">Carregando…</div></div>`;
      corpo.querySelector('[data-ano]').onchange = (e) => { estado.ano = e.target.value; carregarCompras().catch(erroTela); };
      await carregarCompras();
    }
    async function carregarCompras() {
      const lista = await api.compras(`${estado.ano}-01-01`, `${estado.ano}-12-31`);
      const box = corpo.querySelector('[data-lista]');
      box.innerHTML = `<div class="tabela-caixa">${lista.length ? `<table class="responsiva"><thead><tr><th>Fornecedor</th><th>Data</th><th>Itens</th><th>Pagamento</th><th class="num">Total</th></tr></thead><tbody>
        ${lista.map((c) => `<tr class="clicavel" data-id="${c.id}"><td class="principal">${esc(c.fornecedor_nome || 'Sem fornecedor')}${c.descricao ? `<div class="sub">${esc(c.descricao)}</div>` : ''}</td><td data-r="Data">${dataBr(c.data)}</td><td data-r="Itens"><span class="sub">${esc(c.itens_resumo)}</span></td><td data-r="Pagamento">${esc(FORMAS_COMPRA[c.forma_pagamento])}</td><td class="num" data-r="Total">${brl(c.total)}</td></tr>`).join('')}
      </tbody></table>` : '<div class="vazio">Nenhuma compra neste ano.</div>'}</div>`;
      box.querySelectorAll('[data-id]').forEach((tr) => {
        tr.onclick = () => {
          const c = lista.find((x) => x.id === +tr.dataset.id);
          const d = janela({
            titulo: `Compra nº ${c.id}`,
            corpo: `<div class="pilha"><div><strong>${esc(c.fornecedor_nome || 'Sem fornecedor')}</strong><div class="sub">${dataBr(c.data)} · ${esc(FORMAS_COMPRA[c.forma_pagamento])}</div></div><div>${esc(c.itens_resumo)}</div><div class="linha-conta grande"><span>Total</span><strong>${brl(c.total)}</strong></div></div>`,
            pe: '<button class="btn perigo" data-x>Excluir compra</button><button class="btn primario" data-e>Editar</button>',
          });
          d.querySelector('[data-e]').onclick = () => { d.fechar(); formCompra(c.id, carregarCompras).catch(erroTela); };
          d.querySelector('[data-x]').onclick = (e) => comTrava(e.target, async () => {
            if (!await confirmar('Excluir compra', 'O estoque e o custo médio dos produtos serão recalculados sem esta compra.', 'Excluir')) return;
            await api.excluirCompra(c.id); d.fechar(); aviso('Compra excluída.'); carregarCompras().catch(erroTela);
          });
        };
      });
    }
    async function fornecedores() {
      const lista = await api.fornecedores();
      corpo.innerHTML = `<div class="tabela-caixa">${lista.length ? `<table class="responsiva"><thead><tr><th>Nome</th><th>Telefone</th><th>CNPJ</th></tr></thead><tbody>
        ${lista.map((f) => `<tr class="clicavel" data-id="${f.id}"><td class="principal">${esc(f.nome)}</td><td data-r="Telefone">${esc(f.telefone)}</td><td data-r="CNPJ">${esc(f.documento)}</td></tr>`).join('')}
      </tbody></table>` : '<div class="vazio">Nenhum fornecedor cadastrado.</div>'}</div>`;
      corpo.querySelectorAll('[data-id]').forEach((tr) => { tr.onclick = () => formFornecedor(lista.find((x) => x.id === +tr.dataset.id), () => fornecedores().catch(erroTela)); });
    }
    async function abrir() {
      el.querySelectorAll('[data-aba]').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === estado.aba));
      novo.textContent = estado.aba === 'compras' ? 'Nova compra' : 'Novo fornecedor';
      novo.onclick = estado.aba === 'compras'
        ? () => formCompra(null, carregarCompras).catch(erroTela)
        : () => formFornecedor(null, () => fornecedores().catch(erroTela));
      await (estado.aba === 'compras' ? compras() : fornecedores());
    }
    el.querySelectorAll('[data-aba]').forEach((b) => { b.onclick = () => { estado.aba = b.dataset.aba; abrir().catch(erroTela); }; });
    await abrir();
  };

  // ---------- Contas ----------
  const CATEGORIAS = ['Energia elétrica', 'Água', 'Internet', 'Telefone', 'Aluguel', 'Salários', 'Imposto de NF', 'Impostos', 'Contador', 'Frete', 'Manutenção', 'Retirada', 'Outros'];

  function formConta(c, aoSalvar) {
    const v = c || { tipo: 'banco', saldo_inicial: 0, ativo: true };
    const d = janela({
      titulo: c ? 'Editar conta' : 'Nova conta',
      corpo: `<div class="form-grade">
        <label class="campo inteiro">Nome *<input data-nome value="${esc(v.nome)}" placeholder="Sicoob, Inter, Caixa da loja…"></label>
        <label class="campo">Tipo<select data-tipo>${opcoes({ banco: 'Banco', dinheiro: 'Dinheiro em espécie' }, v.tipo)}</select></label>
        <label class="campo">Saldo inicial<input data-saldo inputmode="decimal" value="${paraCampo(v.saldo_inicial)}"></label>
        <label class="campo">Data de início<input type="date" data-inicio value="${v.data_inicio || ''}"></label>
        <p class="sub inteiro" style="margin:0">O saldo passa a ser o saldo inicial mais o que entrar e sair a partir da data de início. O que veio antes continua nas vendas e nos relatórios, mas não mexe no saldo. Para reiniciar a conta, informe o saldo do banco no dia e essa data. Sem data, todos os movimentos contam.</p>
        ${c ? `<label class="check inteiro"><input type="checkbox" data-ativa ${v.ativo ? 'checked' : ''}> Conta em uso</label>` : ''}
      </div>`,
      pe: '<button class="btn" data-v>Cancelar</button><button class="btn primario" data-s>Salvar conta</button>',
    });
    d.querySelector('[data-v]').onclick = d.fechar;
    d.querySelector('[data-s]').onclick = (e) => comTrava(e.target, async () => {
      await api.salvarConta(c?.id ?? null, {
        nome: d.querySelector('[data-nome]').value, tipo: d.querySelector('[data-tipo]').value,
        saldo_inicial: lerNumero(d.querySelector('[data-saldo]').value), ativo: d.querySelector('[data-ativa]')?.checked ?? true,
        data_inicio: d.querySelector('[data-inicio]').value || null,
      });
      d.fechar(); aviso('Conta salva.'); aoSalvar?.();
    });
  }

  function formLancamento({ tipo, contas, contaId, lanc, aoSalvar }) {
    const v = lanc || {};
    const saida = (lanc?.tipo || tipo) === 'saida';
    const d = janela({
      titulo: lanc ? 'Editar lançamento' : (saida ? 'Nova saída' : 'Nova entrada'),
      corpo: `<div class="form-grade">
        <label class="campo">Conta *<select data-conta>${opcoesConta(contas, v.conta_id ?? contaId ?? null)}</select></label>
        <label class="campo">Data<input type="date" data-data value="${v.data || hoje()}"></label>
        <label class="campo">Categoria<input data-cat list="lista-desp" value="${esc(v.categoria)}" placeholder="Energia elétrica"><datalist id="lista-desp">${CATEGORIAS.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="campo">Valor *<input data-valor inputmode="decimal" value="${paraCampo(v.valor)}"></label>
        <label class="campo inteiro">Descrição<input data-desc value="${esc(v.descricao)}" placeholder="Conta de outubro"></label>
      </div>`,
      pe: `${lanc ? '<button class="btn perigo" data-x>Excluir</button>' : ''}<button class="btn" data-v>Cancelar</button><button class="btn primario" data-s>Salvar</button>`,
    });
    d.querySelector('[data-v]').onclick = d.fechar;
    const x = d.querySelector('[data-x]');
    if (x) x.onclick = (e) => comTrava(e.target, async () => {
      if (!await confirmar('Excluir lançamento', 'O saldo da conta será recalculado.', 'Excluir')) return;
      await api.excluirLancamento(lanc.id); d.fechar(); aoSalvar?.();
    });
    d.querySelector('[data-s]').onclick = (e) => comTrava(e.target, async () => {
      await api.salvarLancamento(lanc?.id ?? null, {
        conta_id: +d.querySelector('[data-conta]').value || null, data: d.querySelector('[data-data]').value || hoje(),
        tipo: lanc?.tipo || tipo, categoria: d.querySelector('[data-cat]').value,
        descricao: d.querySelector('[data-desc]').value, valor: lerNumero(d.querySelector('[data-valor]').value),
      });
      d.fechar(); aviso('Lançamento salvo.'); aoSalvar?.();
    });
  }

  function formTransferencia(contas, aoSalvar) {
    const d = janela({
      titulo: 'Transferir entre contas',
      corpo: `<div class="form-grade">
        <label class="campo">De<select data-de>${opcoesConta(contas)}</select></label>
        <label class="campo">Para<select data-para>${opcoesConta(contas)}</select></label>
        <label class="campo">Data<input type="date" data-data value="${hoje()}"></label>
        <label class="campo">Valor<input data-valor inputmode="decimal"></label>
        <label class="campo inteiro">Descrição<input data-desc placeholder="Depósito do caixa no banco"></label>
      </div>`,
      pe: '<button class="btn" data-v>Cancelar</button><button class="btn primario" data-s>Transferir</button>',
    });
    d.querySelector('[data-v]').onclick = d.fechar;
    d.querySelector('[data-s]').onclick = (e) => comTrava(e.target, async () => {
      await api.transferir(+d.querySelector('[data-de]').value || null, +d.querySelector('[data-para]').value || null,
        d.querySelector('[data-data]').value || hoje(), lerNumero(d.querySelector('[data-valor]').value), d.querySelector('[data-desc]').value);
      d.fechar(); aviso('Transferência feita.'); aoSalvar?.();
    });
  }

  telas.contas = async (el) => {
    el.innerHTML = `
      <div class="topo"><h1>Contas</h1><div class="topo-acoes">
        <button class="btn" data-transf>Transferir</button><button class="btn" data-ent>Nova entrada</button>
        <button class="btn" data-sai>Nova saída</button><button class="btn primario" data-nova>Nova conta</button>
      </div></div><div data-lista><div class="vazio">Carregando…</div></div>`;
    let contas = [];
    async function carregar() {
      contas = await api.saldosDasContas();
      const ativas = contas.filter((c) => c.ativo);
      const total = ativas.reduce((s, c) => s + Number(c.saldo), 0);
      const box = el.querySelector('[data-lista]');
      box.innerHTML = `<div class="cartao kpi" style="margin-bottom:12px"><div class="rotulo">Saldo total</div><div class="valor">${brl(total)}</div></div>
      <div class="tabela-caixa">${contas.length ? `<table class="responsiva"><thead><tr><th>Conta</th><th class="num">Saldo</th><th class="num">Saldo conferido</th><th>Conciliação</th><th></th></tr></thead><tbody>
        ${contas.map((c) => `<tr class="clicavel" data-id="${c.id}"><td class="principal">${esc(c.nome)}${c.ativo ? '' : ' <span class="selo neutro">Fora de uso</span>'}${c.data_inicio ? `<div class="sub">Saldo a partir de ${dataBr(c.data_inicio)}</div>` : ''}</td><td class="num" data-r="Saldo">${brl(c.saldo)}</td><td class="num" data-r="Conferido">${brl(c.saldo_conferido)}</td><td data-r="Conciliação">${c.pendentes ? `<span class="selo alerta">${c.pendentes} a conferir</span>` : '<span class="selo ok">Em dia</span>'}</td><td data-r=""><button class="btn pequeno" data-ed="${c.id}">Editar</button></td></tr>`).join('')}
      </tbody></table>` : '<div class="vazio">Nenhuma conta criada ainda.</div>'}</div>`;
      box.querySelectorAll('[data-id]').forEach((tr) => { tr.onclick = () => { location.hash = `#/contas/${tr.dataset.id}`; }; });
      box.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); formConta(contas.find((c) => c.id === +b.dataset.ed), carregar); }; });
    }
    el.querySelector('[data-nova]').onclick = () => formConta(null, carregar);
    el.querySelector('[data-sai]').onclick = () => formLancamento({ tipo: 'saida', contas, aoSalvar: carregar });
    el.querySelector('[data-ent]').onclick = () => formLancamento({ tipo: 'entrada', contas, aoSalvar: carregar });
    el.querySelector('[data-transf]').onclick = () => formTransferencia(contas, carregar);
    await carregar();
  };

  telas.conta = async (el, estado, id) => {
    estado.mes ??= mesAtual();
    el.innerHTML = '<div data-corpo><div class="vazio">Carregando…</div></div>';
    const corpo = el.querySelector('[data-corpo]');
    async function carregar() {
      const de = `${estado.mes}-01`, ate = fimDoMes(estado.mes);
      const [contas, linhas, anterior] = await Promise.all([api.saldosDasContas(), api.extrato(id, de, ate), api.saldoAntes(id, de)]);
      const conta = contas.find((c) => c.id === id);
      if (!conta) throw new Error('Conta não encontrada.');
      let corrente = Number(anterior);
      const antesDoInicio = (l) => conta.data_inicio && l.data < conta.data_inicio;
      const comSaldo = linhas.map((l) => {
        if (antesDoInicio(l)) return { ...l, corrente: null, antes: true };
        corrente += Number(l.entrada) - Number(l.saida);
        return { ...l, corrente };
      });
      corpo.innerHTML = `
        <div class="topo"><div><a href="#/contas" class="sub">← Contas</a><h1>${esc(conta.nome)}</h1></div>
          <div class="topo-acoes"><button class="btn" data-ent>Nova entrada</button><button class="btn primario" data-sai>Nova saída</button></div></div>
        <div class="grade g4" style="margin-bottom:14px">
          <div class="cartao kpi"><div class="rotulo">Saldo atual</div><div class="valor">${brl(conta.saldo)}</div></div>
          <div class="cartao kpi"><div class="rotulo">Saldo conferido</div><div class="valor">${brl(conta.saldo_conferido)}</div></div>
          <label class="cartao kpi campo"><span class="rotulo">Saldo no extrato do banco</span><input data-banco inputmode="decimal" placeholder="Digite para comparar" value="${esc(estado.banco || '')}"></label>
          <div class="cartao kpi"><div class="rotulo">Diferença</div><div class="valor" data-dif>—</div></div>
        </div>
        <div class="filtros"><label class="campo">Mês<input type="month" data-mes value="${estado.mes}"></label></div>
        <p class="sub" style="margin:0 0 8px">Saldo anterior: ${brl(anterior)}. Marque cada linha que encontrar no extrato do banco.${conta.data_inicio ? ` Saldo contado a partir de ${dataBr(conta.data_inicio)}; o que vem antes aparece riscado.` : ''}</p>
        <div class="tabela-caixa">${comSaldo.length ? `<table class="responsiva"><thead><tr><th>Conferido</th><th>Data</th><th>Descrição</th><th class="num">Entrada</th><th class="num">Saída</th><th class="num">Saldo</th></tr></thead><tbody>
          ${comSaldo.map((l) => `<tr data-linha="${esc(l.origem)}:${l.id}"${l.antes ? ' class="antes-inicio"' : ''}><td data-r="Conferido">${l.antes ? '<span class="sub">Antes do início</span>' : `<input type="checkbox" class="confere" style="width:20px;min-height:20px;height:20px" aria-label="Conferido" ${l.conferido ? 'checked' : ''}>`}</td><td class="principal">${dataBr(l.data)}</td><td data-r="Descrição"><span ${l.origem === 'lancamento' ? 'class="link" data-ver' : ''}>${esc(l.descricao)}</span> <span class="sub">${esc(l.categoria)}</span></td><td class="num" data-r="Entrada">${l.entrada ? brl(l.entrada) : ''}</td><td class="num" data-r="Saída">${l.saida ? brl(l.saida) : ''}</td><td class="num" data-r="Saldo">${l.antes ? '—' : brl(l.corrente)}</td></tr>`).join('')}
        </tbody></table>` : '<div class="vazio">Nenhum movimento neste mês.</div>'}</div>`;
      const dif = () => {
        const txt = corpo.querySelector('[data-banco]').value.trim(), alvo = corpo.querySelector('[data-dif]');
        estado.banco = txt;
        if (!txt) { alvo.textContent = '—'; return; }
        const d = arred(lerNumero(txt) - Number(conta.saldo_conferido));
        alvo.textContent = brl(d);
        alvo.style.color = d === 0 ? 'var(--ok)' : 'var(--perigo)';
      };
      corpo.querySelector('[data-banco]').oninput = dif;
      dif();
      corpo.querySelector('[data-mes]').onchange = (e) => { if (e.target.value) { estado.mes = e.target.value; carregar().catch(erroTela); } };
      corpo.querySelector('[data-sai]').onclick = () => formLancamento({ tipo: 'saida', contas, contaId: id, aoSalvar: carregar });
      corpo.querySelector('[data-ent]').onclick = () => formLancamento({ tipo: 'entrada', contas, contaId: id, aoSalvar: carregar });
      corpo.querySelectorAll('.confere').forEach((c) => {
        c.onchange = async () => {
          const [origem, lid] = c.closest('tr').dataset.linha.split(':');
          try { await api.marcarConferido(origem, +lid, c.checked); await carregar(); } catch (e) { c.checked = !c.checked; erroTela(e); }
        };
      });
      corpo.querySelectorAll('[data-ver]').forEach((b) => {
        b.onclick = async () => {
          try {
            const lid = +b.closest('tr').dataset.linha.split(':')[1];
            const lanc = await api.lancamento(lid);
            if (lanc.transferencia_id) {
              if (await confirmar('Transferência', 'Transferências não são editadas. Deseja excluir os dois lados desta transferência?', 'Excluir')) { await api.excluirLancamento(lid); await carregar(); }
              return;
            }
            formLancamento({ lanc, contas, aoSalvar: carregar });
          } catch (e) { erroTela(e); }
        };
      });
    }
    await carregar();
  };

  // ---------- Usuários ----------
  const PERMISSOES = [
    ['custos', 'Ver custo, margem e patrimônio dos produtos'],
    ['relatorios', 'Ver relatórios, lucro e resultado'],
    ['contas', 'Contas, saldos, saídas e conciliação'],
    ['compras', 'Compras e fornecedores'],
    ['produtos', 'Criar e editar produtos, ajustar estoque'],
    ['vendas_editar', 'Editar e excluir vendas e pagamentos, arquivar clientes'],
  ];
  const TODAS = PERMISSOES.map(([k]) => k);
  const PERFIS = { funcionario: 'Funcionário', socio: 'Sócio', master: 'Master (acesso total e gestão de usuários)', custom: 'Personalizado' };

  function perfilDe(u) {
    if (u.papel === 'master') return 'master';
    if (!u.permissoes.length) return 'funcionario';
    return TODAS.every((p) => u.permissoes.includes(p)) ? 'socio' : 'custom';
  }
  const rotuloPerfil = (u) => (perfilDe(u) === 'master' ? 'Master' : PERFIS[perfilDe(u)]);

  function formUsuario(u, aoSalvar) {
    const novo = !u;
    const v = u || { papel: 'membro', permissoes: [], ativo: true };
    const euMesmo = !novo && u.eu;
    const d = janela({
      titulo: novo ? 'Novo usuário' : 'Editar usuário',
      corpo: `<div class="pilha">
        <div class="form-grade">
          <label class="campo">Nome *<input data-nome value="${esc(v.nome)}"></label>
          ${novo ? `<label class="campo">E-mail *<input data-email type="email" autocomplete="off"></label>
          <label class="campo inteiro">Senha inicial * (mínimo 8 caracteres)<input data-senha type="text" autocomplete="off"></label>`
            : `<label class="campo">E-mail<input value="${esc(v.email)}" disabled></label>`}
          <label class="campo inteiro">Perfil<select data-perfil ${euMesmo ? 'disabled' : ''}>${opcoes(PERFIS, perfilDe(v))}</select></label>
        </div>
        <div data-perms>
          <h2>O que esta pessoa pode fazer</h2>
          <p class="sub" style="margin:0 0 8px">Todos lançam vendas, recebem pagamentos, cadastram clientes e consultam estoque e preços.</p>
          <div class="pilha" style="gap:8px">${PERMISSOES.map(([k, r]) => `<label class="check"><input type="checkbox" data-p="${k}" ${v.permissoes.includes(k) ? 'checked' : ''}> ${esc(r)}</label>`).join('')}</div>
        </div>
        ${novo ? '' : `<label class="check"><input type="checkbox" data-ativo ${v.ativo ? 'checked' : ''} ${euMesmo ? 'disabled' : ''}> Acesso ativo</label>`}
        ${euMesmo ? '<p class="sub" style="margin:0">Você não pode remover o seu próprio acesso master.</p>' : ''}
        ${novo ? '' : '<div><button type="button" class="btn" data-troca>Definir nova senha</button></div>'}
      </div>`,
      pe: `<button class="btn" data-v>Cancelar</button><button class="btn primario" data-s>${novo ? 'Criar usuário' : 'Salvar'}</button>`,
    });
    const perfil = d.querySelector('[data-perfil]');
    const caixas = [...d.querySelectorAll('[data-p]')];
    const aplicarPerfil = () => {
      const f = perfil.value;
      d.querySelector('[data-perms]').hidden = f === 'master';
      if (f === 'socio') caixas.forEach((c) => { c.checked = true; });
      if (f === 'funcionario') caixas.forEach((c) => { c.checked = false; });
    };
    perfil.onchange = aplicarPerfil;
    caixas.forEach((c) => {
      c.onchange = () => {
        const marcadas = caixas.filter((x) => x.checked).length;
        perfil.value = marcadas === 0 ? 'funcionario' : marcadas === caixas.length ? 'socio' : 'custom';
      };
    });
    aplicarPerfil();
    d.querySelector('[data-v]').onclick = d.fechar;
    const troca = d.querySelector('[data-troca]');
    if (troca) troca.onclick = () => {
      const f = janela({
        titulo: `Nova senha de ${v.nome}`,
        corpo: '<label class="campo">Nova senha (mínimo 8 caracteres)<input data-nova type="text" autocomplete="off"></label>',
        pe: '<button class="btn" data-v>Cancelar</button><button class="btn primario" data-s>Salvar senha</button>',
      });
      f.querySelector('[data-v]').onclick = f.fechar;
      f.querySelector('[data-s]').onclick = (e) => comTrava(e.target, async () => {
        await api.trocarSenhaUsuario(u.user_id, f.querySelector('[data-nova]').value);
        f.fechar(); aviso('Senha alterada.');
      });
    };
    d.querySelector('[data-s]').onclick = (e) => comTrava(e.target, async () => {
      const papelNovo = perfil.value === 'master' ? 'master' : 'membro';
      const permissoes = papelNovo === 'master' ? [] : caixas.filter((c) => c.checked).map((c) => c.dataset.p);
      const nome = d.querySelector('[data-nome]').value;
      if (novo) {
        await api.criarUsuario({ nome, email: d.querySelector('[data-email]').value, senha: d.querySelector('[data-senha]').value, papel: papelNovo, permissoes });
      } else {
        await api.atualizarUsuario({ user_id: u.user_id, nome, papel: papelNovo, permissoes, ativo: d.querySelector('[data-ativo]').checked });
      }
      d.fechar(); aviso(novo ? 'Usuário criado.' : 'Usuário atualizado.'); aoSalvar?.();
    });
  }

  telas.usuarios = async (el) => {
    el.innerHTML = `<div class="topo"><h1>Usuários</h1><div class="topo-acoes"><button class="btn primario" data-novo>Novo usuário</button></div></div>
      <div data-lista><div class="vazio">Carregando…</div></div>`;
    async function carregar() {
      const lista = await api.usuarios();
      lista.forEach((u) => { u.eu = u.email === acesso.email; });
      const box = el.querySelector('[data-lista]');
      box.innerHTML = `<div class="tabela-caixa"><table class="responsiva"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Último acesso</th></tr></thead><tbody>
        ${lista.map((u) => `<tr class="clicavel" data-id="${esc(u.user_id)}"><td class="principal">${esc(u.nome)}${u.eu ? ' <span class="sub">(você)</span>' : ''}</td><td data-r="E-mail">${esc(u.email)}</td><td data-r="Perfil">${esc(rotuloPerfil(u))}</td><td data-r="Situação">${u.ativo ? '<span class="selo ok">Ativo</span>' : '<span class="selo neutro">Bloqueado</span>'}</td><td data-r="Último acesso">${u.ultimo_acesso ? dataBr(u.ultimo_acesso) : '—'}</td></tr>`).join('')}
      </tbody></table></div>`;
      box.querySelectorAll('[data-id]').forEach((tr) => { tr.onclick = () => formUsuario(lista.find((u) => u.user_id === tr.dataset.id), carregar); });
    }
    el.querySelector('[data-novo]').onclick = () => formUsuario(null, carregar);
    await carregar();
  };

  telas.relatorios = async (el, estado) => {
    estado.aba ??= 'mensal'; estado.ano ??= +mesAtual().slice(0, 4);
    estado.de ??= `${mesAtual()}-01`; estado.ate ??= hoje(); estado.quitadas ??= false;
    el.innerHTML = `
      <div class="topo"><h1>Relatórios</h1><div class="topo-acoes nao-imprimir"><button class="btn" data-csv>Exportar</button><button class="btn" data-imp>Imprimir</button></div></div>
      <div class="abas nao-imprimir">
        <button class="aba" data-aba="mensal">Mensal</button><button class="aba" data-aba="produtos">Por produto</button>
        <button class="aba" data-aba="clientes">Por cliente</button><button class="aba" data-aba="formas">Recebimentos</button><button class="aba" data-aba="despesas">Despesas</button><button class="aba" data-aba="nf">Notas fiscais</button>
      </div>
      <div class="filtros nao-imprimir" data-filtros></div>
      <div data-corpo><div class="vazio">Carregando…</div></div>`;
    const filtros = el.querySelector('[data-filtros]'), corpo = el.querySelector('[data-corpo]');
    let exportar = () => {};

    function barraFiltros() {
      if (estado.aba === 'mensal') {
        filtros.innerHTML = `<label class="campo">Ano<input data-ano inputmode="numeric" value="${estado.ano}"></label>`;
        filtros.querySelector('[data-ano]').onchange = (e) => { estado.ano = +e.target.value || estado.ano; dados().catch(erroTela); };
        return;
      }
      filtros.innerHTML = `<label class="campo">De<input type="date" data-de value="${estado.de}"></label>
        <label class="campo">Até<input type="date" data-ate value="${estado.ate}"></label>
        <div class="topo-acoes"><button class="btn pequeno" data-p="mes">Este mês</button><button class="btn pequeno" data-p="ant">Mês passado</button><button class="btn pequeno" data-p="ano">Este ano</button></div>
        ${estado.aba === 'produtos' ? `<label class="check"><input type="checkbox" data-q ${estado.quitadas ? 'checked' : ''}> Só vendas quitadas</label>` : ''}`;
      filtros.querySelector('[data-de]').onchange = (e) => { estado.de = e.target.value; dados().catch(erroTela); };
      filtros.querySelector('[data-ate]').onchange = (e) => { estado.ate = e.target.value; dados().catch(erroTela); };
      const q = filtros.querySelector('[data-q]');
      if (q) q.onchange = (e) => { estado.quitadas = e.target.checked; dados().catch(erroTela); };
      filtros.querySelectorAll('[data-p]').forEach((b) => {
        b.onclick = () => {
          const m = mesAtual(), [a, n] = m.split('-').map(Number);
          if (b.dataset.p === 'mes') { estado.de = `${m}-01`; estado.ate = hoje(); }
          if (b.dataset.p === 'ano') { estado.de = `${a}-01-01`; estado.ate = hoje(); }
          if (b.dataset.p === 'ant') { const p = isoLocal(new Date(a, n - 2, 1)); estado.de = p; estado.ate = fimDoMes(p.slice(0, 7)); }
          barraFiltros(); dados().catch(erroTela);
        };
      });
    }

    const tabela = (cab, linhas, rodape) => `<div class="tabela-caixa"><table class="responsiva"><thead><tr>${cab}</tr></thead><tbody>${linhas}</tbody>${rodape ? `<tfoot><tr>${rodape}</tr></tfoot>` : ''}</table></div>`;
    const somar = (l, k) => l.reduce((s, x) => s + Number(x[k] || 0), 0);

    async function dados() {
      if (estado.aba === 'mensal') {
        const r = await api.relMensal(estado.ano);
        corpo.innerHTML = `<h2>${estado.ano}</h2>` + tabela(
          '<th>Mês</th><th class="num">Vendas</th><th class="num">Vendido</th><th class="num">Custo</th><th class="num">Imposto</th><th class="num">Lucro</th><th class="num">Despesas</th><th class="num">Resultado</th><th class="num">Recebido</th><th class="num">Em aberto</th>',
          r.map((x) => `<tr><td class="principal">${MESES[x.mes - 1]}</td><td class="num" data-r="Vendas">${x.vendas}</td><td class="num" data-r="Vendido">${brl(x.vendido)}</td><td class="num" data-r="Custo">${brl(x.custo)}</td><td class="num" data-r="Imposto">${brl(x.imposto)}</td><td class="num" data-r="Lucro">${brl(x.lucro)}</td><td class="num" data-r="Despesas">${brl(x.despesas)}</td><td class="num" data-r="Resultado">${brl(x.resultado)}</td><td class="num" data-r="Recebido">${brl(x.recebido)}</td><td class="num" data-r="Em aberto">${brl(x.em_aberto)}</td></tr>`).join(''),
          `<td data-r="">Total</td><td class="num" data-r="Vendas">${somar(r, 'vendas')}</td><td class="num" data-r="Vendido">${brl(somar(r, 'vendido'))}</td><td class="num" data-r="Custo">${brl(somar(r, 'custo'))}</td><td class="num" data-r="Imposto">${brl(somar(r, 'imposto'))}</td><td class="num" data-r="Lucro">${brl(somar(r, 'lucro'))}</td><td class="num" data-r="Despesas">${brl(somar(r, 'despesas'))}</td><td class="num" data-r="Resultado">${brl(somar(r, 'resultado'))}</td><td class="num" data-r="Recebido">${brl(somar(r, 'recebido'))}</td><td class="num" data-r="Em aberto">${brl(somar(r, 'em_aberto'))}</td>`);
        exportar = () => baixarCsv(`relatorio-mensal-${estado.ano}.csv`, ['Mês', 'Vendas', 'Vendido', 'Custo', 'Imposto', 'Lucro', 'Despesas', 'Resultado', 'Recebido', 'Em aberto'],
          r.map((x) => [MESES[x.mes - 1], x.vendas, Number(x.vendido), Number(x.custo), Number(x.imposto), Number(x.lucro), Number(x.despesas), Number(x.resultado), Number(x.recebido), Number(x.em_aberto)]));
      } else if (estado.aba === 'produtos') {
        const r = await api.relProdutos(estado.de, estado.ate, estado.quitadas);
        corpo.innerHTML = `<h2>${dataBr(estado.de)} a ${dataBr(estado.ate)}</h2>` + (r.length ? tabela(
          '<th>Produto</th><th class="num">Qtd</th><th class="num">Receita</th><th class="num">Custo</th><th class="num">Imposto</th><th class="num">Lucro</th><th class="num">Margem</th>',
          r.map((x) => `<tr><td class="principal">${esc(x.produto)}</td><td class="num" data-r="Qtd">${x.quantidade}</td><td class="num" data-r="Receita">${brl(x.receita)}</td><td class="num" data-r="Custo">${brl(x.custo)}</td><td class="num" data-r="Imposto">${brl(x.imposto)}</td><td class="num" data-r="Lucro">${brl(x.lucro)}</td><td class="num" data-r="Margem">${x.receita > 0 ? numBr(x.lucro / x.receita * 100, 0) + '%' : '—'}</td></tr>`).join(''),
          `<td data-r="">Total</td><td class="num" data-r="Qtd">${somar(r, 'quantidade')}</td><td class="num" data-r="Receita">${brl(somar(r, 'receita'))}</td><td class="num" data-r="Custo">${brl(somar(r, 'custo'))}</td><td class="num" data-r="Imposto">${brl(somar(r, 'imposto'))}</td><td class="num" data-r="Lucro">${brl(somar(r, 'lucro'))}</td><td></td>`) : '<div class="cartao vazio">Sem vendas no período.</div>');
        exportar = () => baixarCsv(`relatorio-produtos-${estado.de}-a-${estado.ate}.csv`, ['Produto', 'Categoria', 'Quantidade', 'Receita', 'Custo', 'Imposto', 'Lucro'],
          r.map((x) => [x.produto, x.categoria, Number(x.quantidade), Number(x.receita), Number(x.custo), Number(x.imposto), Number(x.lucro)]));
      } else if (estado.aba === 'clientes') {
        const r = await api.relClientes(estado.de, estado.ate);
        corpo.innerHTML = `<h2>${dataBr(estado.de)} a ${dataBr(estado.ate)}</h2>` + (r.length ? tabela(
          '<th>Cliente</th><th class="num">Vendas</th><th class="num">Total</th><th class="num">Imposto</th><th class="num">Lucro</th><th class="num">Pago</th><th class="num">Em aberto</th><th class="num">Última compra</th>',
          r.map((x) => `<tr><td class="principal">${x.cliente_id ? `<a href="#/clientes/${x.cliente_id}">${esc(x.cliente)}</a>` : esc(x.cliente)}</td><td class="num" data-r="Vendas">${x.vendas}</td><td class="num" data-r="Total">${brl(x.total)}</td><td class="num" data-r="Imposto">${brl(x.imposto)}</td><td class="num" data-r="Lucro">${brl(x.lucro)}</td><td class="num" data-r="Pago">${brl(x.pago)}</td><td class="num" data-r="Em aberto">${brl(x.saldo)}</td><td class="num" data-r="Última compra">${dataBr(x.ultima_compra)}</td></tr>`).join(''),
          `<td data-r="">Total</td><td class="num" data-r="Vendas">${somar(r, 'vendas')}</td><td class="num" data-r="Total">${brl(somar(r, 'total'))}</td><td class="num" data-r="Imposto">${brl(somar(r, 'imposto'))}</td><td class="num" data-r="Lucro">${brl(somar(r, 'lucro'))}</td><td class="num" data-r="Pago">${brl(somar(r, 'pago'))}</td><td class="num" data-r="Em aberto">${brl(somar(r, 'saldo'))}</td><td></td>`) : '<div class="cartao vazio">Sem vendas no período.</div>');
        exportar = () => baixarCsv(`relatorio-clientes-${estado.de}-a-${estado.ate}.csv`, ['Cliente', 'Vendas', 'Total', 'Imposto', 'Lucro', 'Pago', 'Em aberto', 'Última compra'],
          r.map((x) => [x.cliente, x.vendas, Number(x.total), Number(x.imposto), Number(x.lucro), Number(x.pago), Number(x.saldo), dataBr(x.ultima_compra)]));
      } else if (estado.aba === 'despesas') {
        const r = await api.relDespesas(estado.de, estado.ate);
        corpo.innerHTML = `<h2>${dataBr(estado.de)} a ${dataBr(estado.ate)}</h2>` + (r.length ? tabela(
          '<th>Categoria</th><th class="num">Lançamentos</th><th class="num">Total</th>',
          r.map((x) => `<tr><td class="principal">${esc(x.categoria)}</td><td class="num" data-r="Lançamentos">${x.lancamentos}</td><td class="num" data-r="Total">${brl(x.total)}</td></tr>`).join(''),
          `<td data-r="">Total</td><td class="num" data-r="Lançamentos">${somar(r, 'lancamentos')}</td><td class="num" data-r="Total">${brl(somar(r, 'total'))}</td>`) : '<div class="cartao vazio">Sem despesas no período.</div>');
        exportar = () => baixarCsv(`despesas-${estado.de}-a-${estado.ate}.csv`, ['Categoria', 'Lançamentos', 'Total'], r.map((x) => [x.categoria, x.lancamentos, Number(x.total)]));
      } else if (estado.aba === 'nf') {
        const [r, pago] = await Promise.all([api.relNf(estado.de, estado.ate), api.impostoPago(estado.de, estado.ate)]);
        const previsto = somar(r, 'imposto');
        corpo.innerHTML = `<h2>${dataBr(estado.de)} a ${dataBr(estado.ate)}</h2>
          <div class="grade g4" style="margin-bottom:14px">
            <div class="cartao kpi"><div class="rotulo">Vendas com NF</div><div class="valor">${brl(somar(r, 'total'))}</div></div>
            <div class="cartao kpi"><div class="rotulo">Imposto previsto</div><div class="valor">${brl(previsto)}</div></div>
            <div class="cartao kpi"><div class="rotulo">Guias pagas</div><div class="valor">${brl(pago)}</div></div>
            <div class="cartao kpi"><div class="rotulo">Diferença</div><div class="valor">${brl(arred(previsto - Number(pago)))}</div></div>
          </div>` + (r.length ? tabela(
          '<th>Cliente</th><th>Data</th><th>NF</th><th class="num">Total</th><th class="num">Alíquota</th><th class="num">Imposto</th>',
          r.map((x) => `<tr><td class="principal">${esc(x.cliente)}</td><td data-r="Data">${dataBr(x.data)}</td><td data-r="NF">${esc(x.numero_nf) || '—'}</td><td class="num" data-r="Total">${brl(x.total)}</td><td class="num" data-r="Alíquota">${numBr(x.aliquota)}%</td><td class="num" data-r="Imposto">${brl(x.imposto)}</td></tr>`).join(''),
          `<td data-r="">Total</td><td></td><td></td><td class="num" data-r="Total">${brl(somar(r, 'total'))}</td><td></td><td class="num" data-r="Imposto">${brl(previsto)}</td>`) : '<div class="cartao vazio">Sem vendas com NF no período.</div>');
        exportar = () => baixarCsv(`notas-fiscais-${estado.de}-a-${estado.ate}.csv`, ['Cliente', 'Data', 'NF', 'Total', 'Alíquota', 'Imposto'],
          r.map((x) => [x.cliente, dataBr(x.data), x.numero_nf, Number(x.total), Number(x.aliquota), Number(x.imposto)]));
      } else {
        const r = await api.relFormas(estado.de, estado.ate);
        corpo.innerHTML = `<h2>${dataBr(estado.de)} a ${dataBr(estado.ate)}</h2>` + (r.length ? tabela(
          '<th>Forma de pagamento</th><th class="num">Total</th>',
          r.map((x) => `<tr><td class="principal">${esc(FORMAS[x.forma])}</td><td class="num" data-r="Total">${brl(x.total)}</td></tr>`).join(''),
          `<td data-r="">Total</td><td class="num" data-r="Total">${brl(somar(r, 'total'))}</td>`) : '<div class="cartao vazio">Sem recebimentos no período.</div>');
        exportar = () => baixarCsv(`recebimentos-${estado.de}-a-${estado.ate}.csv`, ['Forma', 'Total'], r.map((x) => [FORMAS[x.forma], Number(x.total)]));
      }
    }

    async function abrir() {
      el.querySelectorAll('[data-aba]').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === estado.aba));
      barraFiltros();
      await dados();
    }
    el.querySelectorAll('[data-aba]').forEach((b) => { b.onclick = () => { estado.aba = b.dataset.aba; abrir().catch(erroTela); }; });
    el.querySelector('[data-csv]').onclick = () => exportar();
    el.querySelector('[data-imp]').onclick = () => window.print();
    await abrir();
  };

  telas.configuracoes = async (el) => {
    const config = await api.configuracoes();
    el.innerHTML = `<div class="topo"><h1>Configurações</h1></div>
      <div class="cartao pilha" style="max-width:480px">
        <h2 style="margin:0">Imposto das vendas com NF</h2>
        <label class="campo">Alíquota (%)<input data-aliq inputmode="decimal" value="${paraCampo(config.aliquota_nf)}"></label>
        <p class="sub" style="margin:0">Vale para as próximas vendas com NF. Vendas já lançadas mantêm a alíquota com que foram feitas.</p>
        <div><button class="btn primario" data-s>Salvar alíquota</button></div>
      </div>`;
    el.querySelector('[data-s]').onclick = (e) => comTrava(e.target, async () => {
      await api.salvarAliquotaNf(lerNumero(el.querySelector('[data-aliq]').value));
      aviso('Alíquota salva.');
    });
  };

  telas.mais = async (el) => {
    el.innerHTML = `<div class="topo"><h1>Mais</h1></div>
      <div class="mais-lista">
        <a class="btn" href="#/produtos">Produtos</a>
        ${pode('contas') ? '<a class="btn" href="#/contas">Contas</a>' : ''}
        ${pode('compras') ? '<a class="btn" href="#/compras">Compras e fornecedores</a>' : ''}
        ${pode('relatorios') ? '<a class="btn" href="#/relatorios">Relatórios</a>' : ''}
        ${master() ? '<a class="btn" href="#/usuarios">Usuários</a><a class="btn" href="#/configuracoes">Configurações</a>' : ''}
        <button class="btn perigo" data-sair>Sair</button>
      </div>`;
    el.querySelector('[data-sair]').onclick = () => api.sair();
  };

  // ---------- Navegação ----------
  const ICONES = {
    inicio: 'M3 11l9-8 9 8M5 10v10h14V10',
    vendas: 'M3 4h2l2.4 11.2a1 1 0 001 .8h9.2a1 1 0 001-.8L21 7H6M9 20h.01M18 20h.01',
    receber: 'M12 3v18M17 7.5C17 5.6 14.8 4.5 12 4.5S7 5.7 7 8s2.2 3.2 5 3.7 5 1.5 5 3.8-2.2 3.5-5 3.5-5-1.1-5-3',
    clientes: 'M16 20v-1.5A3.5 3.5 0 0012.5 15h-6A3.5 3.5 0 003 18.5V20M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7M21 20v-1.5a3.5 3.5 0 00-2.6-3.4M15.5 4.2a3.5 3.5 0 010 6.7',
    produtos: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
    compras: 'M3 7h18l-1.5 13h-15L3 7zM8 7V5a4 4 0 018 0v2',
    relatorios: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
    mais: 'M4 7h16M4 12h16M4 17h16',
    contas: 'M3 10h18M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18M12 3l9 5H3l9-5z',
    usuarios: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3zM9 12l2 2 4-4',
    configuracoes: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4h4V5h-4zM6 15v4h4v-4H6z',
    sair: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  };
  const icone = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONES[n]}"/></svg>`;
  const MENU = [['inicio', 'Início'], ['vendas', 'Vendas'], ['receber', 'A receber'], ['clientes', 'Clientes'], ['produtos', 'Produtos'], ['contas', 'Contas'], ['compras', 'Compras'], ['relatorios', 'Relatórios'], ['usuarios', 'Usuários'], ['configuracoes', 'Configurações']];
  // Tela -> permissão necessária. O banco também recusa; aqui é só para não mostrar a tela.
  // A tela Início mostra vendido, recebido e resultado, por isso segue a permissão de relatórios.
  const EXIGE = { inicio: 'relatorios', contas: 'contas', conta: 'contas', compras: 'compras', relatorios: 'relatorios' };
  const telaInicial = () => (pode('relatorios') ? 'inicio' : 'vendas');
  const liberada = (tela) => (['usuarios', 'configuracoes'].includes(tela) ? master() : !EXIGE[tela] || pode(EXIGE[tela]));
  const BAIXO = [['inicio', 'Início'], ['vendas', 'Vendas'], ['receber', 'Receber'], ['clientes', 'Clientes'], ['mais', 'Mais']];

  const estados = {};   // guarda filtros de cada tela enquanto navega
  let area = null;
  let sequencia = 0;

  function casca(email) {
    raiz.innerHTML = `
      <aside class="lateral">
        <div class="marca">Loja Pampa</div>
        ${MENU.filter(([k]) => liberada(k)).map(([k, r]) => `<a class="nav-item" data-nav="${k}" href="#/${k}">${icone(k)}${r}</a>`).join('')}
        <div class="rodape"><div class="usuario">${esc(email)}<br>${esc(acesso.nome)}</div><button class="nav-item" data-sair>${icone('sair')}Sair</button></div>
      </aside>
      <main class="conteudo" id="tela"></main>
      <nav class="barra-baixo" aria-label="Navegação">${BAIXO.filter(([k]) => k === 'mais' || liberada(k)).map(([k, r]) => `<a data-nav="${k}" href="#/${k}">${icone(k)}${r}</a>`).join('')}</nav>`;
    area = document.getElementById('tela');
    raiz.querySelector('[data-sair]').onclick = () => api.sair();
  }

  async function mostrar() {
    if (!area) return;
    const [, nome = telaInicial(), id] = (location.hash || `#/${telaInicial()}`).split('/');
    const eDetalheCliente = nome === 'clientes' && id;
    const eExtrato = nome === 'contas' && id;
    let tela = eDetalheCliente ? 'cliente' : eExtrato ? 'conta' : (telas[nome] ? nome : telaInicial());
    if (!liberada(tela)) tela = telaInicial();
    const noMenu = eDetalheCliente ? 'clientes' : eExtrato ? 'contas' : tela;
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('ativo', a.dataset.nav === noMenu));
    const minha = ++sequencia;
    const destino = document.createElement('div');
    if (!area.firstChild) area.innerHTML = '<div class="vazio">Carregando…</div>';
    try {
      await telas[tela](destino, (estados[tela] ??= {}), id ? +id : undefined);
      if (minha === sequencia) { area.replaceChildren(destino); }
    } catch (e) {
      if (minha === sequencia) {
        area.innerHTML = `<div class="cartao vazio">Não foi possível carregar esta tela.<br><span class="sub">${esc(e.message)}</span><br><br><button class="btn" data-tentar>Tentar de novo</button></div>`;
        area.querySelector('[data-tentar]').onclick = () => mostrar();
      }
    }
  }
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); mostrar(); });

  // ---------- Entrada ----------
  const OLHO_ABERTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OLHO_FECHADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0112 5c6.5 0 10 7 10 7a17.7 17.7 0 01-3.1 4.2M6.1 6.1C3.6 7.8 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5M9.9 9.9a3 3 0 004.2 4.2"/></svg>';
  function telaLogin(msg = '') {
    area = null;
    raiz.innerHTML = `<div class="tela-login"><form class="cartao caixa-login">
      <h1>Loja Pampa</h1>
      <label class="campo">E-mail<input type="email" name="email" autocomplete="username" required></label>
      <label class="campo">Senha<span class="senha-caixa"><input type="password" name="senha" autocomplete="current-password" required><button type="button" class="olho" data-olho aria-label="Mostrar senha" aria-pressed="false">${OLHO_ABERTO}</button></span></label>
      <div class="erro" data-erro>${esc(msg)}</div>
      <button class="btn primario" type="submit">Entrar</button>
      <button class="link" type="button" data-esqueci>Esqueci a senha</button>
    </form></div>`;
    const form = raiz.querySelector('form'), err = raiz.querySelector('[data-erro]');
    const olho = raiz.querySelector('[data-olho]');
    olho.onclick = () => {
      const mostrar = form.senha.type === 'password';
      form.senha.type = mostrar ? 'text' : 'password';
      olho.innerHTML = mostrar ? OLHO_FECHADO : OLHO_ABERTO;
      olho.setAttribute('aria-label', mostrar ? 'Esconder senha' : 'Mostrar senha');
      olho.setAttribute('aria-pressed', String(mostrar));
      form.senha.focus();
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const b = form.querySelector('[type=submit]');
      b.disabled = true; err.textContent = '';
      try { await api.entrar(form.email.value.trim(), form.senha.value); }
      catch (x) { err.textContent = x.message; }
      finally { b.disabled = false; }
    };
    raiz.querySelector('[data-esqueci]').onclick = async () => {
      const email = form.email.value.trim();
      if (!email) { err.textContent = 'Digite seu e-mail primeiro.'; return; }
      try { await api.esqueciSenha(email); err.textContent = 'Se o e-mail estiver cadastrado, enviamos um link para criar nova senha.'; }
      catch (x) { err.textContent = x.message; }
    };
  }

  function pedirNovaSenha() {
    const d = janela({
      titulo: 'Criar nova senha',
      corpo: '<label class="campo">Nova senha (mínimo 8 caracteres)<input type="password" data-s autocomplete="new-password"></label>',
      pe: '<button class="btn primario" data-ok>Salvar senha</button>',
    });
    d.querySelector('[data-ok]').onclick = (e) => comTrava(e.target, async () => {
      const s = d.querySelector('[data-s]').value;
      if (s.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
      await api.trocarSenha(s); d.fechar(); aviso('Senha alterada.');
    });
  }

  let usuarioAtual = null;
  async function aplicarSessao(sessao) {
    const id = sessao?.user?.id ?? null;
    if (id === usuarioAtual) return;
    usuarioAtual = id;
    // Filtros de quem saiu não passam para quem entra no mesmo aparelho.
    Object.keys(estados).forEach((k) => delete estados[k]);
    if (!id) { acesso = null; telaLogin(); return; }
    try {
      acesso = await api.meuAcesso();
      if (!acesso) {
        raiz.innerHTML = `<div class="tela-login"><div class="cartao caixa-login"><h1>Sem acesso</h1>
          <p>O usuário ${esc(sessao.user.email)} ainda não foi liberado. Peça para o administrador incluir você na equipe.</p>
          <button class="btn" data-sair>Sair</button></div></div>`;
        raiz.querySelector('[data-sair]').onclick = () => api.sair();
        return;
      }
    } catch (e) { usuarioAtual = null; telaLogin(e.message); return; }
    acesso.email = sessao.user.email;
    casca(sessao.user.email);
    mostrar();
  }

  async function iniciar() {
    if (!api.configurado) {
      raiz.innerHTML = '<div class="tela-login"><div class="cartao caixa-login"><h1>Falta configurar</h1><p>Preencha o arquivo <strong>config.js</strong> com os dados do Supabase.</p></div></div>';
      return;
    }
    api.aoMudarSessao((evento, sessao) => {
      if (evento === 'PASSWORD_RECOVERY') setTimeout(pedirNovaSenha, 0);
      // O Supabase pede que a chamada ao banco não ocorra dentro deste aviso.
      setTimeout(() => aplicarSessao(sessao), 0);
    });
    const sessao = await api.sessao();
    if (!sessao) telaLogin();
  }

  iniciar().catch((e) => { raiz.innerHTML = `<div class="vazio">${esc(e.message)}</div>`; });
})();
