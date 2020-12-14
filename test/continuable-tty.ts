
import * as readline from 'readline';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { BaseContinuableContext } from '../lib/interfaces';

import * as Typeson from 'typeson-registry/dist/all.js';

const {presets: {structuredCloningThrowing}} = Typeson;

const tson = new Typeson().register([
    structuredCloningThrowing
]);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const methods = {
    log: console.log
}

const methodsContinuable = {
    async prompt (ctx: BaseContinuableContext, question: string) {
        const log = ctx.wrap(console.log)
        const ask = ctx.wrap(() => new Promise<string>((r) => {
            rl.question('', (answer) => {
                r(answer)
            });
        }))

        log(question)
        return ask()
    },
    async select (ctx: BaseContinuableContext, question: string, options: string[]) {
        const log = ctx.wrap(console.log)

        log(question + '\n' + options.map((s, i) => `${i + 1}. ${s}`).join(', '))

        const poll = () => new Promise((r) => {
            rl.question('', (answer) => {
                r(answer)
            });
        })

        const getAnswer = ctx.wrap(async () => {
            let res = null
            let valid = false
            do {
                res = await poll()
                if (options[Number(res) - 1] == null) {
                    console.log('please answer 1 to ' + options.length)
                    valid = false
                } else {
                    valid = true
                }
            } while (!valid)

            return options[Number(res) - 1]
        })

        return getAnswer()
    },
}

const filename = resolve(__dirname, 'test.log')

import { runContinuable } from '../lib/utils/continuable';

let oldData = null

try {
    oldData = tson.parse(readFileSync(filename, {encoding: 'utf-8'}))
} catch (err) {}

runContinuable(async ({ prompt, select, log }) => {
    const name = await prompt('what is your name?\n')

    const option = await select('what is your favorite language', ['nodejs', 'ruby'])
    log(name + '\'s favorite language is ' + option)

    const option2 = await select('what is your favorite', ['apple', 'orange'])
    log(name + '\'s favorite fruit is ' + option2)

    let items = []
    let res

    do {
        res = await prompt('Enter a item or `exit`?\n')
        if (res !== 'exit') {
            items.push(res)
        }
    } while (res !== 'exit')

    log('All items: ' + items.join(', '))
}, methods, methodsContinuable, oldData, (state) => {
    writeFileSync(filename, tson.stringify(state, undefined, 4))
})
.catch(() => {})
.then(() => {
    rl.close()
    unlinkSync(filename)
})