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

function createLogger (type, willKill) {
  return function (info) {
    if (info instanceof Buffer) {
      info = info.toString('utf8')
    } else if (String(info) !== info) {
      info = JSON.stringify(info, null, 4);
    }
    console.log(JSON.stringify({
      type: type,
      text: info
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
  throw: createLogger('throw', true)
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
  
  var folder = path.resolve('/tmp', 'runner-' + Date.now())
  fs.mkdirSync(folder);
  // con.log(parsedCommnad);
  
  var runner = require('./runner/' + parsedCommnad.type)
  
  con.status('setting up')
  runner.setup(folder, parsedCommnad.program, function (file_path) {
    // con.log('setup finished');
    con.status('executing')
    runner.execute(file_path, function (child) {
      con.log('starting process with file ' + file_path);
      child.stdout.on('data', con.stdout);
      child.stderr.on('data', con.stderr);
      child.on('exit', function (code, sig) {
        con.status('exited')
        con.log('child exit with code ' + code + ' and signal ' + sig)
        // process.exit();
      })
    })
  })
}