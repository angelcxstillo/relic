import pkg from 'jison-gho';
import { writeFileSync } from 'fs';
import { join } from 'path';

const { Parser: parser } = pkg;


import grammar from "./grammar.js";

let tokens = [], alternatives, alt, token, name, operators;

for (name in grammar) {
  alternatives = grammar[name];
  grammar[name] = (function () {
    var i, j, len, len1, ref, results;
    results = [];
    for (i = 0, len = alternatives.length; i < len; i++) {
      alt = alternatives[i];
      ref = alt[0].split(' ');
      for (j = 0, len1 = ref.length; j < len1; j++) {
        token = ref[j];
        if (!grammar[token]) {
          tokens.push(token);
        }
      }
      if (name === 'Root') {
        alt[1] = `return ${alt[1]}`;
      }
      results.push(alt);
    }
    return results;
  })();
}

const Parser = new parser({
  bnf: grammar,
  startSymbol: 'Root',
  operators: operators = [
    ['left', '.'],
    ['left', '<(', ')>'],
    ['left', 'CONST', 'VAR', 'LET'],
    ['left', 'CALL_START', 'CALL_END'],
    ['nonassoc', '++', '--', '...'],
    ['right', '**'],
    ['right', 'UNARY_MATH', 'DO', 'NEW'],
    ['left', 'MATH'],
    ['left', '+', 'PLUS', '-', '>=', '<=', '>', '<', '===', '==', '!==', '!='],
    ['left', 'SHIFT'],
    ['left', 'COMPOUND_AND', 'COMPOUND_FOR'],
    ['left', 'COMPARE'],
    ['left', 'TYPE_JOIN'],
    ['left', '&'],
    ['left', '&&'],
    ['left', '^'],
    ['left', '|'],
    ['left', '||'], 
    ['left', 'HAS'], 
    ['left', 'EXISTS'],
    ['left', 'BIN?'], 
    ['left', 'YIELD'],
    ['nonassoc', 'INDENT', 'OUTDENT'],
    ['right', 'FUNC_DIRECTIVE', ':', 'RETURN', 'THROW', 'EXTENDS'],
    ['right', 'FOR_IN', 'FOR_OF', 'FOR_FROM', 'FOR_AS', 'FOR_AT', 'WHEN'],
    ['right', 'IF', 'ELSE', 'TRY', 'CATCH', 'FINALLY', 'OTHERWISE', 'FOR', 'WHILE', 'UNTIL', 'LOOP', 'SUPER', 'CLASS', 'TYPE', 'INTERFACE', 'IMPORT', 'EXPORT', 'DYNAMIC_IMPORT'], 
    ['left', 'EITHER', 'POSTIF', 'POSTUNLESS', 'POSTFOR', 'POSTWHILE', 'POSTUNTIL'], 
    ['left', 'POSTCASE', 'IS', 'ISNT', 'AND', 'OR', 'INCLUDES', 'HAS'], 
    ['left', 'CHAIN']].reverse()
});

Parser.lexer = {
  options: {
    ranges: false
  },
  lex: function (tt) {
    var tag, token;
    token = Parser.tokens[this.pos++];
    if (token) {
      ([tag, this.yytext] = token);
      Parser.errorToken = token;
    } else {
      tag = '';
    }
    return tag;
  },
  setInput: function (tokens) {
    Parser.tokens = tokens;
    return this.pos = 0;
  },
  upcomingInput: function () {
    return '';
  },
  parseError: function () {
    return ''
  }
};

Parser.Grammar = grammar;

// console.log(require('util').inspect(grammar, { depth: null, colors: true }), "\n".repeat(4));

let Code = Parser.generate({ moduleName: "Relic" });

Code = Code.replace(/\s+try \{([\s\r\n]+this\.__reentrant_call_depth[\s\S]+?)\} catch \(ex\) \{[\s\S]+?\} finally \{([^]+?)\}\s+\/\/\s+\/finally/, function replace_noTryCatch(m, p1, p2) {
  p1 = p1.replace(/^        /mg, '    ');
  p2 = p2.replace(/^        /mg, '    ');
  return '\n' + p1 + '\n    // ... AND FINALLY ...\n' + p2;
}).replace(/^[^\n]+\b__reentrant_call_depth\b[^\n]+$/gm, '\n');

Code += "\n\nexport default Relic;";

writeFileSync(join(import.meta.dirname, "/relic.js"), Code, { encoding: "utf-8" });