const Discord = require('discord.js');
const fs = require("fs");
const con = require('./config/database')
const bot = new Discord.Client();
const Badwords = require("./jsons/fiterWords.json");
const log = require('./config/logger.js');
const swearLog = require('./config/swearLogger');
require('dotenv').config();
var StatsD = require('hot-shots');
var dogstatsd = new StatsD();
const ZBC = process.env.GUILD_ZBC;

bot.commands = new Discord.Collection();
bot.aliases = new Discord.Collection();


fs.readdir("./command/", (err, files) => {
    if (err) console.log(err);
    let jsfile = files.filter(f => f.split(".").pop() === "js")
    if (jsfile.length <= 0) {
        console.log("명령어를 찾지 못했어요...");
        return;
    }
    jsfile.forEach((f, i) => {
        let props = require(`./command/${f}`);
        console.log(`[ ${f} ] load Complete`);
        bot.commands.set(props.help.name, props);
        props.help.aliases.forEach(alias => {
            bot.aliases.set(alias, props.help.name)
        })
    });
});


function generatexp() {
    let min = 1;
    let max = 5;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}


bot.on('ready', () => {
    console.log(`┌────────────────────────────┐`);
    console.log(`│ 봇 ${bot.user.username}이 작동 시작합니다!│`);
    console.log(`└────────────────────────────┘`);
    let statuses = [
        `!help`,
        `문의 : MCHDF#9999`,
        `길드 : ${bot.guilds.cache.size}개`,
        `유저 : ${bot.guilds.cache.reduce((a, b) => a + b.memberCount, 0)}명`,
        `채널 : ${bot.channels.cache.size}개`,
        `MCprefix로 서버별 접두사 확인`
    ]
    let value = 0;
    setInterval(function () {
        let status = statuses[value];
        value++;
        if (value >= statuses.length) {
            value = 0;
        }
        bot.user.setActivity(status, { type: "PLAYING" });
        
    }, 3000);
});


bot.on('guildCreate', (guild) => {
    
    log.info(`MCBOT이 새로운 길드에 초대됨. 길드 : ${guild.name}`);
    try {
        con.query(`INSERT INTO Guilds (guildId, GuildOwnerId) VALUES('${guild.id}', ${guild.ownerID});`);
        con.query(`INSERT INTO GuildConfigurable (guildId) VALUES('${guild.id}');`);
    } catch (err) {
        log.error(`Error while joining guild ${err}`)
    }
});


bot.on('guildDelete', async (guild) => {
    
    log.info(`MCBOT이 길드에서 퇴장됨. 길드 : ${guild.name}`);
    try {
        await con.query(`DELETE FROM Guilds WHERE guildId = '${guild.id}';`);
        await con.query(`DELETE FROM xp WHERE guildId = '${guild.id}';`);
        await con.query(`DELETE FROM GuildConfigurable WHERE guildId = '${guild.id}';`);
    } catch (err) {
        log.error(`Error while exiting guild ${err}`)
    }
})


