import fs = require("fs");
import path = require("path");

import config = require("../config");
import request = require('request');

import * as TelegramBot from 'node-telegram-bot-api';
import type { IRepositoryQuest, IRepositorySession } from "./interfaces";
import { sessionTest } from "./session/test";
import { RepositorySession } from "./repository/session";
import { sessionCreateQuest } from "./session/create-quest";
import { INLINE_RUN_QUERY_RESULT_IDENTIFIER, ManagerEngine } from "./manager/engine";
import { ManagerSession } from "./manager/session";
import { sessionPostCreateQuest } from "./session/post/create-quest";
import { ANSWER_QUEST_START_IDENTIFIER, CREATE_QUEST_START_IDENTIFIER, CALLBACK_QUERY_ANSWER_START_IDENTIFIER, INLINE_QUEST_QUERY_RESULT_IDENTIFIER, ManagerQuest, INLINE_QUERY_SHARE_START_IDENTIFIER } from "./manager/quest";
import { RepositoryQuest } from "./repository/quest";
import { sessionAnswerQuest } from "./session/answer-quest";
import { sessionPostAnswerQuest } from "./session/post/answer-quest";

let api = new TelegramBot(config.token)

let botInfo: TelegramBot.User | null = null;

export let runnerList: { type: string; program: string; }[] = [];

let maxTry = 3;
let coolDown = 60 * 1000; // +3 minute;

let quotas: Record<string, number> = {};

setInterval(function () {
    let id;
    for (id in quotas) {
        quotas[id]--;
        console.log('[info] Renewing quota for user id ' + id + ', current quota left: ' + (maxTry - quotas[id]))
        if (quotas[id] === 0) {
            delete quotas[id];
        }
    }
}, coolDown)

export const repositorySession: IRepositorySession = new RepositorySession(path.resolve(__dirname, '../', config.saves.sessions))
// export const repositoryQuestDraft: IRepositoryQuestDraft = new RepositoryQuestDraft(path.resolve(__dirname, '../', config.saves.questDrafts))
export const repositoryQuest: IRepositoryQuest = new RepositoryQuest(path.resolve(__dirname, '../', config.saves.quests))

export let managerEngine: ManagerEngine
export let managerSession: ManagerSession
export let managerQuest: ManagerQuest

