Relic
=======
**Relic** is a coding language made to compile ***implicit* yet *readable* code** to pure, modern JavaScript. Since Relic is just a compiler for JavaScript, it can handle and compile expressions of both languages.

This package is still under development, and is not recommended to be used in production. Some parts of JavaScript are still not supported.


Overview
========
Relic
-------
```js
MyTypes as '', 1, false, null, foo: \bar

for index, value in MyTypes
  _type = typeof value

  console.log `{_type} value at {index}`
```
JavaScript output
---
```js
let MyTypes;

MyTypes = [
    '', 1, false, null, { foo: "bar" }
];

for (index in (_j = MyTypes)) {
    value = _j[index];

    _type = typeof value;

    console.log(`${_type} value at ${index}`);
}
```

Installation
===
### With Node.js
```bash
# for local development...
npm install --save-dev relic-lang

# if you'd like to use 'els' command globally...
npm install -g relic-lang
```

Usage
===
### Command Line Interface
```bash
# with `.rcconfig`
rc

# compile a file manually
rc -c path/to/file.els

# compile a directory
rc -c path/to/folder path/to/destination
```

### On Node.js
```js
import Relic from 'relic-lang'

// prints "hello('world!');"
console.log(
  Relic.compile("hello 'world!'").output
);

// ---------

// parse a Relic Object Notation file
import fs from 'fs'

var RON = fs
  .readFileSync('path/to/.ron', { encoding: 'utf-8' });

console.log(
  Relic.toJSON(RON)
)
```

References
===
### Structure of a `.rcconfig` file
(`.rcconfig` has the syntax of a `.ron` file)

**Do not** place newlines between properties, or the file will be treated as an array.
```coffee
sourceDir: 'path/to/folder'
# or...
sourceRoot: 'path/to/root' # optional
files:
  'my-file.rc'
  'another-file.rc'
# -----
compilerOptions:
  # whether you want a source map to be generated
  sourceMaps: yes or no
  # whether to place the source map as a data URI 
  # or generate a '.js.map' file containing the map
  inlineMap: yes or no
  # the output directory for all scripts
  # use '@' for same directory
  outDir: 'path/to/destination'
  # the extension of the output files
  # if .elson, the output will be .json
  # set to '.rc.js' by default
  outExtension: '.js'
  # -----------------
  # --- For TypeScript support (still working on it)
  # -----------------
  # whether the output will be a TypeScript file
  # (only for files containing typed expressions) 
  preserveTS: yes or no
  # skip all diagnostics if there's any
  # if false, the file will not be compiled
  # if there's any error
  omitDiagnostics: yes or no
```