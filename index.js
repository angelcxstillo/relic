import { Parser, Nodes } from './lib/parser.js';
import Lexer from './lib/lexer.js';

import parser from "./lib/relic.js";
import { errorToString, updateSyntaxError, guessIndentation, RelicError } from "./lib/helpers.js";
import { SourceMap } from './lib/sourcemaps.js'

import { isAbsolute, join, sep } from 'path';
import { readFileSync, existsSync } from "fs";

parser.lexer = {
  options: {
    ranges: true
  },
  yylloc: { first_line: 0, first_column: 0, last_column: 0, last_line: 0 },
  lex() {
    var tag, token;
    token = parser.tokens[this.pos];
    this.pos = this.pos + 1;

    if (token) {
      tag = token[0];
      this.yytext = token[1];
      this.yylloc = token[2];

      parser.errorToken = token;
    } else {
      tag = '';
    }

    return tag;
  },
  setInput(tokens) {
    parser.tokens = tokens;
    return this.pos = 0;
  },
  upcomingInput() {
    return '';
  }
};

for (var i = 0, keys = Object.keys(Nodes); i < keys.length; i++) {
  var key = keys[i];
  parser.yy[key] = Nodes[key];
}

parser.yy.parseError = function (message, holder, JisonErr) {
  let token = holder.parser.errorToken, symbol;
  if (!(symbol = token.origin || token[2].origin)) {
    symbol = token[0];
  }
  
  if (symbol === "INDENT") {
    token[2].first_line++;
    token[2].first_column = 1;
    token[2].last_column = token[1].split(/\n/g).pop().length + 1;
  }

  resolveToken(token);

  let err = new (JisonErr || SyntaxError)('unexpected ' + symbol.toLowerCase());

  err.toString = errorToString;
  err.location = token[2];
  err.stack = err.toString();
  err.token = token;
  err.isCompilerError = true;
  throw err;
}

/**
 * The compiler
 */
class Relic {
  /**
   * Compile a string
   * @param {string} script 
   * @param {object} options
   * @returns {object}
   */
  constructor(script, options) {
    return Relic.compile(script, options);
  }

  /**
   * 
   * @param {String} script The code or path to file
   * @param {Object} options
   */
  static compile(script, options = {}, { nodes: _oldNodes, tokens: _oldTokens, comments: _oldComments, names: _oldNames } = {}) {
    return prettyPrint(() => {
      if (!options.tabSize) {
        options.tabSize = guessIndentation(script).tabSize;
      }

      var result = {}, tokens, nodes, comments, names, filename;

      filename = options.filename || '<anonymous>';

      if (typeof options.dirname !== "string") {
        if (typeof __dirname !== "undefined") options.dirname = __dirname;
        else options.dirname = '';
      }

      if (!_oldTokens) {
        var lexed = new Lexer(script, options);
        tokens = lexed.tokens;
        comments = lexed.comments;
        names = lexed.names;
        if (!options.omitTypeScript && lexed.isTypeScript) options.isTypeScript = true;

        result.tokens = tokens;

        tokens.script = script;

        result.nodes = nodes = Relic.parseTokens(tokens);
      } else {
        comments = _oldComments;
        nodes = _oldNodes;
        names = _oldNames;
        tokens = _oldTokens;

        result.tokens = tokens;
        result.nodes = nodes;
      }

      if (options.nodes) return result;

      options.scope = names;
      let { js, sources, isTypeScript, isJSX } = new Parser(nodes, { comments, ...options }).parse(options);

      let sourceMap;
      if (sources.length) {
        var ln = sources.length, stack = 0;
        var match;
        while (match = /\/\*@[0-9a-f]{18}\*\//g.exec(js.slice(stack))) {
          var str = match[0];
          var d = stack + match.index;
          var ind = sources.findIndex(src => src[0] === str);
          var source = sources[ind];

          if (source && source.length) {
            let x, y;
            x = js.slice(0, d).split(/\n/g).pop().length;
            y = count(js.slice(0, d), '\n');

            sources[ind] = {
              sourceLine: source[1].first_line - 1,
              sourceColumn: source[1].first_column - 1,
              lastSourceColumn: source[1].last_column - 1,
              lastSourceLine: source[1].last_line - 1,
              line: y,
              column: x,
              source: source[1].source,
              sourceName: source[1].sourceName
            }

            js = js.slice(0, d) + js.slice(d).replace(str, "");
          }

          stack += match.index;
        }

        sourceMap = new SourceMap(sources).generate({ generatedFile: options.generatedFile, sourceMap: options.inlineMap ? script : undefined, ...options }, script);
      }

      result.sourceMap = sourceMap;      
      result.output = js;
      result.sources = sources;
      result.isTypeScript = isTypeScript;
      result.isJSX = isJSX;
      return result;
    })(script, options);
  }

  static parseTokens(tokens) {
    return parser.parse(tokens);
  }

  static toJSON(ELSON, options = {}) {
    return JSON.parse(Relic.compile(ELSON, { ...options, isELSON: true }).output);
  }
}

Relic.Lexer = Lexer;

function prettyPrint(cb) {
  return function (script, options) {
    try {
      return cb.call(this, script, options)
    } catch (err) {
      let ref;
      if (!err.isCompilerError && !(err instanceof RelicError)) throw err;
      if (typeof script !== "string") throw err;
      if (err.isCompilerError) err.type = "SyntaxError";

      if ((typeof window == "undefined" || typeof self == "undefined") && err.token && (ref = err.token[2].src) !== options.src && ref || ((ref = err.src) !== options.src) && ref && ref !== '<anonymous>') {
        let __file;
        if (isAbsolute(ref)) __file = ref;
        else {
          __file = join(options.dirname, ref);
          if (!existsSync(__file) && ref.includes(sep)) {
            __file = join(options.dirname, ref.split(sep).slice(1).join(sep))
          }
        }

        script = existsSync(__file) ? readFileSync(__file, { encoding: 'utf-8' }) : script;
        options.src = ref;
      }

      err = updateSyntaxError(err, script, options.src);

      throw err;
    }
  }
}

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

function resolveToken(token) {
  switch (true) {
    case token[0] === "[" && token.generated: {
      token[0] = 'implicit array';
      break;
    };
    case token[0] === "CALL_START" && token.generated: {
      token[0] = 'implicit call';
      break;
    };
    case token[0] === "NEWLINE": {
      token[0] = 'end of line or expression';
      break;
    }
    default: {
      return;
    }
  }
}

if (typeof module !== "undefined" && typeof require === "function") {
  module.exports = Relic;
}

if (typeof window !== "undefined") {
  window.Relic = Relic;
}

if (typeof self !== "undefined") {
  self.Relic = Relic;
}

export default Relic;