fs.readdir('./docker_image/test', async function (err, files) {
    if (err) {
        console.error(err.stack || err.toString());
        process.exit(-1)
    }
    
    runnerList = files
    .filter(function (name) {
        return !!name.match(/\.json$/i);
    })
    .map(function (name) {
        return require(path.resolve('./docker_image/test', name));
    })

    const commands: TelegramBot.BotCommand[] = []
    
    runnerList.forEach(function (data) {
        commands.push({ command: data.type, description: 'run ' + data.type + ' snippet' })
        commands.push({ command: data.type + '_debug', description: 'run ' + data.type + ' snippet with debug output' })
        commands.push({ command: data.type + '_hello', description: 'run ' + data.type + '\'s Hello, World! program.' })
        commands.push({ command: data.type + '_interactive', description: 'run ' + data.type + ' in interactive mode' })
    })
    
    commands.push({ command: 'pastebin', description: 'run code snippet from pastebin' })
    commands.push({ command: 'pastebin_debug', description: 'run code snippet from pastebin with debug output' })
    commands.push({ command: 'pastebin_interactive', description: 'run code snippet from pastebin in interactive mode' })

    try {
        const data = await api.getMe()
        console.log(data);
        botInfo = data;

        // Initialize engine
        managerEngine = new ManagerEngine(runnerList, api, config)

        // Initialize sessions
        managerSession = new ManagerSession(api, repositorySession)
        managerSession.registerHandler(
            'create-quest',
            sessionCreateQuest,
            sessionPostCreateQuest
        )
        managerSession.registerHandler(
            'answer-quest',
            sessionAnswerQuest,
            sessionPostAnswerQuest
        )
        managerSession.registerHandler(
            'test',
            sessionTest
        )
        await managerSession.load()

        // Initialize quests
        managerQuest = new ManagerQuest(api, repositoryQuest)
            
        api.setMyCommands(commands).catch(catchHandle).then(() => {
            console.log(`Bot is ready - available commands: ${commands.length}`)
            api.startPolling();
        })
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})

export function catchHandle(err: { stack: any; }) {
    console.error(err.stack);
}

const pendingMessageMap: Map<number, NonNullable<ReturnType<typeof parseCommand>>> = new Map()

api.on('message', function(message) {
    // message is the parsed JSON data from telegram message
    // query is the parsed JSON data from telegram inline query
    if (!message) return;
    if (!message.from) return;
    if (!botInfo) return

    console.log(message)
    // console.log('got message');
    // console.log(message);

    const userFrom = message.from

    if (message.text != null && message.reply_to_message != null && pendingMessageMap.has(message.reply_to_message.message_id)) {
        const options: NonNullable<ReturnType<typeof parseCommand>> = pendingMessageMap.get(message.reply_to_message.message_id)!
        let additionOptions = {
            reply_to_message_id: message.message_id
        }

        let { isInteractive, isHelloWorld, isSilent, language } = options

        if (isInteractive && managerEngine.hasInteractiveSession(message.chat.id)) {
            return api.sendMessage(
                message.chat.id, 
                'Please stop current interactive runner first. (by using || to terminate)', 
                additionOptions
            ).catch(catchHandle);
        }
        
        if (quotas[message.from.id] >= maxTry) {
            return api.sendMessage(message.chat.id, 'Sorry! You are out of your quota ( ' + maxTry + ' times / ' + maxTry * coolDown / 1000 + ' second ). Please retry later.', additionOptions).catch(catchHandle);
        }
        
        quotas[message.from.id] = quotas[message.from.id] || 0;
        quotas[message.from.id]++;
        
        return managerEngine.executeCode(message, language, message.text, isHelloWorld, isSilent, isInteractive);
    }

    if (message.text != null && message.text.match(/\/start(@[^\s]+)?(\s|\n|$)/)) {
        const content = message.text.replace(/\/start(@[^\s]+)?/, '').trim()
        if (content.startsWith(ANSWER_QUEST_START_IDENTIFIER + '_')) {
            const questId = content.replace(ANSWER_QUEST_START_IDENTIFIER + '_', '')
            managerSession.start('answer-quest', message, questId)
        }

        if (content.startsWith(CREATE_QUEST_START_IDENTIFIER)) {
            managerSession.start('create-quest', message)
        }
    }
    
    if (message.text != null && message.text.match(/\/start(@[^\s]+)?$/)) {
        let additionOptions = {
            reply_to_message_id: message.message_id
        }

        api.sendMessage(message.chat.id, `
Hello, I am ${botInfo.first_name} 
You could run some code snippet with /[you favorite language]
Or run it with /[you favorite language]_debug to see debug message
Or run /[you favorite language]_hello to view hello world example
Currently supported: ${runnerList.map(function (i) {return i.type}).join(', ')}
        `, additionOptions).catch(catchHandle);
    }

    if (message.text != undefined && message.text.match(/^\/test(@[^\s]+)?$/) && message.chat.type === 'private') {
        managerSession.start('test', message)
    }

    if (message.text != undefined && message.text.match(/^\/create_quest(@[^\s]+)?$/) && message.chat.type === 'private') {
        managerSession.start('create-quest', message)
    }
    
    if (message.text != undefined && message.text.match(/^\/pastebin(_i(nteractive)?)?(_d(ebug)?)?(@[^\s]+)?(\s|\r|\n|$)/)) {
        let additionOptions = {
            reply_to_message_id: message.message_id
        }
        let temp = message.text.split(/\s|\r?\n/g);
        
        if (temp.length != 3) {
            return api.sendMessage(message.chat.id, `Usage: /pastebin(_interactive)?(_debug)? <bin id> <language>
This command will try to fetch the content of the pastebin paste and execute it.
`, additionOptions).catch(catchHandle);
        }
        
        temp[1] = temp[1].replace(/^https?:\/\/pastebin\.com\//, '');
        
        let language = temp[2];
        
        temp[0] = temp[0].replace(/(@[^\s]+)$/, '')
        let isSilent = !temp[0].match(/_d(ebug)?$/);
        temp[0] = temp[0].replace(/_d(ebug)?$/, '');
        let isInteractive = !!temp[0].match(/_i(nteractive)?$/);
        
        if (runnerList.filter(function (info) {
            return info.type === language
        }).length === 0) {
            return;
        }
        
        if (isInteractive && managerEngine.hasInteractiveSession(message.chat.id)) {
            return api.sendMessage(
                message.chat.id, 
                'Please stop current interactive runner first. (by using || to terminate)', 
                additionOptions
            ).catch(catchHandle);
        }

        console.log(isSilent, isInteractive)
        
        request('https://pastebin.com/raw/' + temp[1], function (error, response, body) {
            if (error) {
                return api.sendMessage(message.chat.id, error.message || error.stack, additionOptions).catch(catchHandle);
            }
            
            if (response.statusCode !== 200) {
                return api.sendMessage(message.chat.id, `Bad status code: ${response.statusCode}`, additionOptions).catch(catchHandle);
            }
            
            if (quotas[userFrom.id] >= maxTry) {
                return api.sendMessage(message.chat.id, 'Sorry! You are out of your quota ( ' + maxTry + ' times / ' + maxTry * coolDown / 1000 + ' second ). Please retry later.', additionOptions).catch(catchHandle);
            }

            if (isInteractive && managerEngine.hasInteractiveSession(message.chat.id)) {
                return api.sendMessage(
                    message.chat.id, 
                    'Please stop current interactive runner first. (by using || to terminate)', 
                    additionOptions
                ).catch(catchHandle);
            }
            
            quotas[userFrom.id] = quotas[userFrom.id] || 0;
            quotas[userFrom.id]++;
        
            managerEngine.executeCode(message, language, body, false, isSilent, isInteractive);
        })
        
        return;
    }
    
    if (message.text != undefined && message.text.match(/^\/[a-z0-9_]+(@[^\s]+)?(\s|\r|\n|$)/)) {
        let additionOptions = {
            reply_to_message_id: message.message_id
        }

        const options = parseCommand(message.text)

        if (options == null) return

        let { isInteractive, isHelloWorld, isSilent, language, text } = options

        if (isInteractive && managerEngine.hasInteractiveSession(message.chat.id)) {
            return api.sendMessage(
                message.chat.id, 
                'Please stop current interactive runner first. (by using || to terminate)', 
                additionOptions
            ).catch(catchHandle);
        }
        
        if (isHelloWorld) {
            text = runnerList.filter(function (info) {
                return info.type === language
            })[0].program;
        }
        
        if (text.match(/^[\s\r\n]*$/)) {
            api.sendMessage(message.chat.id, 'Ok. Now send me the code.', {
                ...additionOptions,
                reply_markup: {
                    force_reply: true,
                    selective: true
                }
            })
            .then(msg => {
                pendingMessageMap.set(msg.message_id, options)
            })
            .catch(catchHandle);
            return;
        }
        
        if (quotas[message.from.id] >= maxTry) {
            return api.sendMessage(message.chat.id, 'Sorry! You are out of your quota ( ' + maxTry + ' times / ' + maxTry * coolDown / 1000 + ' second ). Please retry later.', additionOptions).catch(catchHandle);
        }
        
        quotas[message.from.id] = quotas[message.from.id] || 0;
        quotas[message.from.id]++;
        
        return managerEngine.executeCode(message, language, text, isHelloWorld, isSilent, isInteractive);
    }
    
    if (message.text != undefined && message.text.match(/^\|/) && managerEngine.hasInteractiveSession(message.chat.id)) {
        if (message.text === '||') {
            managerEngine.terminateStdin(message.chat.id, message)
        } else {
            managerEngine.sendStdin(message.chat.id, message.text.replace(/([^\n])$/, '$1\n').replace(/^\|/, ''))
        }
    }
})

api.on('inline_query', async (message) => {
    if (message.query.trim() === '') {
        const results = await managerQuest.createQuestList(message)
        api.answerInlineQuery(message.id, results, {
            cache_time: 0,
            is_personal: true,
            switch_pm_text: 'Create a new quest',
            switch_pm_parameter: CREATE_QUEST_START_IDENTIFIER
        }).catch(catchHandle)
        return
    }

    if (message.query.startsWith(INLINE_QUERY_SHARE_START_IDENTIFIER + ':')) {
        const id = message.query.replace(INLINE_QUERY_SHARE_START_IDENTIFIER + ':', '')
        const results = await managerQuest.createQuestListFromId(id)
        api.answerInlineQuery(message.id, results, {
            cache_time: 0,
            is_personal: true
        }).catch(catchHandle)
        return
    }

    const results: TelegramBot.InlineQueryResultArticle[] = []

    for (let runner of runnerList) {
        results.push({
            id: INLINE_RUN_QUERY_RESULT_IDENTIFIER + runner.type,
            type: 'article',
            title: runner.type,
            input_message_content: {
                message_text: 'Compiler bot: Starting the worker...',
                parse_mode: 'HTML',
                disable_web_page_preview: true
            },
            reply_markup: {
                inline_keyboard: [[{ text: 'A useless button', callback_data: 'nonse' }]]
            }
        })
    }
    

    api.answerInlineQuery(message.id, results).catch(catchHandle)
})

api.on('chosen_inline_result', result => {
    if (result.result_id && result.result_id.startsWith(INLINE_RUN_QUERY_RESULT_IDENTIFIER)) {
        // remove the useless button
        api.editMessageText('Compiler bot: Starting the worker...', {
            inline_message_id: result.inline_message_id!
        }).catch(catchHandle)

        managerEngine.executeCodeInline(result)
    }

    if (result.result_id && result.result_id.startsWith(INLINE_QUEST_QUERY_RESULT_IDENTIFIER)) {
        managerQuest.handleChosenInlineResult(result)
    }
})

api.on('callback_query', (message) => {
    if (
        message.data?.startsWith(CALLBACK_QUERY_ANSWER_START_IDENTIFIER + ':')
    ) {
        const queryId = message.data?.replace(CALLBACK_QUERY_ANSWER_START_IDENTIFIER + ':', '')
        
        api.answerCallbackQuery(message.id, {
            url: `https://t.me/${botInfo!.username!}?start=${ANSWER_QUEST_START_IDENTIFIER}_${queryId}`
        })

        return
    }
})

function parseCommand (text: string) {
    let languageArr = (/^\/([a-z0-9_]+)(?:@[^\s]+)?(?: |\r|\n|$)/).exec(text)

    if (!languageArr) {
        return null
    }

    let language = languageArr[1];
    
    let isSilent = !language.match(/_d(ebug)?$/);
    language = language.replace(/_d(ebug)?$/, '');
    
    let isInteractive = !!language.match(/_i(nteractive)?$/);
    language = language.replace(/_i(nteractive)?$/, '');
    
    let isHelloWorld = !!language.match(/_h(ello)?$/);
    language = language.replace(/_h(ello)?$/, '');
    
    if (!runnerList.find(info => info.type === language)) {
        return null
    }

    let commandText = text.replace(/\/[a-z0-9_]+(@[^\s]+)?\s?/, '');

    return {
        text: commandText,
        language,
        isSilent,
        isInteractive,
        isHelloWorld
    }
}