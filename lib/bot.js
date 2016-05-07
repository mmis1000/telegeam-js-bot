var config = require("../config");
var TGAPI = require("./tgapi")

var api = new TGAPI(config.token)

var child_process = require("child_process");
var spawn = child_process.spawn;

var botInfo = null;

api.getMe(function(err, data)
{
    if (err) console.error(err);
    console.log(data);
    botInfo = data;
    api.startPolling(40);
});

api.on('message', function(message) {
    // message is the parsed JSON data from telegram message
    // query is the parsed JSON data from telegram inline query
    console.log('got message');
    console.log(message);
    
    // message.text is the text user sent (if there is)
    var text = message.text;
    
    // if there is the text
    if (message.text != undefined && message.text.match(/\/js(@[^\s]+)?( |\r|\n)+./)) {
        // echo the text back
        var text = message.text.replace(/\/js(@[^\s]+)?/, '');
        api.sendMessage(message.chat.id, 'running... ' + text);
        var p = spawn('docker', [
            'run', 
            '--rm', 
            '--net=none',
            '-m=500M',
            'mmis1000/test:v4',
            'nodejs',
            '-p',
            '-e',
            text
        ]);
        p.stdout.setEncoding('utf8');
        p.stderr.setEncoding('utf8');
        p.stdout.on('data', function (text) {
            api.sendMessage(message.chat.id, 'stdout: ' + text);
        }).pipe(process.stdout)
        p.stderr.on('data', function (text) {
            api.sendMessage(message.chat.id, 'stderr: ' + text);
        }).pipe(process.stderr)
        p.on('exit', function () {
            p.exited = true;
        })
        
        setTimeout(function () {
            if (!p.exited) {
                api.sendMessage(message.chat.id, 'killed due to timeout');
                p.kill('SIGKILL')
            }
        }, 10000)
    }
    
})