bot.on('message', async message => {

    if (message.author.bot) return;
    if (message.channel.type === 'dm') return;

    let prefixSet = JSON.parse(fs.readFileSync('./jsons/prefixSet.json', 'utf-8'));

    if (!prefixSet[message.guild.id]) {
        prefixSet[message.guild.id] = {
            prefixSet: '!'
        };
    }

    let prefix = prefixSet[message.guild.id].prefixSet;

    let messageArray = message.content.split(" ");
    let cmd = messageArray[0];
    let args = messageArray.slice(1);

    let filterwords = Badwords.BADWORDS;
    let zbcFilter = Badwords.BADWORDS_zbc;
    let msgURL = Badwords.msgURL;
    let foundText = false;

    // 서버 멤버 카운트
    let Guild = message.guild.id;
    con.query(`select * from GuildConfigurable where guildId = '${Guild}';`, (err, rows) => {
        if (err) throw err;
        let guildId = rows[0].guildId;
        let Count = rows[0].Count;
        let ChName = rows[0].CountChName;
        if (!Count) {
            return;
        }
        let myGuild = bot.guilds.cache.get(`${guildId}`);
        let memberCount = myGuild.memberCount;
        let memberCountChannel = myGuild.channels.cache.get(`${Count}`);
        if (!ChName) {
            memberCountChannel.setName('멤버 수 : ' + memberCount);
        } else {
            memberCountChannel.setName(`${ChName} : ` + memberCount);
        }
    });
    //─────────────────────────────────────────────────────────────────────────────────────────────────────────────
    // 욕설 필터링
    let messagechid = message.channel.id;

    function filterLog(find) {
        if (find) {
            con.query(`SELECT * FROM Guilds WHERE guildId = '${message.guild.id}';`, (err, rows) => {
                if (err) throw err;
                let exceptionCh = rows[0].exceptionCh;
                let logCh = rows[0].logCh;
                if (!exceptionCh) {
                    return;
                }
                if (messagechid === exceptionCh) {
                    return;
                } else {
                    swearLog.info(`\`${message.guild.name}\`의 '${message.channel.name}'에서 '${message.author.username}'님이 단어 '${message.content}'를(을) 사용하여 필터링 됨`)

                    let ch = bot.channels.cache.get(`${logCh}`);

                    if (!logCh) {
                        message.delete();
                        return message.reply("(이쁜말)");
                    } else {
                        let embed = new Discord.MessageEmbed()
                            .setTitle("욕설 필터링")
                            .setDescription(`\`${message.author.username}\`님이 욕설을 사용하였습니다.`)
                            .setColor("RED")
                            .setTimestamp()
                            .addField("[ 사용 단어 ]", `${message.content}`)
                            .addField("[ 태그 ]", `<@${message.author.id}>`)
                        ch.send(embed);
                        message.delete();
                        return message.reply("(이쁜말)");
                    }
                }
            });
        }
    }

    if (message.guild.id === ZBC) {
        for (var i in zbcFilter) {
            if (message.content.toLowerCase().includes(zbcFilter[i].toLowerCase())) {
                foundText = true;
            }
        }

        for (var k in msgURL) {
            if (message.content.toLowerCase().includes(msgURL[k].toLowerCase())) {
                foundText = false;
            }
        }

        filterLog(foundText);

    } else {
        for (var i in filterwords) {
            if (message.content.toLowerCase().includes(filterwords[i].toLowerCase())) {
                foundText = true;
            }
        }

        for (var k in msgURL) {
            if (message.content.toLowerCase().includes(msgURL[k].toLowerCase())) {
                foundText = false;
            }
        }

        filterLog(foundText);

    }
    //─────────────────────────────────────────────────────────────────────────────────────────────────────────────

    //xp 시스템
    con.query(`SELECT * FROM xp WHERE guildId = '${message.guild.id}' AND id = '${message.author.id}';`, (err, rows) => {
        if (err) throw err;

        if (rows.length < 1) {
            let name = message.author.username;
            name = name.replace(`'`, "\\'");
            name = name.replace(`"`, '\\"');
            con.query(`INSERT INTO xp (guildId, id, xp, name) VALUES ('${message.guild.id}', '${message.author.id}', ${generatexp()}, '${name}');`);
        } else {
            let xp = rows[0].xp;
            let lvl = rows[0].lvl;
            con.query(`UPDATE xp Set xp = ${xp + generatexp()} WHERE guildId = '${message.guild.id}' AND id = '${message.author.id}';`);

            let nxtlvl = lvl * 300

            if (nxtlvl <= xp) {
                con.query(`UPDATE xp SET xp = 0 WHERE guildId = '${message.guild.id}' AND id = ${message.author.id};`);
                con.query(`UPDATE xp SET lvl = ${lvl + 1} WHERE guildId = '${message.guild.id}' AND id = ${message.author.id};`);
                let embed = new Discord.MessageEmbed()
                    .setTitle('[ Level UP! ]')
                    .setAuthor(`${message.author.tag}`)
                    .setColor('#44f947')
                    .setTimestamp(message.createAt)
                if (!message.guild.id == ZBC) {
                    message.channel.send(embed);
                }
            }
        }
    });

    if (message.content === 'MCprefix') {
        return message.channel.send(`:bulb: 현재 서버의 접두사는 \`${prefix}\` 입니다!`);
    }
    if (message.content === prefix) {
        return;
    }
    if (!message.content.startsWith(prefix)) {
        return;
    }

    let commandfile = bot.commands.get(cmd.slice(prefix.length)) || bot.commands.get(bot.aliases.get(cmd.slice(prefix.length)));
    if (commandfile) {
        // Increment a counter.
        dogstatsd.increment('mcbot.use.command');
        if (message.author.id != (await bot.fetchApplication()).owner.id) {
            if (message.guild.id == ZBC && message.channel.id != "802747916296912933") {
                message.delete();
                return message.channel.send("봇 전용 채널에서 사용해주세요! <#802747916296912933>");
            }
        }
        commandfile.run(bot, message, args, con, prefix);
        log.info(`${message.author.username} uses command '${cmd.slice(prefix.length)}' in ${message.guild.name}`);
    }
});


