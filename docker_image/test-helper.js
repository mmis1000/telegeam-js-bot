const readline = require('readline');

module.exports = {
    /**
     * 
     * @param {import('stream').Readable} stdout 
     */
    hookStdout: function (stdout) {
        const rl = readline.createInterface({
            input: stdout
        });
        rl.on('line', function (line) {
            try {
                var parsedCommnad = JSON.parse(line)
                console.log(parsedCommnad.type + ':');
                delete parsedCommnad.type;
                Object.keys(parsedCommnad).forEach(function (key) {
                    console.log('  ' + (key + '        ').slice(0, 8) + ': ' + 
                        ('' + parsedCommnad[key] || ' ').split(/\r?\n/g).filter((i)=>!!i).map(function (line) {
                            // @ts-ignore
                            return line.match(/.{1,70}/g).join('\r\n            ')
                        }).join('\r\n            ')
                    );
                })
            } catch (e) {
                console.error(e.stack || e.message || e);
            }
        })
    }
}