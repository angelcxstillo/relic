#! /usr/bin/env node
try {
    new Function('var {a} = {a: 1}')();
} catch (error) {
    console.error('Your JavaScript runtime does not support some features used by the `rc` command. Please use Node 6 or later.');
    process.exit(1);
}

var timestamp = Date.now();

var bold, ts, green, red, reset, yellow, redb, yellowb, greenb, c, d, handle, cfg, tsNotAvailable;

import fs from 'fs';
import path from 'path';
import Relic from '../index.js';
import { throwSyntaxError } from '../lib/helpers.js';
import readline from 'readline';
import yargs from 'yargs';

const cli = yargs(process.argv.slice(2))
    .scriptName("rc")
    .usage("Usage: -map <path> | -compile <path> | -dir <folder> <destination>")
    .command('-c <file>', 'Compile a Relic file into a JavaScript file storing it in the same folder.')
    .command('-d <folder> <destination>', 'Compile multiple Relic files within a folder and output them in a destination folder')
    .array('-d')
    .string('-c')
    .alias({
        "-c": ["--c"],
        "-d": ['--d']
    })

const options = cli.argv, rcconfig = fs.existsSync(path.join(process.cwd(), 'rcconfig.json')) || fs.existsSync(path.join(process.cwd(), '.rcconfig'));