bot.on('guildMemberAdd', member => {

    if (member.guild.id === "534586842079821824") {
        return;
    }
    let Guild = member.guild.id;
    con.query(`SELECT * FROM Guilds WHERE guildId = '${member.guild.id}';`, (err, rows) => {
        let logCh = rows[0].logCh;
        let ch = bot.channels.cache.get(`${logCh}`);
        let avatar = member.user.avatarURL({ size: 1024 });

        if (!logCh) {
            return;
        } else {
            let embed = new Discord.MessageEmbed()
                .setTitle('환영합니다!')
                .setColor('#37E51C')
                .setTimestamp()
                .setThumbnail(avatar)
                .setFooter(`${member.guild.name}`)
                .addField('[ 유저 이름 ]', `<@${member.user.id}>`)
                .addField('[ 유저 태그 ]', member.user.tag)
            ch.send(embed);
        }
        let autoRole = rows[0].autoRole;
        if (!autoRole) {
            return;
        } else {
            member.roles.add(autoRole);
        }
    });
    // 서버 멤버 카운트
    con.query(`select * from GuildConfigurable where guildId = '${Guild}';`, (err, rows) => {
        if (err) throw err;
        let guildId = rows[0].guildId;
        let Count = rows[0].Count;
        let ChName = rows[0].CountChName;
        if (!Count) {
            return;
        }
        let myGuild = bot.guilds.cache.get(`${guildId}`);
        let memberCount = myGuild.memberCount;
        let memberCountChannel = myGuild.channels.cache.get(`${Count}`);
        if (!ChName) {
            memberCountChannel.setName('멤버 수 : ' + memberCount);
        } else {
            memberCountChannel.setName(`${ChName} : ` + memberCount);
        }

    });
});


bot.on('guildMemberRemove', member => {

    if (member.guild.id === "534586842079821824") {
        return;
    }
    let Guild = member.guild.id;
    con.query(`DELETE FROM xp WHERE id = '${member.id}';`);
    con.query(`SELECT * FROM Guilds WHERE guildId = '${member.guild.id}';`, (err, rows) => {
        let logCh = rows[0].logCh;
        let ch = bot.channels.cache.get(`${logCh}`);
        let avatar = member.user.avatarURL({ size: 1024 });
        if (!logCh) {
            return;
        } else {
            let embed = new Discord.MessageEmbed()
                .setTitle('안녕히 가세요!')
                .setColor('#ff0000')
                .setTimestamp()
                .setThumbnail(avatar)
                .setFooter(`${member.guild.name}`)
                .addField('[ 유저 이름 ]', `<@${member.user.id}>`)
                .addField('[ 유저 태그 ]', member.user.tag)
            ch.send(embed);
        }
    });
    con.query(`select * from GuildConfigurable where guildId = '${Guild}';`, (err, rows) => {
        if (err) throw err;
        let guildId = rows[0].guildId;
        let Count = rows[0].Count;
        let ChName = rows[0].CountChName;
        if (!Count) {
            return;
        }
        let myGuild = bot.guilds.cache.get(`${guildId}`);
        let memberCount = myGuild.memberCount;
        let memberCountChannel = myGuild.channels.cache.get(`${Count}`);
        if (!ChName) {
            memberCountChannel.setName('멤버 수 : ' + memberCount);
        } else {
            memberCountChannel.setName(`${ChName} : ` + memberCount);
        }
    });
});


bot.on('guildMemberUpdate', member => {

    let memid = member.id;
    let memname = member.user.username;

    memname = memname.replace(`'`, "\\'");
    memname = memname.replace(`"`, '\\"');
    try {
        con.query(`SELECT * FROM xp WHERE id = '${memid}';`, (err, rows) => {
            if (err) throw err;
            if (rows.length < 1) {
                return;
            } else {
                con.query(`UPDATE xp Set name = \'${memname}\' WHERE id = '${memid}';`);
                return;
            }
        })
        con.query(`SELECT * FROM warnUser WHERE Id = '${memid}';`, (err, rows) => {
            if (err) throw err;
            if (rows.length < 1) {
                return;
            } else {
                con.query(`UPDATE warnUser SET name = \'${memname}\' WHERE Id = '${memid}';`);
                return;
            }
        })
    } catch (error) {
        return error;
    }
});


bot.login(process.env.MCBOT_TOKEN);
