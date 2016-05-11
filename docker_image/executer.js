const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: fs.createWriteStream('/dev/null')
});

rl.on('line', (cmd) => {
  main(cmd)
});

function guidGenerator() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}
function createLogger (type, willKill, language, id) {
  return function (info) {
    if (info instanceof Buffer) {
      info = info.toString('utf8')
    } else if (String(info) !== info) {
      info = JSON.stringify(info, null, 4);
    }
    console.log(JSON.stringify({
      type: type,
      text: info,
      language: language,
      id: id
    }))
    if (willKill) {
      process.exit(-1);
    }
  }
}
var con = global.con = {
  stdout: createLogger('stdout'),
  stderr: createLogger('stderr'),
  log: createLogger('log'),
  error: createLogger('error'),
  status: createLogger('status'),
  throw: createLogger('throw', true),
  exit: createLogger('exit'),
  createNamedLogger: function (language, id) {
    language = language || 'unknown'
    id = id || guidGenerator()
    return {
      stdout: createLogger('stdout', false, language, id),
      stderr: createLogger('stderr', false, language, id),
      log: createLogger('log', false, language, id),
      error: createLogger('error', false, language, id),
      status: createLogger('status', false, language, id),
      throw: createLogger('throw', true, language, id),
      exit: createLogger('exit', false, language, id),
    }
  }
}

function main (input) {
  // console.log(input.toString('utf8'));
  
  var parsedCommnad = JSON.parse(input);
  
  if (parsedCommnad.encoding) {
    switch (parsedCommnad.encoding) {
      case 'base64':
        input.program = new Buffer(input.program, 'base64');
        break;
      default:
        // throw new Error('bad encoding', parsedCommnad.encoding)
        con.throw('bad encoding', parsedCommnad.encoding)
    }
  }
  
  var myConsole = con.createNamedLogger(parsedCommnad.type);
  
  var folder = path.resolve(process.env.HOME, 'runner-' + Date.now())
  fs.mkdirSync(folder);
  // myConsole.log(parsedCommnad);
  try {
    var runner = require('./runner/' + parsedCommnad.type)
  } catch (e) {
    return myConsole.error('cannot find runner for ' + parsedCommnad.type + ', aborted.')
  }
  myConsole.status('setting up')
  runner.setup(folder, parsedCommnad.program, function (file_path) {
    // myConsole.log('setup finished');
    myConsole.status('executing')
    runner.execute(file_path, function (child) {
      myConsole.log('starting process with file ' + file_path);
      child.stdout.on('data', myConsole.stdout);
      child.stderr.on('data', myConsole.stderr);
      child.on('exit', function (code, sig) {
        myConsole.status('exited')
        myConsole.exit({code: code, signal: sig});
        myConsole.log('child exit with code ' + code + ' and signal ' + sig)
        // process.exit();
      })
    })
  })
}