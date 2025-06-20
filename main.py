import random
import os
import json
import time
from flask import Flask
from threading import Thread
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    CallbackQueryHandler,
    ContextTypes,
)
from functools import wraps
import asyncio

# === CONFIGURAÇÕES ===
TOKEN = os.environ.get("8066293964:AAF4F16GBp6UnCGoFTpZ8DMIso-IEwkLqG0")
DONO_ID = int(os.environ.get("5999147812", 0))

grupos_liberados = set()

# === Persistência dos grupos autorizados ===
def salvar_grupos():
    with open("grupos.json", "w") as f:
        json.dump(list(grupos_liberados), f)

def carregar_grupos():
    global grupos_liberados
    try:
        with open("grupos.json", "r") as f:
            grupos = json.load(f)
            grupos_liberados = set(grupos)
    except FileNotFoundError:
        grupos_liberados = set()

# === FLASK ===
app = Flask(__name__)

@app.route('/')
def home():
    return "Bot está online!"

def manter_vivo_local():
    porta = int(os.environ.get("PORT", 8080))
    print(f"Flask rodando na porta {porta}")
    app.run(host='0.0.0.0', port=porta)

# === VARIÁVEIS GLOBAIS ===
clique_ativo = False
usuarios_clicaram = []
mensagem_botao = None

