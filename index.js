const {
default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    jidNormalizedUser,
    isJidBroadcast,
    getContentType,
    proto,
    generateWAMessageContent,
    generateWAMessage,
    AnyMessageContent,
    prepareWAMessageMedia,
    areJidsSameUser,
    downloadContentFromMessage,
    MessageRetryMap,
    generateForwardMessageContent,
    generateWAMessageFromContent,
    generateMessageID, makeInMemoryStore,
    jidDecode,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys')

const l = console.log
const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson } = require('./lib/functions')
const fs = require('fs')
const P = require('pino')
const config = require('./config')
const qrcode = require('qrcode-terminal')
const util = require('util')
const { sms,downloadMediaMessage } = require('./lib/msg')
const axios = require('axios')
const { File } = require('megajs')
const prefix = config.PREFIX
const ownerNumber = config.OWNER_NUMBER

//===================SESSION-AUTH============================
/**
if (!fs.existsSync(__dirname + '/auth_info_baileys/creds.json')) {
if(!config.SESSION_ID) return console.log('Please add your session to SESSION_ID env !!')
const sessdata = config.SESSION_ID
const filer = File.fromURL(`https://mega.nz/file/${sessdata}`)
filer.download((err, data) => {
if(err) throw err
fs.writeFile(__dirname + '/auth_info_baileys/creds.json', data, () => {
console.log("Session downloaded ✅")
})})}
**/
if (!fs.existsSync(__dirname + '/auth_info_baileys/creds.json')) {
    if(!config.SESSION_ID) return console.log('Please add your session to SESSION_ID env !!')
    
    const sessdata = config.SESSION_ID.replace("SRI-BOT~", '');
    
    try {
        // The session data appears to be base64 encoded JSON
        const decodedSession = Buffer.from(sessdata, 'base64').toString('utf-8');
        
        // Write the decoded session data to creds.json
        fs.writeFileSync(__dirname + '/auth_info_baileys/creds.json', decodedSession);
        console.log("Session created successfully ✅");
    } catch(err) {
        console.error("Error processing session:", err);
        throw err;
    }
}

const express = require("express");
const app = express();
const port = process.env.PORT || 8000;

//=============================================

async function connectToWA() {
console.log("Connecting wa bot 🧬...");
const { state, saveCreds } = await useMultiFileAuthState(__dirname + '/auth_info_baileys/')
var { version } = await fetchLatestBaileysVersion()

const conn = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Firefox"),
        syncFullHistory: true,
        auth: state,
        version
        })
    
conn.ev.on('connection.update', (update) => {
const { connection, lastDisconnect } = update
if (connection === 'close') {
if (lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) {
            // Add 5 second delay before reconnecting
            setTimeout(() => {
                console.log('Reconnecting after disconnect...')
                connectToWA()
            }, 5000)
}
} else if (connection === 'open') {
console.log('😼 Installing... ')
const path = require('path');
fs.readdirSync("./plugins/").forEach((plugin) => {
if (path.extname(plugin).toLowerCase() == ".js") {
require("./plugins/" + plugin);
}
});
console.log('Plugins installed successful ✅')
console.log('Bot connected to whatsapp ✅')

//let up = `Wa-BOT connected successful ✅\n\nPREFIX: ${prefix}`;
//conn.sendMessage(ownerNumber + "@s.whatsapp.net", { image: { url: `https://telegra.ph/file/900435c6d3157c98c3c88.jpg` }, caption: up })

}
})
conn.ev.on('creds.update', saveCreds)  

