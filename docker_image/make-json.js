const fs = require("fs");
const path = require("path");

fs.readdir('./test', function (err, names) {
    if (err) {
        return console.error(err.stack);
    }
    names = names.filter(function (name) {
        if (!name.match(/\.json$|\.template$/)) console.error('found a file that neiter a templete and a json: ' + name)
        return /\.template$/.test(name);
    })
    names.forEach(function (name) {
        fs.readFile(path.resolve('./test', name), { encoding: 'utf-8' } ,function (err, data) {
            if (err) {
                return console.error(name + ': ' + err.stack);
            }

            console.log('generated ' + name.replace(/\.template$/, '.json'));
            fs.writeFile(path.resolve('./test', name.replace(/\.template$/, '.json')), JSON.stringify({
                type: name.replace(/\.template$/, ''),
                program: data
            }) + '\n', function (err) {
                if (err) {
                    return console.error(name + ': ' + err.stack);
                }
            })
        })
    })
})