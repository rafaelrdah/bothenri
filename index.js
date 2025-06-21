require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const DONO_ID = 5999147812;
const gruposLiberados = new Set([-1002506070234]);

let cliqueAtivo = false;
let usuariosClicaram = [];
let mensagemBotao = null;

// Para guardar chat_id e message_id da mensagem do botão para facilitar apagar/editar
let mensagemBotaoChatId = null;
let mensagemBotaoId = null;

// ============ UTILITÁRIOS ============

function apenasAdmins(callback) {
  return async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
      bot.sendMessage(chatId, '⚠️ Esse comando só pode ser usado em grupos.');
      return;
    }

    if (!gruposLiberados.has(chatId)) {
      bot.sendMessage(chatId, '🚫 Este grupo não está autorizado a usar o bot.');
      return;
    }

    try {
      const member = await bot.getChatMember(chatId, userId);
      if (['administrator', 'creator'].includes(member.status)) {
        callback(msg, match);
      } else {
        bot.sendMessage(chatId, '🚫 Você precisa ser administrador para usar esse comando.');
      }
    } catch (error) {
      console.error('Erro ao verificar administrador:', error.message);
    }
  };
}

// ============ COMANDOS ============

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const texto = `
👋 Bem-vindo!

📌 Comandos disponíveis:
/iniciarclique – Ativa um botão de clique
/assadinho – SORTEIA 15 pessoas que clicaram
/penaltis – SORTEIA 16 pessoas que clicaram
/dado_dardo – Encerra e mostra todos que clicaram
/liberargrupo – Libera o grupo (somente o dono)
/start – Ver esta mensagem
`;
  bot.sendMessage(chatId, texto);
});

bot.onText(/\/liberargrupo/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId === DONO_ID) {
    gruposLiberados.add(chatId);
    bot.sendMessage(chatId, '✅ Grupo autorizado a usar o bot!');
  } else {
    bot.sendMessage(chatId, '🚫 Comando disponível apenas para o dono do bot.');
  }
});

bot.onText(/\/iniciarclique/, apenasAdmins(async (msg) => {
  cliqueAtivo = true;
  usuariosClicaram = [];

  const options = {
    reply_markup: {
      inline_keyboard: [[{ text: 'Clique aqui', callback_data: 'clique_padrao' }]],
    },
  };

  bot.sendMessage(
    msg.chat.id,
    `🟢 Clique no botão abaixo!\n\nClique para participar das dinâmicas do grupo, como Assadinho, Pênaltis, Dardo ou Dado. Permaneça online durante toda a dinâmica.\n\nTotal de participantes: 0`,
    options
  ).then((mensagem) => {
    mensagemBotao = mensagem;
    mensagemBotaoChatId = mensagem.chat.id;
    mensagemBotaoId = mensagem.message_id;
  });
}));

bot.on('callback_query', async (query) => {
  const { message, from, data } = query;

  if (data !== 'clique_padrao') return;
  if (!cliqueAtivo) {
    bot.answerCallbackQuery(query.id, { text: '❌ Nenhum clique ativo no momento.', show_alert: true });
    return;
  }

  if (usuariosClicaram.some((u) => u.id === from.id)) {
    bot.answerCallbackQuery(query.id, { text: 'Você já clicou!', show_alert: true });
    return;
  }

  usuariosClicaram.push({
    id: from.id,
    nome: from.first_name,
    username: from.username,
  });

  bot.answerCallbackQuery(query.id, { text: '✅ Você foi registrado!' });

  // Atualizar mensagem do botão
  const total = usuariosClicaram.length;
  const texto = `🟢 Clique no botão abaixo!\n\nClique para participar das dinâmicas do grupo, como Assadinho, Pênaltis, Dardo ou Dado. Permaneça online durante toda a dinâmica.\n\nTotal de participantes: ${total}`;

  if (mensagemBotaoChatId && mensagemBotaoId) {
    try {
      await bot.editMessageText(texto, {
        chat_id: mensagemBotaoChatId,
        message_id: mensagemBotaoId,
        reply_markup: {
          inline_keyboard: [[{ text: 'Clique aqui', callback_data: 'clique_padrao' }]],
        },
      });
    } catch (err) {
      console.error('Erro ao editar mensagem:', err.message);
    }
  } else {
    console.warn('Mensagem do botão não encontrada para editar.');
  }
});

function formatarListaParticipantes(listaUsuarios) {
  return listaUsuarios.map((u, i) =>
    `${i + 1}. ${u.username ? '@' + u.username : `<a href="tg://user?id=${u.id}">${u.nome}</a>`}`
  ).join('\n');
}

function finalizarSorteio(msg, limite, nome) {
  const chatId = msg.chat.id;

  if (!cliqueAtivo) {
    bot.sendMessage(chatId, '⚠️ Nenhum botão de clique está ativo.');
    return;
  }

  cliqueAtivo = false;

  if (!usuariosClicaram.length) {
    bot.sendMessage(chatId, 'Ninguém participou.');
    return;
  }

  const sorteados = usuariosClicaram.sort(() => 0.5 - Math.random()).slice(0, limite);
  const lista = formatarListaParticipantes(sorteados);

  // Apagar mensagem do botão para evitar erros futuros
  if (mensagemBotaoChatId && mensagemBotaoId) {
    bot.deleteMessage(mensagemBotaoChatId, mensagemBotaoId).catch(() => {});
  }

  // Limpar referências
  mensagemBotao = null;
  mensagemBotaoChatId = null;
  mensagemBotaoId = null;
  usuariosClicaram = [];

  bot.sendMessage(chatId, `🎯 Sorteio do ${nome} (${sorteados.length} Participantes):\n\n${lista}`, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

bot.onText(/\/assadinho/, apenasAdmins((msg) => finalizarSorteio(msg, 15, 'assadinho')));
bot.onText(/\/penaltis/, apenasAdmins((msg) => finalizarSorteio(msg, 16, 'penaltis')));

bot.onText(/\/dado_dardo/, apenasAdmins((msg) => {
  const chatId = msg.chat.id;

  if (!cliqueAtivo) {
    bot.sendMessage(chatId, '⚠️ Nenhum botão de clique está ativo.');
    return;
  }

  cliqueAtivo = false;

  if (!usuariosClicaram.length) {
    bot.sendMessage(chatId, 'Ninguém participou.');
    return;
  }

  const lista = formatarListaParticipantes(usuariosClicaram);

  // Apagar mensagem do botão
  if (mensagemBotaoChatId && mensagemBotaoId) {
    bot.deleteMessage(mensagemBotaoChatId, mensagemBotaoId).catch(() => {});
  }

  // Limpar referências
  mensagemBotao = null;
  mensagemBotaoChatId = null;
  mensagemBotaoId = null;
  usuariosClicaram = [];

  bot.sendMessage(chatId, `📋 Lista completa dos participantes:\n\n${lista}`, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}));

console.log('🤖 Bot rodando!');