# === DECORADORES ===
def admin_only(func):
    @wraps(func)
    async def wrapped(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
        user_id = update.effective_user.id
        chat = update.effective_chat

        if chat.type in ['group', 'supergroup'] and chat.id not in grupos_liberados:
            await update.message.reply_text("🚫 Este grupo não está autorizado a usar o bot.")
            return

        if chat.type not in ['group', 'supergroup']:
            await update.message.reply_text("⚠️ Esse comando só pode ser usado em grupos.")
            return

        try:
            member = await chat.get_member(user_id)
            if member.status not in ['administrator', 'creator']:
                await update.message.reply_text("🚫 Você precisa ser administrador para usar esse comando.")
                return
        except Exception as e:
            print(f"Erro ao verificar admin: {e}")
            await update.message.reply_text("🚫 Não foi possível verificar seu status de administrador.")
            return

        return await func(update, context, *args, **kwargs)
    return wrapped

def dono_only(func):
    @wraps(func)
    async def wrapped(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
        user_id = update.effective_user.id
        if DONO_ID == 0:
            await update.message.reply_text("🚫 ID do dono não configurado.")
            return
        if user_id != DONO_ID:
            await update.message.reply_text("🚫 Somente o dono do bot pode usar este comando.")
            return
        return await func(update, context, *args, **kwargs)
    return wrapped

# === COMANDOS ===
@dono_only
async def liberargrupo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat = update.effective_chat
    grupos_liberados.add(chat.id)
    salvar_grupos()
    print(f"[LIBERAR] Grupo {chat.id} autorizado pelo dono.")
    await update.message.reply_text("✅ Grupo autorizado!")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    texto = """
👋 Bem-vindo!

📌 Comandos disponíveis:

/iniciarclique – Ativa um botão de clique
/assadinho – SORTEIA 15 pessoas
/penaltis – SORTEIA 16 pessoas
/dado_dardo – Encerra e mostra todos que clicaram
/liberargrupo – Libera o grupo (somente o dono)
/start – Ver este menu
"""
    await update.message.reply_text(texto.strip())

@admin_only
async def iniciar_clique(update: Update, context: ContextTypes.DEFAULT_TYPE):
    global clique_ativo, usuarios_clicaram, mensagem_botao

    if clique_ativo:
        await update.message.reply_text("⚠️ Já existe um clique ativo. Use /dado_dardo para encerrar antes.")
        return

    clique_ativo = True
    usuarios_clicaram = []

    botao = InlineKeyboardMarkup([
        [InlineKeyboardButton("🚀 Clique aqui", callback_data="clique_padrao")]
    ])

    mensagem_botao = await update.message.reply_text(
        "🟢 Clique no botão abaixo para participar!\n\nTotal de participantes: 0",
        reply_markup=botao
    )

async def atualizar_mensagem_botao():
    global mensagem_botao, usuarios_clicaram
    if mensagem_botao:
        texto = (
            "🟢 Clique no botão abaixo para participar!\n\n"
            f"Total de participantes: {len(usuarios_clicaram)}"
        )
        try:
            await mensagem_botao.edit_text(texto, reply_markup=mensagem_botao.reply_markup)
        except Exception as e:
            print(f"Erro ao atualizar botão: {e}")

async def tratar_clique(update: Update, context: ContextTypes.DEFAULT_TYPE):
    global clique_ativo, usuarios_clicaram

    query = update.callback_query
    user = query.from_user

    if query.data != "clique_padrao":
        return

    if not clique_ativo:
        await query.answer("❌ Nenhum clique ativo.", show_alert=True)
        return

    if any(u["id"] == user.id for u in usuarios_clicaram):
        await query.answer("✅ Você já está na lista!", show_alert=True)
        return

    usuarios_clicaram.append({
        "id": user.id,
        "nome": user.full_name,
        "username": user.username
    })

    await query.answer("🚀 Você entrou na lista!")
    await atualizar_mensagem_botao()

@admin_only
async def finalizar(update: Update, context: ContextTypes.DEFAULT_TYPE, limite: int, nome_cmd: str):
    global clique_ativo, usuarios_clicaram, mensagem_botao

    if not clique_ativo:
        await update.message.reply_text("⚠️ Nenhum clique ativo.")
        return

    clique_ativo = False

    if mensagem_botao:
        try:
            await mensagem_botao.edit_text(f"⏹️ Clique encerrado por /{nome_cmd}")
        except Exception:
            pass

    if not usuarios_clicaram:
        await update.message.reply_text("Ninguém participou.")
        return

    lista = random.sample(usuarios_clicaram, min(limite, len(usuarios_clicaram)))

    texto = "\n".join([
        f"{i+1}. @{u['username']}" if u['username'] else f"{i+1}. [{u['nome']}](tg://user?id={u['id']})"
        for i, u in enumerate(lista)
    ])

    await update.message.reply_text(
        f"🎯 Sorteio do {nome_cmd} ({len(lista)} participantes):\n\n{texto}",
        parse_mode="Markdown"
    )

@admin_only
async def assadinho(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await finalizar(update, context, limite=15, nome_cmd="assadinho")

@admin_only
async def penaltis(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await finalizar(update, context, limite=16, nome_cmd="penaltis")

@admin_only
async def dado_dardo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    global clique_ativo, usuarios_clicaram, mensagem_botao

    if not clique_ativo:
        await update.message.reply_text("⚠️ Nenhum clique ativo.")
        return

    clique_ativo = False

    if mensagem_botao:
        try:
            await mensagem_botao.edit_text("⏹️ Clique encerrado")
        except Exception:
            pass

    if not usuarios_clicaram:
        await update.message.reply_text("Ninguém participou.")
        return

    texto = "\n".join([
        f"{i+1}. @{u['username']}" if u['username'] else f"{i+1}. [{u['nome']}](tg://user?id={u['id']})"
        for i, u in enumerate(usuarios_clicaram)
    ])

    await update.message.reply_text(
        f"📋 Lista completa dos participantes ({len(usuarios_clicaram)}):\n\n{texto}",
        parse_mode="Markdown"
    )

# === INICIALIZAÇÃO ===
async def start_telegram_bot_polling():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    if TOKEN is None:
        print("❌ Token não configurado.")
        return

    print("🤖 Iniciando bot Telegram...")
    bot = ApplicationBuilder().token(TOKEN).build()

    # Handlers
    bot.add_handler(CommandHandler("start", start))
    bot.add_handler(CommandHandler("iniciarclique", iniciar_clique))
    bot.add_handler(CommandHandler("assadinho", assadinho))
    bot.add_handler(CommandHandler("penaltis", penaltis))
    bot.add_handler(CommandHandler("dado_dardo", dado_dardo))
    bot.add_handler(CommandHandler("liberargrupo", liberargrupo))
    bot.add_handler(CallbackQueryHandler(tratar_clique))

    print("🤖 Bot rodando em polling...")
    loop.run_until_complete(bot.run_polling(poll_interval=3))

# === EXECUTAR ===
if __name__ == '__main__':
    carregar_grupos()

    if TOKEN is None:
        print("❌ TOKEN_TELEGRAM não configurado.")
        exit(1)

    if DONO_ID == 0:
        print("⚠️ AVISO: DONO_ID_TELEGRAM não configurado.")

    flask_thread = Thread(target=manter_vivo_local)
    flask_thread.daemon = True
    flask_thread.start()

    bot_thread = Thread(target=start_telegram_bot_polling)
    bot_thread.daemon = True
    bot_thread.start()

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("🚫 Programa encerrado.")