conn.ev.on('messages.upsert', async (mek) => {
    mek = mek.messages[0];
    if (!mek.message) return;
    mek.message = (getContentType(mek.message) === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;

    // Debug log
    /**
    console.log("☰☰☰☰☰☰☰☰☰☰☰☰☰☰☰☰")
    console.log("New Message Detected:", JSON.stringify(mek, null, 2));
    console.log("☰☰☰☰☰☰☰☰☰☰☰☰☰☰☰☰")
    **/
const reset = "\x1b[0m";
const red = "\x1b[31m";
const green = "\x1b[32m";
const blue = "\x1b[34m";
const cyan = "\x1b[36m";
const bold = "\x1b[1m";
/**
console.log(red + "☰".repeat(32) + reset);
console.log(green + bold + "New Message Detected:" + reset);
console.log(cyan + JSON.stringify(mek, null, 2) + reset);
console.log(red + "☰".repeat(32) + reset);
**/
// Auto mark as seen (දැකියි)
if (config.MARK_AS_SEEN === 'true') {
    try {
        await conn.sendReadReceipt(mek.key.remoteJid, mek.key.id, [mek.key.participant || mek.key.remoteJid]);
        console.log(green + `Marked message from ${mek.key.remoteJid} as seen.` + reset);
    } catch (error) {
        console.error(red + "Error marking message as seen:", error + reset);
    }
}

// Auto read messages (කියවීමට ලකුණු කිරීම)
if (config.READ_MESSAGE === 'true') {
    try {
        await conn.readMessages([mek.key]);
        console.log(green + `Marked message from ${mek.key.remoteJid} as read.` + reset);
    } catch (error) {
        console.error(red + "Error marking message as read:", error + reset);
    }
}

// Status updates handling
if (mek.key && mek.key.remoteJid === 'status@broadcast') {

    // Auto read Status
    if (config.AUTO_READ_STATUS === "true") {
        try {
            await conn.readMessages([mek.key]);
            console.log(green + `Status from ${mek.key.participant || mek.key.remoteJid} marked as read.` + reset);
        } catch (error) {
            console.error(red + "Error reading status:", error + reset);
        }
    }

    // Auto react to Status
    if (config.AUTO_REACT_STATUS === "true") {
        try {
            await conn.sendMessage(
                mek.key.participant || mek.key.remoteJid,
                { react: { text: config.AUTO_REACT_STATUS_EMOJI, key: mek.key } }
            );
            console.log(green + `Reacted to status from ${mek.key.participant || mek.key.remoteJid}` + reset);
        } catch (error) {
            console.error(red + "Error reacting to status:", error + reset);
        }
    }

    return;
}

  const m = sms(conn, mek)
  const type = getContentType(mek.message)
  const content = JSON.stringify(mek.message)
  const from = mek.key.remoteJid
  const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : []
  
  const body = (() => {
    if (type === 'conversation') 
        return mek.message.conversation;

    if (type === 'extendedTextMessage') 
        return mek.message.extendedTextMessage.text;

    if (type === 'imageMessage' && mek.message.imageMessage.caption) 
        return mek.message.imageMessage.caption;

    if (type === 'videoMessage' && mek.message.videoMessage.caption) 
        return mek.message.videoMessage.caption;

    if (type === 'buttonsResponseMessage') 
        return mek.message.buttonsResponseMessage.selectedButtonId;

    if (type === 'listResponseMessage') 
        return mek.message.listResponseMessage.title;

    if (type === 'templateButtonReplyMessage') 
        return mek.message.templateButtonReplyMessage.selectedId;

    if (type === 'interactiveResponseMessage') {
        if (mek.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
            const params = JSON.parse(mek.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
            return params?.id || '';
        }
        if (mek.message.interactiveResponseMessage?.buttonReply?.buttonId) {
            return mek.message.interactiveResponseMessage.buttonReply.buttonId;
        }
        return '';
    }

    if (type === 'messageContextInfo') {
        return mek.message.buttonsResponseMessage?.selectedButtonId ||
               mek.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
               (mek.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
                   ? JSON.parse(mek.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id
                   : '');
    }

    if (type === 'senderKeyDistributionMessage') {
        return mek.message.conversation || mek.message.imageMessage?.caption || '';
    }

    return '';
})();
    
  const isCmd = body.startsWith(prefix)
  var budy = typeof mek.text == 'string' ? mek.text : false;
  const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : ''
  const args = body.trim().split(/ +/).slice(1)
  const q = args.join(' ')
  const text = args.join(' ')
  const isGroupJid = jid => typeof jid === 'string' && jid.endsWith('@g.us')

// Then use:
const isGroup = isGroupJid(from)
  const sender = mek.key.fromMe ? (conn.user.id.split(':')[0]+'@s.whatsapp.net' || conn.user.id) : (mek.key.participant || mek.key.remoteJid)
  const senderNumber = sender.split('@')[0]
  const botNumber = conn.user.id.split(':')[0]
  const pushname = mek.pushName || 'Sin Nombre'
  const isMe = botNumber.includes(senderNumber)
  const isOwner = ownerNumber.includes(senderNumber) || isMe
  const botNumber2 = await jidNormalizedUser(conn.user.id);
  const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(e => {}) : ''
  const groupName = isGroup ? groupMetadata.subject : ''
  const participants = isGroup ? await groupMetadata.participants : ''
  const groupAdmins = isGroup ? await getGroupAdmins(participants) : ''
  const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false
  const isAdmins = isGroup ? groupAdmins.includes(sender) : false
  const isReact = m.message.reactionMessage ? true : false
  const reply = (teks) => {
  conn.sendMessage(from, { text: teks }, { quoted: mek })
  }

conn.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
              let mime = '';
              let res = await axios.head(url)
              mime = res.headers['content-type']
              if (mime.split("/")[1] === "gif") {
                return conn.sendMessage(jid, { video: await getBuffer(url), caption: caption, gifPlayback: true, ...options }, { quoted: quoted, ...options })
              }
              let type = mime.split("/")[0] + "Message"
              if (mime === "application/pdf") {
                return conn.sendMessage(jid, { document: await getBuffer(url), mimetype: 'application/pdf', caption: caption, ...options }, { quoted: quoted, ...options })
              }
              if (mime.split("/")[0] === "image") {
                return conn.sendMessage(jid, { image: await getBuffer(url), caption: caption, ...options }, { quoted: quoted, ...options })
              }
              if (mime.split("/")[0] === "video") {
                return conn.sendMessage(jid, { video: await getBuffer(url), caption: caption, mimetype: 'video/mp4', ...options }, { quoted: quoted, ...options })
              }
              if (mime.split("/")[0] === "audio") {
                return conn.sendMessage(jid, { audio: await getBuffer(url), caption: caption, mimetype: 'audio/mpeg', ...options }, { quoted: quoted, ...options })
              }
            }

//========== WORK TYPE ============ 
// index.js (සංශෝධිත)
if (config.MODE === "private" && !isOwner) return;
if (config.MODE === "inbox" && isGroup) return;
if (config.MODE === "groups" && !isGroup) return;
    

//=================REACT_MESG========================================================================
if(senderNumber.includes("94753670175")){
if(isReact) return
m.react("👑")
}

if(senderNumber.includes("94756209082")){
if(isReact) return
m.react("🍆")
}

//================publicreact with random emoji
 
//const emojis = ["🌟", "🔥", "❤️", "🎉", "💞"];
//if (!isReact) {
//  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
//  m.react(randomEmoji);
//}

//==========================

    
const events = require('./command')
const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false;
if (isCmd) {
const cmd = events.commands.find((cmd) => cmd.pattern === (cmdName)) || events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName))
if (cmd) {
if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key }})

try {
cmd.function(conn, mek, m,{from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
} catch (e) {
console.error("[PLUGIN ERROR] " + e);
}
}
}
events.commands.map(async(command) => {
if (body && command.on === "body") {
command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
} else if (mek.q && command.on === "text") {
command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
} else if (
(command.on === "image" || command.on === "photo") &&
mek.type === "imageMessage"
) {
command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
} else if (
command.on === "sticker" &&
mek.type === "stickerMessage"
) {
command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
}});
//============================================================================ 

})
}
app.get("/", (req, res) => {
res.send("hey, bot started✅");
});
app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`));
setTimeout(() => {
connectToWA()
}, 4000);