if (!(Object.keys(options).length > 2 || rcconfig)) {
    cli.showHelp()
} else {
    (async function () {
        bold = red = green = yellow = reset = redb = greenb = yellowb = '';

        const cwd = process.cwd();

        if (!process.env.NODE_DISABLE_COLORS) {
            bold = '\x1B[0;1m';
            red = '\x1B[0;31m';
            green = '\x1B[0;32m';
            yellow = '\x1B[0;33m';
            redb = '\x1B[1;31m';
            greenb = '\x1B[1;32m';
            yellowb = '\x1B[1;33m';
            reset = '\x1B[0m';
        }

        // Options parsing
        let opts = {}, args = process.argv.slice(2).concat('--cfg');

        handle = () => {
            let waitlist = [];
            for (let _i in args) {
                let arg = args[_i];
                if (arg === "--m") {
                    waitlist.push(_i);
                    opts.sourceMaps = true;
                } else if (arg === "--M") {
                    waitlist.push(_i);
                    opts.sourceMaps = true;
                    opts.inlineMap = true;
                } else if (arg === "--w") {
                    waitlist.push(_i);
                    opts.wrapSafe = true;
                } else if (arg === "--ms") {
                    waitlist.push(_i);
                    opts.debugMS = true;
                }
            }

            if (waitlist.length) {
                waitlist.map((i) => {
                    delete args[i];
                });
                args = args.filter(arg => typeof arg !== "undefined");
            }

            if (args[0] && !/^(--?([cd]|cfg))$/.test(args[0])) {
                opts.sourceMaps = true;
                opts.inlineMap = true;
                // run(...args);
            } else {
                let command = args[0];
                switch (command) {
                    case "--d":
                    case "-d": {
                        d(args.slice(1));
                        break;
                    }
                    case "--c":
                    case "-c": {
                        c(args[1]);
                        break;
                    };
                    case "--cfg": {
                        cfg().catch(err => {
                            console.log(err);
                        });
                        break;
                    }
                }
            }

            if (opts.debugMS) {
                process.on('beforeExit', () => {
                    let ms = Date.now() - timestamp;

                    process.stdout.write(`${yellow}Process ended: took ${ms}ms${reset}\n`);
                })
            }
        }

        // file, source file, destination, stream output, rename, no write, extra variable
        c = (f, s = '', _d, st, r, n, e) => {
            let content, file, generatedFile, output, sourceMap, isELSON, sources;

            if (f.split(/\\|\//g).length > 1) {
                s = path.join(s, path.dirname(f));
                f = path.basename(f);
            }

            file = s ?
                path.join(cwd, s, f)
                :
                path.join(cwd, f)


            if (!st && fileIsDir(s ? path.join(s, f) : f)) {
                if (!fs.existsSync(file.replace(/(\\|\/)$/, '') + (file.endsWith('.rc') ? '' : '.rc')) || !fs.existsSync(file.replace(/(\\|\/)$/, '') + (file.endsWith('.trc') ? '' : '.trc'))) {
                    let same = s ? path.join(s, f) : f;
                    let msg = `${yellowb}WARN:${reset} ${bold}Given path is a folder, do you want to compile all folder files instead? (y/n)${reset}\n> `;

                    let rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    })

                    rl.question(msg, function (ans) {
                        rl.close();
                        switch (true) {
                            case /^y(es)?$/i.test(ans): {
                                return d([same, same]);
                            };
                            case /^n(o)?$/i.test(ans): {
                                return;
                            };
                            default: {
                                process.stdout.write(`${yellow}UNKNOWN:${reset} ${bold}Response must be y/n or yes/no. Closing.${reset}\n`)
                                return;
                            }
                        }
                    });
                    return;
                }
            }

            var exists = fs.existsSync(file);
            if (!e && !exists) {
                return c(f + '.trc', s, _d, st, r, n, 1);
            } else if (e === 1 && !exists) {
                return c(f.replace(/\.trc$/, '.rc'), s, _d, st, r, n, 2);
            }

            try {
                content = fs.readFileSync(file, { encoding: 'utf-8' });
            } catch (err) {
                process.stdout.write(`${red}ERROR:${reset} File not found --> ${file}\n`);
                return;
            }

            isELSON = f.endsWith('.ron');
            generatedFile = r ? f.replace(/\.(r(c|on)|trc)$/, r) : f + (isELSON ? '.json' : '.js');

            var isTypeScript, isJSX, mainOpts = {
                filename: path.join(s || '', f),
                generatedFile: n ? '<anonymous>' : generatedFile.split(/\/|\\/g).pop(),
                dirname: path.join(cwd, s || ''),
                src: file
            }

            if ((opts.isTypeScript || f.endsWith('.trc')) && !opts.omitTypeScript) {
                isTypeScript = true;
            }

            ({ output, sourceMap, sources, isTypeScript, isJSX } = Relic.compile(content, {
                ...mainOpts,
                ...opts,
                isELSON,
                isTypeScript,
                sourceMaps: true
            }));

            if (isTypeScript && (!opts.omitTypeScript || opts.isTypeScript || opts.preserveTS)) {
                generatedFile = generatedFile.replace(/\.js$/, '.ts');
            } else if (isTypeScript) {
                // if (compiledTS) {
                //   ({ output, sourceMap, sources } = compiledTS.parse());
                // }
                isTypeScript = false;
            }

            if (isJSX) {
                generatedFile += 'x';
            }

            try {
                let dest = _d ? path.join(_d, generatedFile) : r ? file.replace(/\.r(c|on)$/, r) : file + (isTypeScript ? '.ts' : '.js') + (isJSX ? 'x' : ''), destdir, fileOutput, mapOutput;

                if (!path.isAbsolute(dest)) dest = path.join(cwd, dest);

                destdir = dest.split(/\\|\//g).slice(0, -1).join(path.sep);

                if (sourceMap && opts.sourceMap && !isELSON) {
                    let sourceMapURL, _file = s ? path.join(s, f) : f.split(/\\|\//g).pop();
                    sourceMap.sourceRoot = path.join(cwd, s || '') + path.sep;

                    if (!opts.inlineMap) {
                        let map = JSON.stringify(sourceMap);
                        sourceMapURL = `//# sourceMappingURL=${generatedFile.split(/\/|\\/g).pop()}.map`;
                        let sourceURL = `//# sourceURL=${path.relative(destdir, file)}`;
                        output = `${output}\n\n// run with \`node --enable-source-maps ${generatedFile.split(/\\|\//g).pop()}\`\n${sourceMapURL}\n${sourceURL}`;
                        st ? (mapOutput = [dest + '.map', map]) : fs.writeFileSync(dest + '.map', map);
                    } else {
                        let sourceMapDataURI;
                        let encoded = base64encode(JSON.stringify(sourceMap));
                        sourceMapDataURI = `//# sourceMappingURL=data:application/json;base64,${encoded}`;
                        let sourceURL = `//# sourceURL=${path.relative(destdir, file)}`;
                        output = `${output}\n\n${sourceMapDataURI}\n${sourceURL}`;

                        if (n) {
                            return [file, output];
                        }
                    }
                }

                st ? fileOutput = [dest, output] : fs.writeFileSync(dest, output);

                let left, right;
                left = s ?
                    path.relative(cwd, file)
                    :
                    f;
                right = _d ?
                    path.join(path.relative(cwd, destdir), generatedFile)
                    :
                    generatedFile;

                if (st) {
                    st.push([left, right, sources, fileOutput, mapOutput, mainOpts]);
                } else {
                    process.stdout.write(`${greenb}OK:${reset} Compiled ${bold}${left}${reset} to ${yellow}${right}${reset}\n`);
                    return file + (isTypeScript ? '.ts' : '.js') + (isJSX ? 'x' : '');
                }
            } catch (_err) {
                process.stdout.write(`${red}ERROR:${reset} Could not write file ${bold}${generatedFile}${reset}\n`);
            }
        };

        d = ([f, o, ...excludes], st, rename = ".rc.js") => {
            let state = !f && !o ? 3 : !f ? 1 : !o ? 2 : 0;
            if (state) {
                let error = [
                    "Sources' folder not specified",
                    "Destination folder not specified",
                    "Sources' and destination folder not specified"
                ][state - 1]
                return process.stdout.write(`${red}ERROR:${reset} ${error}.\nCorrect usage --> ${bold}Relic -dir <folder> <destination> [...excludes]${reset}\n`);
            }

            opts.sourceFolder = f;

            let folder;
            try {
                folder = fs.readdirSync(path.join(cwd, f), { encoding: 'utf-8' })
            } catch (_) {
                return process.stdout.write(`${red}ERROR:${reset} No such directory --> ${bold}${path.join(cwd, f)}${reset}\n`);
            }

            if (excludes[0] && excludes[1] && excludes[0] === "->" && /^(ext=|\*)\./.test(excludes[1])) {
                excludes.shift();
            }

            if (excludes[0] && /^(ext=|\*)\./.test(excludes[0])) {
                let len = /^(ext=|\*)/.exec(excludes[0])[0].length;
                rename = excludes.shift().slice(len);
            }

            let excluded = [];
            folder = folder.filter(file => {
                if (fileIsDir(f, file)) file = file + '/';
                let check = [excludes.findIndex(e => e === file) > -1, excludes.findIndex(e => e === file.replace(/\.rc$/, '')) > -1, excludes.findIndex(e => e === file.replace(/\.trc$/, '')) > -1].includes(true)
                if (check) excluded.push(file)
                return !check
            });

            if (!folder.length && !st) {
                return process.stdout.write(`${yellowb}WARN:${reset}${excluded.length ? "    " : ""} No compilable Relic files in the given folder --> ${bold}${path.join(cwd, f)}${reset}\n${excluded.length ? excluded.map(file => `${red}Excluded: ${file}${reset}`).join('\n') : ''}\n`);
            }

            let destination = path.join(cwd, o);

            // scary! hahaha
            try {
                fs.accessSync(destination);
            } catch (_) {
                try {
                    fs.mkdirSync(destination)
                } catch (__) {
                    return process.stdout.write(`${redb}ERROR:${reset} Could not create destination directory -> ${bold}${destination}${reset}\n`);
                }
            }

            let stream = st || [];
            for (let file of folder) {
                if (fileIsDir(f, file)) {
                    d([path.join(f, file), path.join(o, file), ...excludes.filter(e => e.startsWith(file + '\\') || e.startsWith(file + '/')).map(e => e.slice(file.length + 1))], stream, rename);
                } else {
                    let isELSON;
                    if (!file.endsWith('.rc') && !file.endsWith('.trc') && !(isELSON = file.endsWith('.ron'))) continue;
                    c(file, f, destination, stream, isELSON ? '.json' : rename);
                }
            }

            if (!st) {
                let c2 = 0, c3 = 0;
                stream.map(log => {
                    if (log[0].length > c2) {
                        c2 = log[0].length;
                    }
                    if (log[1].length > c3) {
                        c3 = log[1].length;
                    }
                })

                let buff = "";
                for (let i in stream) {
                    let log = stream[i];

                    buff += `${greenb}OK: ${reset}${yellow}${alignr(log[0], c2)}${reset} ${green}...${reset} ${green}${alignl(log[1], c3)}${reset}\n`
                }
                process.stdout.write(buff);
            }
        };

        cfg = async (runtime) => {
            let compilerOptions, sourceRoot, exclude, files, sourceDir, configData, configFile, configText;

            try {
                configText = fs.readFileSync(configFile = path.join(cwd, configFile = 'rcconfig.json'), { encoding: 'utf-8' });
            } catch (_e) {
                configText = fs.readFileSync(configFile = path.join(cwd, configFile = '.rcconfig'), { encoding: 'utf-8' });
            }

            configData = Relic.compile(configText, {
                filename: path.basename(configFile),
                dirname: cwd,
                isELSON: true
            });

            if (!runtime && typeof JSON.parse(configData.output) !== 'object' || Array.isArray(JSON.parse(configData.output))) return process.stdout.write(red + 'rcconfig.json: ' + reset + 'config file content does not match with type ' + yellow + 'Object' + reset + '\n');

            ({ compilerOptions = {}, sourceRoot, exclude, files, sourceDir } = JSON.parse(configData.output));

            configFile = path.relative(cwd, configFile);
            let mappedLocation = mapLocation(configData.nodes);

            if (typeof compilerOptions !== "object" && compilerOptions !== undefined) {
                let message = '"compilerOptions" property specified, but content does not match with type ' + yellow + 'Object' + reset;
                throwSyntaxError({
                    message,
                    location: mappedLocation.compilerOptions.value.loc
                }, configText.split(/\n/g)[mappedLocation.compilerOptions.value.loc.first_line - 1], configFile)
            }

            let { outDir, outExtension, cout } = compilerOptions, isFromSource;

            if (!["console", "stdout"].includes(cout)) {
                cout = undefined;
            } else {
                compilerOptions.cout = cout = ({
                    console: "console.log",
                    stdout: "process.stdout.write"
                })[cout];
            }

            opts = { ...opts, ...compilerOptions, compilerOptions };

            if (runtime) return;

            if (outExtension !== undefined) {
                if (typeof outExtension !== "string") {
                    let message = '"outExtension" property specified, but content does not match with type ' + yellow + 'String' + reset;
                    throwSyntaxError({
                        message,
                        location: mappedLocation.compilerOptions.value.outExtension.value.loc
                    }, configText.split(/\n/g)[mappedLocation.compilerOptions.value.loc.first_line - 1], configFile);
                }
            } else outExtension = '.rc.js';

            if (outDir !== undefined) {
                if (typeof outDir !== "string") {
                    let message = '"outDir" property specified, but content does not match with type ' + yellow + 'String' + reset;
                    throwSyntaxError({
                        message,
                        location: mappedLocation.compilerOptions.value.outDir.value.loc
                    }, configText.split(/\n/g)[mappedLocation.compilerOptions.value.outDir.value.loc.first_line - 1], configFile + '["compilerOptions"]');
                }
            } else outDir = '@';

            if (outDir !== '@') {
                let destination = path.join(cwd, outDir);
                try {
                    fs.accessSync(destination);
                } catch (_) {
                    try {
                        let trail = '';
                        for (let fold of outDir.split(/\\|\//g)) {
                            if (!fold) break;
                            trail = path.join(trail, fold);
                            if (!fs.existsSync(path.join(cwd, trail))) fs.mkdirSync(path.join(cwd, trail));
                        }
                    } catch (__) {
                        let message = `could not create destination directory -> ${yellow}${destination}${reset}`
                        throwSyntaxError({
                            message,
                            location: mappedLocation.compilerOptions.value.outDir.value.loc
                        }, configText.split(/\n/g)[mappedLocation.compilerOptions.value.outDir.value.loc.first_line - 1], configFile + '["compilerOptions"]');
                    }
                }
            }

            if (sourceDir !== undefined) {
                if (files !== undefined) return process.stdout.write(red + 'rcconfig.json: ' + reset + '"files" and "sourceDir" properties can not be specified at the same time. Have you tried "sourceRoot"?\n');

                if (typeof sourceDir !== "string") {
                    let message = '"sourceDir" property specified, but content does not match with type ' + yellow + 'String' + reset;
                    throwSyntaxError({
                        message,
                        location: mappedLocation.sourceDir.value.loc
                    }, configText.split(/\n/g)[mappedLocation.sourceDir.value.loc.first_line - 1], configFile);
                }

                if (!fs.existsSync(path.join(cwd, sourceDir))) {
                    let message = 'no such directory';
                    throwSyntaxError({
                        message,
                        location: mappedLocation.sourceDir.value.loc
                    }, configText.split(/\n/g)[mappedLocation.sourceDir.value.loc.first_line - 1], configFile);
                }

                if (fileIsDir(sourceDir)) {
                    files = fs.readdirSync(path.join(cwd, sourceDir), { encoding: 'utf-8' }).filter(f => (f.endsWith('.ron') || f.endsWith('.trc') || f.endsWith('.rc') && !f.endsWith('.d.rc')) || fileIsDir(sourceDir, f));
                } else {
                    let message = 'path is not a folder';
                    throwSyntaxError({
                        message,
                        location: mappedLocation.sourceDir.value.loc
                    }, configText.split(/\n/g)[mappedLocation.sourceDir.value.loc.first_line - 1], configFile);
                }
            }

            if (sourceRoot !== undefined) {
                if (sourceDir !== undefined) return process.stdout.write(red + 'rcconfig.json: ' + reset + '"sourceRoot" and "sourceDir" properties can not be specified at the same time.\n');

                if (typeof sourceRoot !== "string") {
                    let message = '"sourceRoot" property specified, but content does not match with type ' + yellow + 'String' + reset;
                    throwSyntaxError({
                        message,
                        location: mappedLocation.sourceRoot.value.loc
                    }, configText.split(/\n/g)[mappedLocation.sourceRoot.value.loc.first_line - 1], configFile);
                }

                if (!fs.existsSync(path.join(cwd, sourceRoot))) {
                    let message = 'no such directory';
                    throwSyntaxError({
                        message,
                        location: mappedLocation.sourceRoot.value.loc
                    }, configText.split(/\n/g)[mappedLocation.sourceRoot.value.loc.first_line - 1], configFile);
                }

                if (!fileIsDir(sourceRoot)) {
                    let message = 'path is not a folder';
                    throwSyntaxError({
                        message,
                        location: mappedLocation.sourceRoot.value.loc
                    }, configText.split(/\n/g)[mappedLocation.sourceRoot.value.loc.first_line - 1], configFile);
                }

                sourceDir = sourceRoot;
            }

            if (exclude !== undefined) {
                if (!Array.isArray(exclude)) return process.stdout.write(red + 'rcconfig.json: ' + reset + '"exclude" property specified, but content does not match with type ' + yellow + 'Array' + reset + '\n');
            } else exclude = [];

            if (files !== undefined) {
                if (typeof files === "string") {
                    files = [files];
                    mappedLocation.files.value = [mappedLocation.files.value]
                }

                if (!Array.isArray(files)) return process.stdout.write(red + 'rcconfig.json: ' + reset + '"files" property specified, but content does not match with type ' + yellow + 'Array' + reset + '\n');

                if (exclude) {
                    files = files.filter(f => {
                        if (sourceDir && fileIsDir(sourceDir, f)) f = f + '/';

                        let check = [exclude.findIndex(e => e === f) > -1, exclude.findIndex(e => e === f.replace(/\.rc$/, '')) > -1, exclude.findIndex(e => {
                            try {
                                let reg = new RegExp(reg.replace(/\*\*/g, '[\\w_-\\\\\\/]*').replace(/(?<!])\*/g, '[\\w_-]*').replace('.', '\\.'));
                                return reg.test(f);
                            } catch (_) { }
                        }) > -1].includes(true);

                        return !check
                    });
                }

                let stream = [], i = 0;
                for (let file of files) {
                    let trueSrc = sourceDir,
                        trueOut = outDir,
                        isELSON;

                    if (typeof file !== 'string') return process.stdout.write(red + 'rcconfig.json: ' + reset + '"files" property specified, but value ' + i + ' does not match with type ' + yellow + 'String' + reset + '\n');

                    if (!sourceDir) {
                        let sdr = file.split(/\\|\//g).slice(0, -1).join(path.sep);
                        sourceDir = path.isAbsolute(file) ? path.relative(cwd, sdr) : sdr;

                        file = path.basename(file);
                    }

                    if (path.extname(file) === '') {
                        if (fs.existsSync(path.join(cwd, sourceDir || '', file + '.rc'))) {
                            file += '.rc';
                        } else if (fs.existsSync(path.join(cwd, sourceDir || '', file + '.trc'))) {
                            file += '.trc'
                        } else if (fs.existsSync(path.join(cwd, sourceDir || '', file + '.ron'))) {
                            file += '.ron';
                        }
                    }

                    if (!fs.existsSync(path.join(cwd, sourceDir || '', file))) {
                        let message = 'no such file or directory -> ' + red + JSON.stringify(file) + reset, item = mappedLocation.files.value[i].loc;

                        try {
                            throwSyntaxError({
                                message,
                                location: item
                            }, '', configFile + reset + ' > ' + red + '["files"]')
                        } catch (err) {
                            process.stderr.write(redb + 'ERR: ' + reset + err + '\n');
                        }
                    } else {
                        isELSON = file.endsWith('.ron');
                        if (outDir === '@') outDir = sourceDir;

                        if (fileIsDir(sourceDir || '', file)) {
                            d([path.join(sourceDir || '', file), path.join(outDir, file), ...exclude], stream, outExtension);
                        } else {
                            c(file, sourceDir, outDir, stream, isELSON ? '.json' : outExtension);
                        }
                    }

                    i++;
                    sourceDir = trueSrc;
                    outDir = trueOut;
                }

                let c2 = 0, c3 = 0, mapping = {}, tsFiles = [];

                stream.forEach(log => {
                    if (log[0].length > c2) {
                        c2 = log[0].length;
                    }

                    if (log[1].length > c3) {
                        c3 = log[1].length;
                    }

                    let fileName = path.join(cwd, log[1]).replace(/\\/g, '/');

                    if (fileName.endsWith('.ts')) {
                        tsFiles.push(fileName);
                        if (log[1].length > c2) {
                            c2 = log[1].length;
                        }
                    }

                    mapping[fileName] = {
                        sourceFile: path.join(cwd, log[0]),
                        sources: log[2],
                        fileOutput: log[3],
                        mapOutput: log[4]
                    };
                });



                if (tsFiles.length) {
                    let createProgram, ScriptTarget, ModuleKind, getPreEmitDiagnostics, createCompilerHost;
                    if (opts.compilerOptions.omitDiagnostics === 'undefined') {
                        opts.compilerOptions.omitDiagnostics = false;
                    }

                    // let TypeScript know that we wan't to check files inside the outDir environment
                    let initialQuantity = tsFiles.length;
                    tsFiles = tsFiles.concat(
                        ...fs.readdirSync(path.join(cwd, outDir)).map((f) => path.join(cwd, outDir, f).replace(/\\/g, '/'))).filter((f, i, r) => r.indexOf(f) === i && (/\.d\.ts$/.test(f) ? !r.includes(f.replace(/\.d\.ts$/, '.ts')) : true));

                    if (!opts.compilerOptions.omitDiagnostics && typeof ts === "undefined" && !tsNotAvailable) {
                        try {
                            process.stdout.write(`${greenb}INFO: ${reset}Got ${initialQuantity} TypeScript file(s) to diagnose... ${yellow}This might take a moment.${reset}\n`);

                            ({ createProgram, ScriptTarget, ModuleKind, getPreEmitDiagnostics, createCompilerHost } = (await import('typescript')).default);
                        } catch (err) {
                            process.stdout.write(`${redb}INFO: ${reset}${red}TypeScript is not installed in your local environment. The process will continue.${reset}\n`);
                            tsNotAvailable = true;
                        }
                    }

                    let allDiagnostics = [], programOptions = {
                        // emitDeclarationOnly: true,
                        // declaration: true,
                        noImplicitAny: true,
                        strictPropertyInitialization: false,
                        skipLibCheck: true,
                        disableSolutionSearching: true,
                        extendedDiagnostics: true,
                        target: ScriptTarget.ES2016,
                        module: ModuleKind.CommonJS,
                        emitDeclarationOnly: opts.compilerOptions.declaration,
                        ...opts.compilerOptions,
                        outDir: path.join(cwd, outDir)
                    };

                    let compilerHost = typeof createProgram === "function" && createCompilerHost(programOptions);


                    let getSourceFile = compilerHost.getSourceFile;
                    let readFile = compilerHost.readFile;

                    compilerHost.readFile = function (fileName, ...args) {
                        if (tsFiles.includes(fileName)) {
                            return mapping[fileName].fileOutput[1];
                        }

                        return readFile(fileName, ...args);
                    }

                    compilerHost.getSourceFile = function (fileName, ...args) {
                        if (tsFiles.includes(fileName)) {
                            process.stdout.write(`${greenb}INFO: ${reset}${green}Scanning >>${reset} ${yellow}${mapping[fileName] ? path.relative(cwd, mapping[fileName].sourceFile) : path.relative(cwd, fileName)}${reset}\n`);
                        }

                        return getSourceFile(fileName, ...args);
                    }

                    let program = !opts.compilerOptions.omitDiagnostics && typeof createProgram === "function" && createProgram(tsFiles, programOptions, compilerHost);

                    if (program) {
                        if (opts.compilerOptions.declaration) program.emit();

                        allDiagnostics = getPreEmitDiagnostics(program);

                        allDiagnostics.filter(({ file, start, code: cod, category, messageText }, index, arr) => {
                            return arr.findIndex(item => item.file === file && item.start === start && item.code === cod && item.category === category && item.messageText === messageText) === index;
                        }).forEach(({ file, start, length, code: cod, category, messageText: msg, relatedInformation }) => {
                            if (file === undefined) {
                                return;
                            }

                            var messageTexts = typeof msg === "string" ? [msg] : [msg.messageText, ...msg.next.map(n => n.messageText)];
                            var codes = typeof msg === "string" ? [cod] : [msg.code, ...msg.next.map(n => n.code)];

                            let { sourceFile, sources: sourceLocations } = mapping[file.fileName] || {};

                            if (!sourceFile) return;

                            let chunk = file.text.slice(0, start), lines = chunk.split(/\n/g);
                            let line = count(chunk, '\n'), column = lines.pop().length;

                            let location = sourceLocations.find(source => {
                                if (source.line === line && source.column === column) return source;
                            });

                            for (let i = 0, len = messageTexts.length; i < len; i++) {
                                var code = codes[i];
                                var messageText = messageTexts[i];
                                var reg = /^Type .(.+). is not assignable to type .(.+).\./.exec(messageText);

                                messageText = messageText.replace(/(?<=\'(?!\s|\.))(.+?)(?=\')/g, `${yellow}$1${reset}`);

                                if (location) {
                                    let compilerMessage = "";

                                    if (reg && code == 2322) {
                                        let [, s1, s2] = reg;
                                        let ref1, ref2;
                                        let symbol1 = file.locals.get(s1) || (ref1 = program.getSourceFiles().find(file => file.locals.get(s1))) && ref1.locals.get(s1);

                                        let symbol2 = file.locals.get(s2) || (ref2 = program.getSourceFiles().find(file => file.locals.get(s2))) && ref2.locals.get(s2);

                                        let t2, t1, n1 = "", n2 = "";

                                        if (symbol2) {
                                            t2 = symbol2.declarations[0].parent.text.slice(symbol2.declarations[0].type.pos, symbol2.declarations[0].type.end);
                                            n2 = s2;
                                            if (ref2) {
                                                n2 = `(${path.relative(cwd, ref2.path)}) ${n2}`;
                                            }
                                        } else {
                                            t2 = s2;
                                            n2 = `(assigned)`;
                                        }

                                        if (symbol1) {
                                            t1 = symbol1.declarations[0].parent.text.slice(symbol1.declarations[0].type.pos, symbol1.declarations[0].type.end);
                                            n1 = s1;
                                        } else {
                                            t1 = s1;
                                            n1 = `(given)`;
                                        }

                                        let cols = Math.max(n1.length, n2.length);

                                        compilerMessage = `- ${yellow + alignr(n2, cols) + reset} ${t2.trim()}\n- ${yellow + alignr(n1, cols) + reset} ${t1.trim()}\n\n`
                                    }

                                    try {
                                        let __file = path.join(sourceDir, location.source);

                                        if (!fs.existsSync(__file) && location.source.includes(path.sep)) {
                                            __file = path.join(sourceDir, location.source.split(path.sep).slice(1).join(path.sep))
                                        }

                                        let sourceText = fs.readFileSync(__file, { encoding: 'utf-8' });

                                        throwSyntaxError({
                                            message: messageText,
                                            location: {
                                                first_column: location.sourceColumn + 1,
                                                first_line: location.sourceLine + 1,
                                                last_column: location.lastSourceColumn + 1,
                                                last_line: location.lastSourceLine + 1,
                                                src: path.relative(cwd, file.fileName)
                                            },
                                            type: `ts(${code})`
                                        }, sourceText.split(/\r\n|\n/g)[location.sourceLine], path.relative(cwd, sourceFile))
                                    } catch (err) {
                                        process.stderr.write(err.toString() + '\n' + compilerMessage);
                                    }
                                } else {
                                    try {
                                        let sourceText = file.text;
                                        throwSyntaxError({
                                            message: messageText,
                                            location: {
                                                first_column: column + 1,
                                                first_line: line + 1,
                                                last_column: column + length + 1,
                                                last_line: line + 1,
                                                src: path.relative(cwd, file.fileName)
                                            },
                                            type: `ts(${code})`
                                        }, sourceText.split(/\r\n|\n/g)[line], path.relative(cwd, file.fileName))
                                    } catch (err) {
                                        process.stderr.write(err.toString() + '\n');
                                    }
                                }
                            }

                            if (relatedInformation && relatedInformation.length) {
                                for (let i = 0, len = relatedInformation.length; i < len; i++) {
                                    var related = relatedInformation[i];
                                    var { file, start, length, code, category, messageText } = related;

                                    messageText = messageText.replace(/(?<=\'(?!\s))(.+?)(?=\')/g, `${yellow}$1${reset}`);
                                    let { sourceFile, sources: sourceLocations } = mapping[file.fileName] || {};

                                    if (!sourceFile) continue;

                                    let chunk = file.text.slice(0, start), lines = chunk.split(/\n/g);
                                    let line = count(chunk, '\n'), column = lines.pop().length;

                                    let location = sourceLocations.find(source => {
                                        if (source.line === line && source.column === column) return source;
                                    });

                                    if (location) {
                                        let compilerMessage = "";
                                        try {
                                            let sourceText = fs.readFileSync(sourceFile, { encoding: 'utf-8' });

                                            throwSyntaxError({
                                                message: messageText,
                                                location: {
                                                    first_column: location.sourceColumn + 1,
                                                    first_line: location.sourceLine + 1,
                                                    last_column: location.lastSourceColumn + 1,
                                                    last_line: location.lastSourceLine + 1,
                                                    src: path.relative(cwd, file.fileName)
                                                },
                                                type: `ts(${code})`
                                            }, sourceText.split(/\r\n|\n/g)[location.sourceLine], path.relative(cwd, sourceFile))
                                        } catch (err) {
                                            process.stderr.write(err.toString() + '\n' + compilerMessage);
                                        }
                                    } else {
                                        try {
                                            let sourceText = file.text;
                                            throwSyntaxError({
                                                message: messageText,
                                                location: {
                                                    first_column: column + 1,
                                                    first_line: line + 1,
                                                    last_column: column + length + 1,
                                                    last_line: line + 1,
                                                    src: path.relative(cwd, file.fileName)
                                                },
                                                type: `ts(${code})`
                                            }, sourceText.split(/\r\n|\n/g)[line], path.relative(cwd, file.fileName))
                                        } catch (err) {
                                            process.stderr.write(err.toString() + '\n');
                                        }
                                    }
                                }
                            }
                        });
                    }

                    tsFiles.forEach(tsFile => {
                        if (!mapping[tsFile]) {
                            return;
                        }

                        if (allDiagnostics.find(d => d.file && (d.file.fileName.replace(/\\/g, '/') === tsFile))) {
                            if (!mapping[tsFile].errorCount) {
                                mapping[tsFile].errorCount = 0;
                            }

                            mapping[tsFile].errorCount++;

                            if (!opts.compilerOptions.omitDiagnostics) {
                                return;
                            }
                        }
                    })
                }

                let buff = "";
                for (let i in stream) {
                    let log = stream[i];
                    try {
                        if (/\.ts$/.test(log[1]) && (opts.preserveTS !== true || opts.omitTypeScript === true)) {
                            log[1] = log[1].replace(/\.ts$/, '.js');
                            log[3][0] = log[3][0].replace(/\.ts$/, '.js');
                            let mainOpts = log[5];
                            mainOpts.generatedFile = (mainOpts.generatedFile || '').replace(/\.ts$/, '.js');
                            log[3][1] = (
                                Relic.compile(
                                    fs.readFileSync(
                                        path.join(cwd, log[0]),
                                        { encoding: 'utf-8' }
                                    ),
                                    { ...mainOpts, ...opts, omitTypeScript: true }
                                )).output;
                        }

                        fs.writeFileSync(log[3][0], log[3][1], { encoding: 'utf-8' });

                        if (log[4]) {
                            fs.writeFileSync(log[4][0], log[4][1], { encoding: 'utf-8' });
                        }

                        buff += `${greenb}OK: ${reset}${yellow}${alignr(log[0], c2)}${reset} ${green}...${reset} ${green}${alignl(log[1], c3)}${reset}\n`
                    } catch (e) {
                        buff += `${redb}ERROR:${reset}${red}${e.toString()}${reset}\n`;
                    }
                }

                process.stdout.write(buff);
            }
        }

        function alignl(str, len) {
            return str + " ".repeat(len - str.length);
        }

        function alignr(str, len) {
            return " ".repeat(len - str.length) + str;
        }

        function fileIsDir(...paths) {
            let subfolder;
            try {
                subfolder = fs.readdirSync(path.join(cwd, ...paths));
            } catch (_) { }
            if (Array.isArray(subfolder)) return true;
        }

        function base64encode(src) {
            switch (true) {
                case typeof Buffer === 'function':
                    return Buffer.from(src).toString('base64');
                case typeof btoa === 'function':
                    return btoa(encodeURIComponent(src).replace(/%([0-9A-F]{2})/g, function (match, p1) {
                        return String.fromCharCode('0x' + p1);
                    }));
                default:
                    throw new Error('Unable to base64 encode inline sourcemap.');
            }
        };

        function mapLocation(nodes) {
            let res = {}, ctx;

            if (nodes[0] === "Body") {
                [, ctx] = nodes.unwrap;
                ctx = ctx[0].unwrap
            } else ctx = nodes;

            let
                obj = ctx.unwrapUntil(n => n.rule === 'Object'),
                arr = ctx.unwrapUntil(n => n.rule === 'Array');

            if (obj) {
                obj = obj.unwrap.unwrap;

                for (let prop of obj.filter(Array.isArray)) {
                    if (typeof prop[0] === "string") {
                        res[prop[0]] = {
                            loc: prop[2][0],
                            value: mapLocation(prop[1])
                        };
                    } else if (prop[0][0] === "String") {
                        let str = prop[0][1].unwrap.slice(1, -1);
                        res[str] = {
                            loc: prop[2][0],
                            value: mapLocation(prop[1])
                        };
                    }
                }
            } else if (arr) {
                arr = arr.unwrap.unwrap;
                let i = 0;
                res = [];
                for (let prop of arr.filter(Array.isArray)) {
                    res[i] = {
                        value: prop,
                        loc: prop.loc
                    }
                    i++;
                }
            } else return ctx;

            return res;
        }

        // run = (f) => {
        //   opts.runtime = true;
        //   try {
        //     cfg(true);
        //   } catch (_e) { }

        //   opts.streamTokens = false;
        //   opts.omitTypeScript = true;

        //   let file, code, ref, s = '';
        //   if (f.split(/\\|\//g).length > 1) {
        //     s = path.join(s, path.dirname(f));
        //     f = path.basename(f);
        //   }

        //   if (ref = c(f, s, undefined, undefined, undefined, true)) {

        //     let mod = Object.assign(module, {
        //       children: [],
        //       path: path.dirname(ref[0]),
        //       filename: ref[0],
        //       id: '.' // Run the module as it is the main module
        //     });

        //     if (module._extensions) {
        //       module._extensions['.rc'] = module._extensions['.trc'] = function (module, filename) {
        //         let short = path.relative(cwd, filename);
        //         let _ref = c(short, null, null, [], null, true);
        //         if (_ref) {
        //           let [filename, output] = _ref;
        //           return module._compile(output, filename);
        //         } else {
        //           throw undefined;
        //         }
        //       }
        //     }


        //     const require = module.createRequire(process.cwd());
        //     console.log(require.module)
        //     module._compile(ref[1], ref[0]);
        //   }
        // }

        function count(string, substr) {
            var num, pos;
            num = pos = 0;
            if (!substr.length) {
                return 1 / 0;
            }
            while (pos = 1 + string.indexOf(substr, pos)) {
                num++;
            }
            return num;
        };

        handle();
    })().catch(error => {
        console.log(error);
    });
}