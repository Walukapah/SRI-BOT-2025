const config = require('../config')
const {cmd, commands} = require('../command')

cmd({
    pattern: "alive",
    desc: "Check bot online or no.",
    category: "main",
    filename: __filename
},
async(conn, mek, m, {from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
    try {
        // Send message with buttons
        return await conn.sendMessage(from, {
            image: {url: config.ALIVE_IMG},
            caption: config.ALIVE_MSG,
            buttons: [
                {
                    buttonId: `${config.PREFIX}ping`,
                    buttonText: {displayText: '🏓 Ping'},
                    type: 1
                },
                {
                    buttonId: `${config.PREFIX}menu`,
                    buttonText: {displayText: '📜 Menu'},
                    type: 1
                },
                {
                    buttonId: `${config.PREFIX}owner`,
                    buttonText: {displayText: '👑 Owner'},
                    type: 1
                }
            ],
            footer: `${config.BOT_NAME}`,
            headerType: 4
        }, {quoted: mek})
        
    } catch(e) {
        console.log(e)
        reply(`${e}`)
    }
})
