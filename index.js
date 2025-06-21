const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot está rodando!'));
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

const donoDoBot = 5999147812;
const gruposAutorizados = new Set();
const cliques = new Map();

function grupoAutorizado(chatId) {
  return gruposAutorizados.has(chatId);
}

async function ehAdmin(chatId, userId) {
  try {
    const membros = await bot.getChatAdministrators(chatId);
    return membros.some(m => m.user.id === userId);
  } catch {
    return false;
  }
}

bot.onText(/\/start/, (msg) => {
  const resposta = `
👋 Olá, ${msg.from.first_name}!

📌 *Comandos disponíveis:*
/start – Ver comandos disponíveis
/iniciarclique – Criar botão de participação (admins)
/assadinho – Sorteia até 15 participantes (admins)
/penaltis – Sorteia até 16 participantes (admins)
/dado_dardo – Lista os participantes (admins)
/liberargrupo – Liberar uso neste grupo (apenas dono)

*Use em grupos com o bot como administrador.*
  `;
  bot.sendMessage(msg.chat.id, resposta, { parse_mode: 'Markdown' });
});

bot.onText(/\/liberargrupo/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId !== donoDoBot) {
    return bot.sendMessage(chatId, "❌ Apenas o dono do bot pode liberar grupos.");
  }

  gruposAutorizados.add(chatId);
  bot.sendMessage(chatId, "✅ Grupo autorizado com sucesso!");
});

bot.onText(/\/iniciarclique/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!grupoAutorizado(chatId)) return bot.sendMessage(chatId, "🔒 Este grupo não está autorizado. Peça ao dono para usar /liberargrupo.");
  if (!await ehAdmin(chatId, userId)) return bot.sendMessage(chatId, "❌ Apenas administradores podem usar este comando.");

  cliques.set(chatId, new Map());

  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👉 Clique aqui", callback_data: "clicou" }]
      ]
    }
  };

  bot.sendMessage(chatId, "🚨 Participe da dinâmica! Clique no botão abaixo 👇", opts);
});

bot.on("callback_query", (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const user = callbackQuery.from;

  if (!cliques.has(chatId)) return;

  const participantes = cliques.get(chatId);
  participantes.set(user.id, user);

  const total = participantes.size;
  bot.answerCallbackQuery(callbackQuery.id, { text: `🎯 Você foi registrado! Total: ${total}` });
});

bot.onText(/\/assadinho/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!grupoAutorizado(chatId)) return bot.sendMessage(chatId, "🔒 Grupo não autorizado.");
  if (!await ehAdmin(chatId, userId)) return bot.sendMessage(chatId, "❌ Apenas administradores podem usar.");

  const participantes = Array.from((cliques.get(chatId) || new Map()).values());

  if (participantes.length === 0) return bot.sendMessage(chatId, "⚠️ Nenhum participante registrado.");

  const sorteados = participantes.sort(() => 0.5 - Math.random()).slice(0, 15);

  let resposta = "🔥 *Sorteio - Assadinho*

";
  sorteados.forEach((u, i) => {
    const nome = u.username ? `@${u.username}` : `[${u.first_name}](tg://user?id=${u.id})`;
    resposta += `${i + 1}. ${nome}
`;
  });

  bot.sendMessage(chatId, resposta, { parse_mode: 'Markdown' });
  cliques.delete(chatId);
});

bot.onText(/\/penaltis/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!grupoAutorizado(chatId)) return bot.sendMessage(chatId, "🔒 Grupo não autorizado.");
  if (!await ehAdmin(chatId, userId)) return bot.sendMessage(chatId, "❌ Apenas administradores podem usar.");

  const participantes = Array.from((cliques.get(chatId) || new Map()).values());

  if (participantes.length === 0) return bot.sendMessage(chatId, "⚠️ Nenhum participante registrado.");

  const sorteados = participantes.sort(() => 0.5 - Math.random()).slice(0, 16);

  let resposta = "🥅 *Sorteio - Pênaltis*

";
  sorteados.forEach((u, i) => {
    const nome = u.username ? `@${u.username}` : `[${u.first_name}](tg://user?id=${u.id})`;
    resposta += `${i + 1}. ${nome}
`;
  });

  bot.sendMessage(chatId, resposta, { parse_mode: 'Markdown' });
  cliques.delete(chatId);
});

bot.onText(/\/dado_dardo/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!grupoAutorizado(chatId)) return bot.sendMessage(chatId, "🔒 Grupo não autorizado.");
  if (!await ehAdmin(chatId, userId)) return bot.sendMessage(chatId, "❌ Apenas administradores podem usar.");

  const participantes = Array.from((cliques.get(chatId) || new Map()).values());

  if (participantes.length === 0) return bot.sendMessage(chatId, "⚠️ Nenhum participante registrado.");

  let resposta = "📋 *Participantes registrados:*

";
  participantes.forEach((u, i) => {
    const nome = u.username ? `@${u.username}` : `[${u.first_name}](tg://user?id=${u.id})`;
    resposta += `${i + 1}. ${nome}
`;
  });

  bot.sendMessage(chatId, resposta, { parse_mode: 'Markdown' });
});