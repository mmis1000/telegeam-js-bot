const fs = require("fs");
const path = require("path");

fs.readdir('./test', function (err, names) {
    if (err) {
        return console.error(err.stack);
    }
    names = names.filter(function (name) {
        if (!name.match(/\.json$|\.templete$/)) console.error('found a file that neiter a templete and a json: ' + name)
        return /\.templete$/.test(name);
    })
    names.forEach(function (name) {
        fs.readFile(path.resolve('./test', name), function (err, data) {
            if (err) {
                return console.error(name + ': ' + err.stack);
            }
            data = data.toString('utf8');
            console.log('generated ' + name.replace(/\.templete$/, '.json'));
            fs.writeFile(path.resolve('./test', name.replace(/\.templete$/, '.json')), JSON.stringify({
                type: name.replace(/\.templete$/, ''),
                program: data
            }) + '\n', function (err) {
                if (err) {
                    return console.error(name + ': ' + err.stack);
                }
            })
        })
    })
})