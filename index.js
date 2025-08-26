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
    Browsers,
    delay
} = require('@whiskeysockets/baileys')

const l = console.log
const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson } = require('./lib/functions')
const fs = require('fs')
const P = require('pino')
const config = require('./config')
const qrcode = require('qrcode-terminal')
const util = require('util')
const { sms, downloadMediaMessage } = require('./lib/msg')
const axios = require('axios')
const { File } = require('megajs')
const prefix = config.PREFIX
const ownerNumber = config.OWNER_NUMBER
const express = require("express");
const app = express();
const port = process.env.PORT || 8000;
const path = require('path');
const fsExtra = require('fs-extra');

// Multi-number support variables
const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';

// Ensure session directory exists
if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// Load admin numbers
function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}

// Format message function
function formatMessage(title, content, footer) {
    return `${title}\n\n${content}\n\n${footer}`;
}

// Multi-number connection function
async function connectToWAMulti(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    
    console.log(`Connecting WhatsApp bot for number: ${sanitizedNumber}...`);
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const conn = makeWASocket({
            logger: P({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.macOS("Firefox"),
            syncFullHistory: true,
            auth: state,
            version
        });

        // Store socket and creation time
        activeSockets.set(sanitizedNumber, conn);
        socketCreationTime.set(sanitizedNumber, Date.now());

        conn.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                if (lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) {
                    console.log(`Connection lost for ${sanitizedNumber}, attempting to reconnect...`);
                    setTimeout(() => {
                        activeSockets.delete(sanitizedNumber);
                        socketCreationTime.delete(sanitizedNumber);
                        connectToWAMulti(number);
                    }, 5000);
                } else {
                    console.log(`Logged out from ${sanitizedNumber}, removing from active sockets`);
                    activeSockets.delete(sanitizedNumber);
                    socketCreationTime.delete(sanitizedNumber);
                }
            } else if (connection === 'open') {
                console.log(`Bot connected for number: ${sanitizedNumber}`);
                
                // Load plugins for this connection
                fs.readdirSync("./plugins/").forEach((plugin) => {
                    if (path.extname(plugin).toLowerCase() === ".js") {
                        require("./plugins/" + plugin);
                    }
                });
                
                console.log(`Plugins installed for ${sanitizedNumber} ✅`);
                
                // Send connection success message to owner
                const admins = loadAdmins();
                const caption = formatMessage(
                    '*Connected Successful ✅*',
                    `📞 Number: ${sanitizedNumber}\n🩵 Status: Online`,
                    `${config.BOT_FOOTER}`
                );

                for (const admin of admins) {
                    try {
                        conn.sendMessage(
                            `${admin}@s.whatsapp.net`,
                            {
                                image: { url: config.IMAGE_PATH },
                                caption
                            }
                        );
                    } catch (error) {
                        console.error(`Failed to send connect message to admin ${admin}:`, error);
                    }
                }
            }
        });

        conn.ev.on('creds.update', saveCreds);

        // Setup message handlers
        setupMessageHandlers(conn, sanitizedNumber);

    } catch (error) {
        console.error(`Failed to connect number ${sanitizedNumber}:`, error);
        activeSockets.delete(sanitizedNumber);
        socketCreationTime.delete(sanitizedNumber);
    }
}

// Setup message handlers for each connection
function setupMessageHandlers(conn, number) {
    conn.ev.on('messages.upsert', async (mek) => {
        mek = mek.messages[0];
        if (!mek.message) return;
        mek.message = (getContentType(mek.message) === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;

        const reset = "\x1b[0m";
        const red = "\x1b[31m";
        const green = "\x1b[32m";
        const blue = "\x1b[34m";
        const cyan = "\x1b[36m";
        const bold = "\x1b[1m";

        console.log(red + "☰".repeat(32) + reset);
        console.log(green + bold + `New Message for ${number}:` + reset);
        console.log(cyan + JSON.stringify(mek, null, 2) + reset);
        console.log(red + "☰".repeat(32) + reset);

        // Auto mark as seen
        if (config.MARK_AS_SEEN === 'true') {
            try {
                await conn.sendReadReceipt(mek.key.remoteJid, mek.key.id, [mek.key.participant || mek.key.remoteJid]);
                console.log(blue + `Marked message from ${mek.key.remoteJid} as seen for ${number}.` + reset);
            } catch (error) {
                console.error(red + `Error marking message as seen for ${number}:`, error + reset);
            }
        }

        // Auto read messages
        if (config.READ_MESSAGE === 'true') {
            try {
                await conn.readMessages([mek.key]);
                console.log(cyan + `Marked message from ${mek.key.remoteJid} as read for ${number}.` + reset);
            } catch (error) {
                console.error(red + `Error marking message as read for ${number}:`, error + reset);
            }
        }

        // Status updates handling
        if (mek.key && mek.key.remoteJid === 'status@broadcast') {
            // Auto read Status
            if (config.AUTO_READ_STATUS === "true") {
                try {
                    await conn.readMessages([mek.key]);
                    console.log(green + `Status from ${mek.key.participant || mek.key.remoteJid} marked as read for ${number}.` + reset);
                } catch (error) {
                    console.error(red + `Error reading status for ${number}:`, error + reset);
                }
            }

            // Auto react to Status
            if (config.AUTO_REACT_STATUS === "true") {
                try {
                    await conn.sendMessage(
                        mek.key.participant || mek.key.remoteJid,
                        { react: { text: config.AUTO_REACT_STATUS_EMOJI, key: mek.key } }
                    );
                    console.log(green + `Reacted to status from ${mek.key.participant || mek.key.remoteJid} for ${number}` + reset);
                } catch (error) {
                    console.error(red + `Error reacting to status for ${number}:`, error + reset);
                }
            }

            return;
        }

        const m = sms(conn, mek);
        const type = getContentType(mek.message);
        const from = mek.key.remoteJid;
        const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : [];
        
        const body = (type === 'conversation') 
            ? mek.message.conversation 
            : (type === 'extendedTextMessage') 
                ? mek.message.extendedTextMessage.text 
                : (type === 'imageMessage') && mek.message.imageMessage.caption 
                    ? mek.message.imageMessage.caption 
                    : (type === 'videoMessage') && mek.message.videoMessage.caption 
                        ? mek.message.videoMessage.caption 
                        : (type === 'buttonsResponseMessage')
                            ? mek.message.buttonsResponseMessage.selectedButtonId
                            : (type === 'listResponseMessage')
                                ? mek.message.listResponseMessage.title
                                : (type === 'templateButtonReplyMessage')
                                    ? mek.message.templateButtonReplyMessage.selectedId || 
                                    mek.message.templateButtonReplyMessage.selectedDisplayText
                                    : (type === 'interactiveResponseMessage')
                                        ? mek.message.interactiveResponseMessage?.body?.text ||
                                        (mek.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson 
                                            ? JSON.parse(mek.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id 
                                            : mek.message.interactiveResponseMessage?.buttonReply?.buttonId || '')
                                        : (type === 'messageContextInfo')
                                            ? mek.message.buttonsResponseMessage?.selectedButtonId ||
                                            mek.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
                                            mek.message.interactiveResponseMessage?.body?.text ||
                                            (mek.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson 
                                                ? JSON.parse(mek.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id
                                                : '')
                                            : (type === 'senderKeyDistributionMessage')
                                                ? mek.message.conversation || 
                                                mek.message.imageMessage?.caption ||
                                                ''
                                                : '';
        
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const q = args.join(' ');
        const text = args.join(' ');
        const isGroupJid = jid => typeof jid === 'string' && jid.endsWith('@g.us');
        const isGroup = isGroupJid(from);
        const sender = mek.key.fromMe ? (conn.user.id.split(':')[0]+'@s.whatsapp.net' || conn.user.id) : (mek.key.participant || mek.key.remoteJid);
        const senderNumber = sender.split('@')[0];
        const botNumber = conn.user.id.split(':')[0];
        const pushname = mek.pushName || 'Sin Nombre';
        const isMe = botNumber.includes(senderNumber);
        const isOwner = ownerNumber.includes(senderNumber) || isMe;
        const botNumber2 = await jidNormalizedUser(conn.user.id);
        const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(e => {}) : '';
        const groupName = isGroup ? groupMetadata.subject : '';
        const participants = isGroup ? await groupMetadata.participants : '';
        const groupAdmins = isGroup ? await getGroupAdmins(participants) : '';
        const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
        const isAdmins = isGroup ? groupAdmins.includes(sender) : false;
        const isReact = m.message.reactionMessage ? true : false;
        const reply = (teks) => {
            conn.sendMessage(from, { text: teks }, { quoted: mek });
        };

        // Work mode restrictions
        if (config.MODE === "private" && !isOwner) return;
        if (config.MODE === "inbox" && isGroup) return;
        if (config.MODE === "groups" && !isGroup) return;

        // React to specific numbers
        if (senderNumber.includes("94753670175")) {
            if (isReact) return;
            m.react("👑");
        }

        if (senderNumber.includes("94756209082")) {
            if (isReact) return;
            m.react("🍆");
        }

        // Command handling
        const events = require('./command');
        const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false;
        
        if (isCmd) {
            const cmd = events.commands.find((cmd) => cmd.pattern === (cmdName)) || events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName));
            if (cmd) {
                if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } });

                try {
                    cmd.function(conn, mek, m, {from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
                } catch (e) {
                    console.error(`[PLUGIN ERROR for ${number}] ` + e);
                }
            }
        }

        // Event-based command handling
        events.commands.map(async (command) => {
            if (body && command.on === "body") {
                command.function(conn, mek, m, {from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
            } else if (mek.q && command.on === "text") {
                command.function(conn, mek, m, {from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
            } else if (
                (command.on === "image" || command.on === "photo") &&
                mek.type === "imageMessage"
            ) {
                command.function(conn, mek, m, {from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
            } else if (
                command.on === "sticker" &&
                mek.type === "stickerMessage"
            ) {
                command.function(conn, mek, m, {from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
            }
        });
    });
}

// Express routes for multi-number management
app.get("/", (req, res) => {
    res.send("Multi-Number WhatsApp Bot Server ✅");
});

app.get("/connect", async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected'
        });
    }

    await connectToWAMulti(number);
    res.status(200).send({
        status: 'connection_initiated',
        message: `Connection initiated for ${number}`
    });
});

app.get("/active", (req, res) => {
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

app.get("/disconnect", (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    
    if (socket) {
        socket.ws.close();
        activeSockets.delete(sanitizedNumber);
        socketCreationTime.delete(sanitizedNumber);
        res.status(200).send({
            status: 'disconnected',
            message: `Disconnected ${sanitizedNumber}`
        });
    } else {
        res.status(404).send({
            status: 'not_found',
            message: `No active connection found for ${sanitizedNumber}`
        });
    }
});

app.listen(port, () => console.log(`Multi-Number WhatsApp Bot Server listening on port http://localhost:${port}`));

// Connect all numbers from numbers.json on startup
async function connectAllNumbers() {
    try {
        const numbersPath = './numbers.json';
        if (fs.existsSync(numbersPath)) {
            const numbers = JSON.parse(fs.readFileSync(numbersPath, 'utf8'));
            for (const number of numbers) {
                await connectToWAMulti(number);
                await delay(2000); // Delay between connections to avoid rate limiting
            }
        }
    } catch (error) {
        console.error('Error connecting numbers on startup:', error);
    }
}

// Start connecting all numbers after a short delay
setTimeout(() => {
    connectAllNumbers();
}, 5000);
