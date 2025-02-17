import { red, throwSyntaxError, resolvePath } from './helpers.js';
import Relic from '../index.js';
import { join, relative, dirname as _dirname } from 'path';
import { existsSync, readFileSync } from 'fs';

class Lexer {
  constructor(script, options = {}) {
    if (typeof script !== "string" || typeof options !== "object") {
      return;
    }

    this.position = options.startPosition || 0;
    this.indentLevel = 0;
    this.tokens = [];
    this.names = [];
    this.filename = options.filename || '<anonymous>';
    this.dirname = options.dirname || '';
    this.sdir = options.isInclude ? options.sdir : this.dirname;
    this.tabSize = options.tabSize || 2;
    this.skipped = -1;
    this.assignLine = -1;
    this.forLine = -1;
    this.funcLine = -1;
    this.paramLine = false;
    this.isSimulation = typeof options.cb === "function";
    this.stages = [{
      label: 'Root',
      type: "indent",
      contains: [],
      indent: 0,
      id: 0
    }];

    this.forStage = [];
    this.explicit = [];
    this.comments = [];

    this.isInterpolation = options.isInterpolation;
    this.isELSON = options.isELSON;

    // the current line:column
    this.cursor = options.cursor || { x: 1, y: 1 };
    // whether to update column position if last token didn't manually
    this.forceCursorAtX = false;
    this.cantImport = options.cantImport ? options.cantImport : [this.filename];

    script = script.replace(/\r\n/g, '\n') + "\n";
    this.code = script;

    var i = 0;
    while (this.chunk = script.slice(i)) {
      if (this.isSimulation && options.cb(this, i)) {
        break;
      }

      let float = this.float;

      var consumed = this.isELSON ?
        this.Separator() || this.Whitespace() || this.Comment() || this.String() || this.KeywordStatement() || this.Number() || this.Literal() || this.Identifier()
        :
        this.Separator() || this.Whitespace() || this.Comment() || this.JSX() || this.String() || this.importPath() || this.Regex() || this.Assign() || this.AssignKeyword() || this.ImportExport() || this.KeywordStatement() || this.Type() || this.Number() || this.Literal() || this.Identifier();

      if (!consumed) {
        let msg = "unexpected token " + red(this.chunk[0]);
        throwSyntaxError({
          message: msg,
          location: { first_line: this.cursor.y, first_column: this.cursor.x, last_column: this.cursor.x + 1, last_line: this.cursor.y, src: this.filename ? join(this.sdir, this.filename) : '<anonymous>' },
          type: 'SyntaxError'
        });
      }

      if (!this.forceCursorAtX) {
        this.cursor.x += consumed;
      }

      this.forceCursorAtX = false;

      if (this.isInterpolation && this.prev()[0] === "INTERPOLATION_END") {
        this.tokens.pop()
        break;
      }

      if (float && /IDENTIFIER|PROPERTY|INDEX_END/.test(this.prev()[0])) {
        this.prev()[2].type = this.float;
        this.float = null;
      } else if (float && this.prev()[0] === ":" && this.tokens.length > 1 && /IDENTIFIER|PROPERTY|INDEX_END/.test(this.tokens[this.tokens.length - 2][0])) {
        this.tokens[this.tokens.length - 2][2].type = this.float;
        this.float = null;
      }

      i = i + consumed;
    }

    this.closeTo(0);
    this.close();

    if ((this.tokens.length === 1) && this.tokens[0][0] == "NEWLINE") {
      this.tokens = [];
    }

    this.fix();

    this.length = i;

    if (typeof existsSync === "function" && !options.isDefinitions && this.filename && this.filename !== "<anonymous>") {
      let deff = this.filename.split('.').slice(0, -1).join('.') + '.d.rc';
      let deft = join(this.dirname, deff);

      if (existsSync(deft)) {
        let { comments } = new Lexer(readFileSync(deft, { encoding: 'utf-8' }), {
          filename: deff,
          dirname: this.dirname,
          isDefinitions: true
        });

        this.comments.unshift(...comments.map(c => {
          [c[2].last_column, c[2].last_line] = [-1, -1];
          return c;
        }));
      }
    }

    if ((typeof process !== "undefined" && process.argv.includes("-t") || options.streamTokens) && !this.isInterpolation) console.log(this.tokens);
  }

  Type() {
    let ref;
    if (ref = /^<([:?])?/.exec(this.chunk)) {
      let canAdd;

      if (ref[1] === undefined) {
        if (!this.Callable.includes(this.prev()[0])) return;
        if (this.prev().spaced) return;
        canAdd = true;
      }

      let index = 1, chevrons = [];
      while (this.chunk.charAt(index)) {
        index++;
        if (this.chunk.charAt(index) === ">" && !chevrons.length) break;
        else if (this.chunk.charAt(index) === ">") {
          chevrons.pop();
        } else if (this.chunk.charAt(index) === "<") {
          chevrons.push(1);
        }
      }

      let reg = /^<([:?])?(.+)>$/;
      let part = reg.exec(this.chunk.slice(0, index + 1));

      if (!part) return;

      let [input, optional, type] = part;

      optional = optional === '?';
      let tokens, nodes = (() => {
        let retv;

        try {
          retv = Relic.compile(`type PARTIAL = ${type}`, {
            cursor: {
              x: this.cursor.x - 13,
              y: this.cursor.y
            },
            filename: this.filename,
            dirname: this.dirname,
            sdir: this.sdir,
            nodes: true,
            startPosition: this.position - 1
          });
        } catch (_) { }
        tokens = retv.tokens;
        return retv.nodes;
      })();

      if (!nodes) {
        throwSyntaxError({
          message: 'Invalid type',
          location: {
            first_column: this.cursor.x + 2,
            first_line: this.cursor.y,
            last_line: this.cursor.y,
            last_column: this.cursor.x + 2 + type.length,
            src: this.filename ? join(this.sdir, this.filename) : '<anonymous>'
          },
          type: 'SyntaxError'
        }, this.code.split('\n')[this.cursor.y - 1]);
      }

      let typeToken = {
        value: type.trim(),
        nodes: nodes.visit(1, 1, 0, 1, 1, 1, 2),
        optional,
        loc: {
          first_column: this.cursor.x,
          first_line: this.cursor.y,
          last_line: this.cursor.y,
          last_column: this.cursor.x + input.length
        }
      };

      if (canAdd) {
        let pair = this.position + 1;
        this.token('<(', '<', { pair, loc: { ...typeToken.loc, first_line: typeToken.loc.last_line, first_column: typeToken.loc.last_column + 1 } });
        this.tokens.push(...tokens.slice(3));
        this.token(')>', '>', { pair, loc: { ...typeToken.loc, last_line: typeToken.loc.first_line, last_column: typeToken.loc.first_column + 1 } });
      } else if (this.stage().typeKwd) {
        if (this.uncontinuous.includes(this.prev()[0])) {
          if (this.isPossibleArray()) {
            this.createImplicitArray();
          }

          this.token('NEWLINE', 0, { generated: true })
        }

        this.token('TAG', typeToken);
      } else if (this.prev()[0] && /IDENTIFIER|PROPERTY|INDEX_END|PARAM_END/.test(this.prev()[0])) {
        this.prev()[2].type = typeToken;
      } else if (this.prev()[0] === ":" && this.tokens.length > 1 && /IDENTIFIER|PROPERTY|INDEX_END/.test(this.tokens[this.tokens.length - 2][0])) {
        this.tokens[this.tokens.length - 2][2].type = typeToken;
        this.float = null;
      } else this.float = typeToken;

      this.isTypeScript = true;
      return input.length;
    } else if ((ref = /^:=/.exec(this.chunk)) || (ref = /^[&|?:](:)/.exec(this.chunk)) || ((ref = /^:/.exec(this.chunk)) && this.prev().spaced && (this.stage().quotedIf === undefined || !this.stage().quotedIf.length))) {
      let i = ref[0].length - 1, symbols = [], str = ref[0], virtualLoc = { x: this.cursor.x + i, y: this.cursor.y }, offset = 0;
      let inStrictType;

      while (++i) {
        if (!this.chunk.charAt(i)) break;

        virtualLoc.x++;

        let char = this.chunk.charAt(i), z;
        if (/[<[{(]/.test(char)) {
          symbols.push(char);
        } else if (/^[\s ]+/.test(char) && str.trim() === ref[0]) {
          str += " ";
          offset++;
          continue;
        } else if ((z = /^\s*(\|(?!\|)|&(?!&))\s*/.exec(this.chunk.slice(i))) || (z = /^\s*(typeof|keyof|new)\s+/.exec(this.chunk.slice(i)))) {
          str += z[0];
          i += z[0].length - 1;
          continue;
          // support function types as "(x) => typeof Colors[number]"
        } else if ((/\)\s*$/.test(str)) && (z = /^\s*[=-]>\s*/.exec(this.chunk.slice(i)))) {
          str += z[0];
          i += z[0].length - 1;
          continue;
        } else if (/[^\w)\]}>]/.test(char) && !symbols.length || /[)\]}>]/.test(char) && !symbols.length) break;

        if (/^[)\]}>]/.test(char)) {
          let closure = ({
            '>': '<',
            '}': '{',
            ']': '[',
            ')': '('
          })[char]

          if (symbols.pop() !== closure) {
            let msg = "unexpected token " + red(char);
            throwSyntaxError({
              message: msg,
              location: { first_line: virtualLoc.y, first_column: virtualLoc.x, last_column: virtualLoc.x + 1, last_line: virtualLoc.y, src: this.filename ? join(this.sdir, this.filename) : '<anonymous>' },
              type: 'SyntaxError'
            }, this.code.split("\n")[virtualLoc.y - 1]);
          }
        }

        str += char;
      }

      if (symbols.length) {
        let msg = "unmatched " + red(symbols.pop()) + ` at end of ${!this.chunk[i] ? 'input' : 'line'}`;

        throwSyntaxError({
          message: msg,
          location: { first_line: virtualLoc.y, first_column: virtualLoc.x, last_column: virtualLoc.x + 1, last_line: virtualLoc.y, src: this.filename ? join(this.sdir, this.filename) : '<anonymous>' },
          type: 'SyntaxError'
        }, this.code.split("\n")[virtualLoc.y - 1]);
      }

      let reg = /^([&:?!|])?:(=)?(.+)/;
      if (inStrictType) str = str.replace(/^[&:?!|]/, '&:');

      let part = reg.exec(str);

      if (!part) return;

      let [input, optional, returns, type] = part;
      let len = type.length;

      optional = optional === '?';

      let nodes = (() => {
        let retv;

        try {
          retv = Relic.compile(`type PARTIAL = ${type}`, {
            cursor: {
              x: this.cursor.x - 13 + (offset ? offset - 1 : 0),
              y: this.cursor.y
            },
            filename: this.filename,
            dirname: this.dirname,
            sdir: this.sdir,
            nodes: true
          }).nodes;
        } catch (_) { }

        return retv;
      })();

      if (!nodes) {
        throwSyntaxError({
          message: 'Invalid type',
          location: {
            first_column: this.cursor.x + 2,
            first_line: this.cursor.y,
            last_line: this.cursor.y,
            last_column: this.cursor.x + 2 + len,
            src: this.filename ? join(this.sdir, this.filename) : '<anonymous>',
            sdir: this.sdir
          },
          type: 'SyntaxError'
        }, this.code.split('\n')[this.cursor.y - 1]);
      }

      let typeToken = {
        value: type.trim(),
        optional,
        nodes: nodes.visit(1, 1, 0, 1, 1, 1, 2),
        loc: {
          first_column: this.cursor.x,
          first_line: this.cursor.y,
          last_line: this.cursor.y,
          last_column: this.cursor.x + input.length
        }
      };

      if (returns) {
        let stage = this.stages.length - this.stages.map(i => i).reverse().findIndex(s => (s.type === "indent") || (s.type === "explicit"));
        this.close(undefined, undefined, true);
        if (!["indent", "explicit", "indent&call"].includes(this.stage().type)) {
          this.closeTo(stage, true);
        }

        if (this.prev()[0] === "WITH") {
          this.token('PARAM_START', '(', { generated: true });
          this.token('PARAM_END', ')', { generated: true });
        }

        if ((this.prev()[0] === "PARAM_END" || this.prev()[0] === ")>") && !this.stage().typeKwd) {
          this.token('THEN', 'then', {
            generated: true,
            origin: ':=, possibly missing function body',
            last_column: this.cursor.x + 2
          });
        }
      }

      if (this.prev()[0] && /(VAR)?IDENTIFIER|PROPERTY|INDEX_END|\}|\]|PARAM_END|TH(EN|IS)/.test(this.prev()[0])) {
        this.prev()[2].type = typeToken;
      } else if (this.prev()[0] === ":" && this.tokens.length > 1 && /(VAR)?IDENTIFIER|PROPERTY|INDEX_END/.test(this.tokens[this.tokens.length - 2][0])) {
        this.tokens[this.tokens.length - 2][2].type = typeToken;
        this.float = null;
      } else {
        let msg = 'Value expected before type reference';
        throwSyntaxError({
          message: msg,
          location: {
            first_line: this.cursor.y,
            first_column: this.cursor.x,
            last_line: this.cursor.y,
            last_column: this.cursor.x,
            src: this.filename ? join(this.sdir, this.filename) : '<anonymous>'
          },
          type: 'SyntaxError'
        }, this.code.split("\n")[this.cursor.y - 1]);
      }

      this.isTypeScript = true;
      return i;
    }
  }

  AssignKeyword() {
    let reg;
    if (reg = /^(const|var|let|local|type|interface)\s/.exec(this.chunk)) {
      let token = reg[1], tag = token;

      if (token === "local") tag = "let";

      if (!["POSTFOR", "FOR"].includes(this.prev()[0])) {
        if (token !== "type" && token !== "interface") {
          this.stage().assignKwd = token;
        } else {
          this.stage().typeKwd = token;
          this.stage().typeKwdOrigin = true;
          this.isTypeScript = true;
        }
      } else {
        this.forAssignLine = this.cursor.y;
      }

      this.token(
        tag.toUpperCase(),
        token,
        { $$accept: token !== "type" }
      );

      return token.length;
    }
  }

  ImportExport() {
    let ref;
    if (ref = /^(import|export)\s/.exec(this.chunk)) {
      let [, token] = ref;
      if (this.prev()[0] == ".") {
        this.token(
          'PROPERTY',
          token
        )
      } else {
        this.token(
          token.toUpperCase(),
          token
        );
        this.opLine = token;
        this.opLevel = this.stages.length;
        this.portLine = this.cursor.y;
      }

      return token.length;
    }
  }

  MatchJSX(c) {
    let Allowed = /\/|[^\x00-\x7F\xA0-\xBF\xD7\xF7]|[a-z$_\d]/i, Strict = /:|\.|-|=|"|'/;
    if (/^<(?:(\/)?(((?:[^\x00-\x7F\xA0-\xBF\xD7\xF7]|[a-z$_\d])(?:[^\x00-\x7F\xA0-\xBF\xD7\xF7]|[a-z$_\d:\-])*)|>))/i.test(c)) {
      let consumed = "<", chunk = c, i = 1, leading = ['>'], cursor = { x: 0, y: 0 }, leadingPos = [cursor], spaced, tag = "", char, isEscaped;
      while ((char = chunk.charAt(i)) && leading.length) {
        let accept;
        if (char === '\n') {
          cursor.y++;
          cursor.x = 0;
        }

        cursor.x++;

        if (!isEscaped && char == leading[leading.length - 1]) {
          consumed += leading.pop();
          leadingPos.pop();
          i++;
          continue;
        }

        if (!isEscaped && leading.includes(char) && leading[leading.length - 1] !== char) {
          return {
            errorMsg: `unexpected token ${char}`,
            coords: cursor
          };
        }

        var isSpace = /\s/.test(char)

        if (!spaced && !isSpace && char !== "/" && (Allowed.test(char) || /:|\./.test(char))) {
          tag += char;
          // don't accept any other char as the ID
        } else if (!spaced && !isSpace && char !== "/") {
          spaced = true;
        }

        if (isSpace) {
          accept = true;
          spaced = true;
        }

        if (!isEscaped && char === "\\") {
          accept = true;
          isEscaped = true;
        }

        if (/'|"|\{/.test(char) && !isEscaped && leading.length === 1) {
          accept = true;
          leading.push({ "{": "}" }[char] || char);
          leadingPos.push(cursor)
        }

        isEscaped = false;

        let Previous = consumed.charAt(consumed.length - 1);
        if (/\s/.test(Previous)) {
          Previous = "";
        }

        if (accept || leading.length > 1 || Allowed.test(char) || (Allowed.test(Previous) && Strict.test(char)) || (char == "-" && Previous == "-")) {
          consumed += char;
          i++;
        } else return {
          errorMsg: `unexpected token ${char} in JSX element`,
          coords: cursor
        };
      }

      if (leading.length) return {
        errorMsg: `missing ${leading.pop()} in JSX element`,
        coords: leadingPos.pop()
      };

      return { match: consumed, tag }
    } else return {};
  }

  JSX() {
    let reg = this.MatchJSX(this.chunk);
    if (reg.match && (!this.prev().length || this.Opening.includes(this.prev()[0]) || ['AS', 'AT', 'FROM', 'DEFAULTS', ':', 'NEWLINE'].includes(this.prev()[0]) || /*[...this.Callable, ...this.postfixeables].includes(this.prev()[0]) &&*/ this.prev().spaced)) {
      if ("IDENTIFIER SUCH SUPER PROPERTY ] INDEX_END CALL_END ) } SYMBOL_EXISTS )>".split(' ').includes(this.prev()[0]) && this.prev().spaced) {
        let b = this.skipped === this.indentLevel;
        if (b && this.inExplicit()) {
          this.skipped.pop();
        }
        if (this.prev()[0] === "SYMBOL_EXISTS") {
          this.prev()[0] = "FUNC_EXISTS";
        }
        this.token(
          'CALL_START',
          '(',
          { generated: true }
        );

        ++this.indentLevel;
        this.insertStage('call', 'implicit', 1);
      } else if (this.uncontinuous.includes(this.prev()[0]) && this.prev().spaced) {
        if (this.isPossibleArray()) {
          this.createImplicitArray();
        }

        this.token('NEWLINE', 0, { generated: true });
      }

      let leading = [], position = this.position, pairs = [], i = 0, chunk = this.chunk, char = "", prevChar = "", fragments = [], lastFragment = i, cursor = { ...this.cursor };
      let indentLevel = this.indentLevel;
      let leadingPos = [cursor];
      while (char = chunk.charAt(i)) {
        let onTop = !['"', "'"].includes(pairs[pairs.length - 1]);
        if (char === "\n") {
          cursor.x = 0;
          cursor.y++;
        }

        let indentMatch = new RegExp("^(\\n[\\s]*?)+((\\t| {" + this.tabSize + "})+|)?"), indentValue;
        if (indentValue = indentMatch.exec(chunk.slice(i))) {
          let [input, , indent] = indentValue;

          let check;
          while (check = new RegExp("^\\n((\\t| {" + this.tabSize + "})+|)").exec(chunk.slice(i + input.length))) {
            input += check[0];
            indent = check[1];
          }

          let newlines = input.split('').filter(n => n == "\n").length;

          if (typeof indent == "undefined") {
            indent = 0;
          } else indent = indent.split(new RegExp(" {" + this.tabSize + "}|\t", "g")).slice(1).length;

          // Anyway, we update it before everything else
          cursor.y += newlines;
          cursor.x = input.split('\n').pop().length + 1;

          if ((i - lastFragment) > 0) fragments.push(this._token('STRING', chunk.slice(lastFragment, i)));

          if (indent > indentLevel) {
            var tag = "INDENT";

            while (indentLevel !== indent) {
              ++indentLevel;
            }

            fragments.push(this._token('INDENT', input, { $$accept: true, pair: position, indent: true }));
          } else if (indent < indentLevel) {
            --indentLevel;
            fragments.push(this._token('OUTDENT', indent))
          }

          position++;
          i += input.length;
          lastFragment = i;
          continue;
        }

        if (char === "<" && onTop) {
          let { tag, match, errorMsg, coords } = this.MatchJSX(chunk.slice(i));
          if (errorMsg) {
            throwSyntaxError({
              message: errorMsg,
              location: { first_line: cursor.y + coords.y, first_column: cursor.x + coords.x, last_column: cursor.x + coords.x + 1, last_line: cursor.y + coords.y, src: join(this.sdir, this.filename) },
              type: 'error'
            });
          } else {
            let selfClosing = /\/\s*>$/.test(match) && tag, matchedClosing = /^<\//.test(match);
            if (selfClosing && matchedClosing) {
              throwSyntaxError({
                message: 'a JSX element may close itself, or may close another element, but not both',
                location: { first_line: cursor.y, first_column: cursor.x, last_column: cursor.x + match.length, last_line: cursor.y, src: join(this.sdir, this.filename) },
                type: 'error'
              });
            } else {
              if (matchedClosing) {
                let last = leading.pop();
                if (tag !== last) {
                  throwSyntaxError({
                    message: last ? `expected <${last}> to be closed before closing <${tag}>` : `<${tag}> must be opened first before closing it`,
                    location: { first_line: cursor.y, first_column: cursor.x, last_column: cursor.x + match.length, last_line: cursor.y, src: join(this.sdir, this.filename) },
                    type: 'error'
                  });
                }
              } else if (!selfClosing) {
                leading.push(tag);
                leadingPos.push({ ...cursor })
              }
            }
          }
        }

        cursor.x++;
        i++;

        if (char === "{" && onTop) {
          let tokens, length, isTypeScript;
          ({ tokens, length, isTypeScript } = new Lexer(chunk.slice(i), { isInterpolation: true, cursor }));
          fragments.push(this._token('STRING', chunk.slice(lastFragment, i - 1)), this._token('INTERPOLATION_START', '{'), ...tokens, this._token('INTERPOLATION_END', '}'));
          lastFragment = i + length + 1;
          prevChar = '}';
          i += length + 1;
          if (isTypeScript) this.isTypeScript = true;
          continue;
        }

        if (char === "'" || char === '"') {
          if (!pairs.length) pairs.push(char)
          else if (pairs[pairs.length - 1] === char) pairs.pop();
        }

        prevChar = char;

        if (char === '>' && onTop && !leading.length) {
          fragments.push(this._token('STRING', chunk.slice(lastFragment, i)));
          break;
        }
      }

      if (leading.length) {
        cursor = leadingPos.pop();
        throwSyntaxError({
          message: `missing closing </${leading.pop()}>`,
          location: { first_line: cursor.y, first_column: cursor.x, last_column: cursor.x, last_line: cursor.y, src: join(this.sdir, this.filename) },
          type: 'error'
        });
      }

      let pair = this.position + 1;
      this.tokens.push(
        this._token('JSX_START', '', { pair }),
        ...fragments,
        this._token('JSX_END', '', { pair })
      );

      return i;
    }

    return 0;
  }

  Literal() {
    let ref, reg, isColon;
    if (this.isELSON) {
      reg = /^(\[|\{|\}|\]|:|,|-?>|=>?|[*-])/;
      isColon = /^(:|=>?|-?>)/.test(this.chunk);
    } else {
      reg = /^([=!]==|=[<>=]|->|([+-/%!^]|[<>*&|]{1,2})=|[*<>]{1,2}|\|{1,2}|&{1,2}|;|:(?!:)|\.\.\.|\??\.|\?{1,2}|@|\,|\-{1,2}|\+{1,2}|\^|\/|\[|\]|\{|\}|\(|\)|\!|~|=)/;
    }

    if (ref = reg.exec(this.chunk)) {
      let [input, token] = ref, pair, origin, output = true;

      if (isColon) {
        if (!/]|}/.test(this.prev()[0])) this.prev().spaced = false;
        origin = token;
        token = ":";
      }

      if (this.isELSON && /^[*-]$/.test(token)) {
        if (this.prev()[0] === "NEWLINE" && this.prev().isNext2GenArr) {
          this.tokens.splice(-2, 2, this._token('NEWLINE', 0, { generated: true }));
          this.storeBefore(['array', this.position]);
        } else {
          if (this.isPossibleArray()) {
            this.createImplicitArray(this.prev()[0] === 'INDENT');
          } else if (!["NEWLINE", "INDENT"].includes(this.prev()[0])) {
            this.token('NEWLINE', 0)
          }
        }

        return 1;
      }

      if (!/\.(\.\.)?/.test(token) && (this.prev()[0] === ',' || this.prev()[0] === "NEWLINE" && this.prev().comma) && this.inImplicitObj()) {
        let comma = this.tokens.pop();
        this.closeImplicitObjects(false, true);
        this.tokens.push(comma);
      }

      if (!this.isELSON && (/\{|\[|\.(\.\.)?/.test(token) && (token === "." && !this.prev()[0] || (["IDENTIFIER", "PROPERTY", "SYMBOL_EXISTS"].includes(this.prev()[0]) && this.prev().spaced && !(/^\s*(\n|;)/.test(this.chunk.slice(token.length)) && this.opLine)) || this.prev()[0] && !["IDENTIFIER", "PROPERTY", "]", "INDEX_END", "STRING_END", "STRING", "REGEX", "REGEX_END", ".", ")", "CALL_END", "}", "THIS", "SUCH", "SUPER", "OUTDENT"].includes(this.prev()[0])))) {
        if (!/\{ *\n/.test(this.chunk) & this.prev() && this.prev()[0] && "IDENTIFIER SUCH SUPER PROPERTY ] INDEX_END ) CALL_END } SYMBOL_EXISTS".split(' ').includes(this.prev()[0])) {
          let b;
          if ((this.prev()[0] === "IDENTIFIER") && (this.inClass() && !(b = this.skipped === this.indentLevel) || this.assertTokens("CLASS IDENTIFIER", "CLASS IDENTIFIER <( .+ )>") !== undefined)) {
            this.token(
              'PARAM_START',
              '(',
              { generated: true, pair: this.position }
            );
            this.paramLine = true;
            this.prev().stageId = this.store(['param', this.position]);
            this.prev().fromClass = this.inClass();
          } else if (!this.stage().typeKwd) {
            if (b) {
              this.skipped.pop();
            }
            if (this.inClass() && this.opLine) {
              this.opLine = false;
              this.opLevel = -1;
            }
            if (this.prev()[0] === "SYMBOL_EXISTS") {
              this.prev()[0] = "FUNC_EXISTS";
            }
            this.token(
              'CALL_START',
              '(',
              { generated: true, pair: this.position }
            );

            ++this.indentLevel;
            this.insertStage('call', 'implicit', 1);
          }
        } else if (!/\{ *\n/.test(this.chunk) && this.opLine && this.prev() && (this.prev()[0] == "WITH" || this.prev()[0] === "WITHIN") || this.prev()[0] === ")>" && this.funcLine === this.cursor.y && !this.stages.find(s => s.contains.find(c => c.includes("param"))) || this.assertTokens('CLASS IDENTIFIER') !== undefined) {
          this.token(
            'PARAM_START',
            '(',
            { generated: true, pair: this.position }
          );
          this.paramLine = true;
          this.prev().pair = this.indentLevel;
          this.prev().stageId = this.store(['param', this.position]);
        }
        if (token === ".") this.token('THIS', 'this', { generated: true });
      }

      if (token == ";" && (this.forLine !== this.cursor.y || this.forStage[this.forStage.length - 1] !== this.stages.length)) {
        let stage = this.stages.length - this.stages.map(i => i).reverse().findIndex(s => (s.type === "indent") || (s.type === "explicit"));
        this.close();
        if (!["indent", "explicit", "indent&call"].includes(this.stage().type)) {
          this.closeTo(stage);
        }

        if (this.stage().typeKwd && this.inExplicit() && this.prev()[0] !== ",") {
          this.token(',', ',', { generated: true })
        }

        this.token('NEWLINE', Math.max((/^\n+/.exec(this.chunk.slice(1)) || [""])[0].length - 1, 0), { origin: ';', generated: true })
        return 1;
      }

      if ((token === ":") && (this.trueStage().label === "switch") && this.opLine && /\s*\n/.test(this.chunk.slice(1))) {
        return 1;
      } else if (token === ":" && !this.prev().spaced && [']', 'STRING', 'STRING_END'].includes(this.prev()[0]) && !(this.currExplicit() === "}")) {
        let tk = [];
        if (this.prev()[0] === "STRING") {
          tk = [this.tokens.pop()]
        } else if (["STRING_END", "]"].includes(this.prev()[0])) {
          let id = this.tokens.findIndex(t => (t[0] === this.prev()[0].replace('END', 'START').replace(']', '[')) && (t.pair === this.prev().pair));
          tk = this.tokens.splice(id, this.tokens.length - id);
          if (this.prev()[0] === "READONLY") {
            tk.unshift(this.tokens.pop());
          }
        }

        if (!this.stage().contains.find(o => o[0] === "object")) {
          tk = tk.map(t => ++t.lvl && t);
          if ((this.prev()[0] == "NEWLINE") && (this.prev()[1] === 0) && (this.prev().isNext2GenObj || (this.tokens.slice(-2)[0] || [])[0] === "}")) {
            let brace = this.tokens.slice(-2)[0];
            let stageId = this.tokens.slice(-2)[0].stageId;
            this.tokens.splice(this.tokens.length - 2, 2);
            this.tokens.push(this._token('NEWLINE', 0, { inImplicitObj: true }));
            this.storeAt(stageId, ['object', brace ? brace.pair : this.position])
          } else {
            this.tokens.push(this._token('{', '{', { generated: true, pair: this.position }));
            this.stage().lastValue = this.prev().stageId = this.store(['object', this.position]);
          }
        } else {
          if (this.prev()[0] === ":") {
            this.tokens.push(this._token('{', '{', { generated: true, pair: this.position }));
            this.prev().stageId = this.store(['object', this.position]);
          }
        }
        this.tokens = [...this.tokens, ...tk];
      } else if (token === ":" && this.assertTokens('CLASS IDENTIFIER <( .+ )>') !== undefined) {
        this.token('EXTENDS', 'extends', { generated: true });
        return 1;
      } else if (token === ":" && this.prev().spaced && (this.stage().quotedIf && this.stage().quotedIf.length)) {
        let stage = this.stages.length - this.stages.map(i => i).reverse().findIndex(s => (s.type === "indent") || (s.type === "explicit"));
        this.close(false, 0, true);
        if (!["indent", "explicit", "indent&call"].includes(this.stage().type)) {
          this.closeTo(stage, true);
        }
      }

      let Open = ["(", "[", "{"],
        Close = [")", "]", "}"],
        prev = this.prev(), insertThen;

      let x;
      if (this.explicit.find(explicit => explicit[0] === ")>") || this.stage().typeKwd || this.funcLine === this.cursor.y || this.assertTokens('CLASS', 'CLASS IDENTIFIER', 'CLASS IDENTIFIER WITH') !== undefined || (x = this.prev()[0] === "WITH" || this.prev()[0] === "WITHIN")) {
        Open.push('<');
        Close.push('>');
      }

      var _ref, closure;
      if ((_ref = Open.indexOf(token)) > -1) {
        if ((token === "(") && ![...this.Opening, "NEWLINE"].includes(prev && prev[0]) && (prev && ["FUNCTION", "WITH", "WITHIN", ...this.Callable].includes(prev[0]) || this.assertTokens('CLASS IDENTIFIER') !== undefined || this.stage().typeKwd === "interface")) {
          let z;
          if (this.funcLine === this.cursor.y || (this.prev()[0] === "WITH" || this.prev()[0] === "WITHIN" || this.prev()[0] === ")>" && this.funcLine === this.cursor.y && !this.stages.find(s => s.contains.find(c => c.includes("param")))) || this.assertTokens('CLASS IDENTIFIER') !== undefined) {
            _ref = "PARAM_END";
            token = "PARAM_START";
          } else if ((this.inClass() || this.stage().typeKwd === "interface") && ((this.prev()[0] === "IDENTIFIER") || this.prev()[0] === ")>" || (this.prev().spaced && (this.prev()[0] === "WITH" || this.prev()[0] === "WITHIN") && (!this.stage().typeKwd && this.funcLine === this.cursor.y || this.stage().typeKwd === "interface") && !this.stages.find(s => s.contains.find(c => c.includes("param")))) || (z = !this.prev()[2].generated && ["INDENT", "NEWLINE"].includes(this.prev()[0])))) {
            _ref = "PARAM_END"
            token = "PARAM_START";
            if (z) this.token("WITH", "with", { generated: true, spaced: true });
          } else if (this.Callable.includes(this.prev()[0])) {
            if (((this.currExplicit() === "}" && this.stage().label === undefined)) && this.prev()[0] === "IDENTIFIER" && /^(NEWLINE|INDENT|,|\{)$/.test(this.tokens.slice(-2)[0][0])) {
              token = "PARAM_START";
              _ref = "PARAM_END";
              if (!this.opLine) {
                this.opLine = "function";
                this.opLevel = this.stages.length;
                this.funcLine = this.cursor.y
              }
            } else {
              if (this.prev()[0] === "SYMBOL_EXISTS") {
                this.prev()[0] = "FUNC_EXISTS";
              }
              if (this.prev()[0] === "IMPORT") {
                this.prev()[0] = "IDENTIFIER";
              }
              token = "CALL_START";
              _ref = "CALL_END"
            }
          } else { _ref = ")"; }
        } else if (!this.isELSON && (token === "[") && !this.prev().spaced && this.indexables.includes(this.prev()[0])) {
          token = "INDEX_START"
          _ref = "INDEX_END"
        } else if (!this.isELSON && (token === "[") && !this.prev().spaced && (this.prev()[0] === ".") && this.tokens.slice(-2)[0] && (this.tokens.slice(-2)[0][0] === "THIS") && (this.tokens.slice(-2)[0][2].generated)) {
          this.tokens.pop();
          token = "INDEX_START";
          _ref = "INDEX_END";
        } else if (token === "<") {
          if (x) {
            this.funcLine = this.cursor.y;
            this.opLevel = this.stages.length;
            this.opLine = 'function';
          }
          _ref = ")>";
          token = "<(";
        } else {
          _ref = Close[_ref]
        }

        if ((token !== "{" && !/^\{ *\n/.test(this.chunk)) && (token !== "PARAM_START" && token !== "<(") && (this.prev()[0] === "WITH" || this.prev()[0] === "WITHIN" || this.prev()[0] === ")>" && this.funcLine === this.cursor.y && !this.stages.find(s => s.contains.find(c => c.includes('param'))))) {
          this.token(
            'PARAM_START',
            '(',
            { generated: true, pair: this.position }
          );

          if (!this.opLine) {
            this.opLine = 'function';
            this.opLevel = this.stages.length;
          }

          this.paramLine = true;
          this.prev().stageId = this.store(['param', this.position]);
        } else if (((token !== "(") && (token !== "CALL_START") && token !== "<(") && !(this.stage().typeKwd && token === "{") && (!this.opLine) && "SUCH SUPER IDENTIFIER PROPERTY ] INDEX_END CALL_END ) } SYMBOL_EXISTS".split(' ').includes(this.prev()[0]) && this.prev().spaced && !this.paramLine) {
          let b = this.skipped === this.indentLevel;
          if (b && this.inExplicit()) {
            this.skipped.pop();
          }
          if (this.prev()[0] === "SYMBOL_EXISTS") {
            this.prev()[0] = "FUNC_EXISTS";
          }
          this.token(
            'CALL_START',
            '(',
            { generated: true, pair: this.position }
          );
          ++this.indentLevel;
          this.insertStage('call', 'implicit', 1);
        }

        let inExplicit = this.inExplicit();

        let cc = /^(WHILE|UNTIL|WITH|WITHIN|CATCH|FOR)$/.test(this.prev()[0]) && !this.prev().cc && token === "(";

        if (cc) {
          this.prev().cc = true;
          output = false;
        }

        if (token == "{" && (this.funcLine === this.cursor.y || (this.opLine) && !inExplicit) && [...this.postfixeables.slice(0, 8), "THEN"].includes(this.prev()[0])) {
          if (!(this.prev()[0] === "DEFAULTS") && !(this.prev()[0] === ",") && !(this.prev()[0] === ":")) {
            this.close();
            this.closeTo(this.opLevel);
            if (this.funcLine === this.cursor.y) this.funcLine = -1;

            if (this.prev()[0] !== "THEN" && this.inClass()) {
              this.token("THEN", "", { generated: true });
            }
          }
        }

        this.explicit.push([_ref, this.indentLevel, pair = output ? this.position + 1 : this.position, this.stages.length, cc]);

        let prevStage = this.stage(), prevTrueStage = this.trueStage();
        this.insertStage('explicit', _ref, 0);

        if (prevStage.typeKwd || prevTrueStage.typeKwd) {
          this.stage().typeKwd = prevStage.typeKwd || prevTrueStage.typeKwd;
        }
      } else if (Close.includes(token)) {
        let __ = this.rmNL();
        let $ref = token;
        if ((token === ")") && (this.currExplicit() === "CALL_END")) $ref = "CALL_END";
        else if ((token === "]") && (this.currExplicit() === "INDEX_END")) $ref = "INDEX_END";
        else if ((token === ")") && (this.currExplicit() === "PARAM_END")) { $ref = "PARAM_END"; this.paramLine = false }
        else if ((token === "}") && (this.currExplicit() === "}}")) $ref = token = "}}"
        else if ((token === "}") && !this.explicit.length && this.isInterpolation) {
          $ref = token = "INTERPOLATION_END"
        } else if (token === ">") {
          $ref = token = ")>";
        }

        if ((this.explicit.slice(-1)[0] && (this.currExplicit()) === $ref) || ($ref === "INTERPOLATION_END")) {
          let _lv = $ref === "INTERPOLATION_END" ? 0 : this.explicit.slice(-1)[0][3];
          this.close();
          this.closeTo(_lv);

          this.rmNL();

          closure = this.explicit.pop() || $ref;
          if (Array.isArray(closure) && closure[4]) insertThen = true;
        } else {
          if (!this.explicit.length) {
            throw "unexpected " + token
          } else {
            throw `${this.cursor.y}:${this.cursor.x}` + " missing " + this.currExplicit()
          }
        }
      }

      if ("[()]".split("").includes(token)) {
        switch (token) {
          case "(":
          case "[": {
            if ((token === "(") && !([...this.Opening, "NEWLINE"].includes(prev[0])) && (!prev || ["FUNCTION", "WITH", "WITHIN"].includes(prev[0]) || !prev.spaced)) {
              if (this.funcLine === this.cursor.y || (this.prev()[0] === "WITH" || this.prev()[0] === "WITHIN") || this.assertTokens('CLASS IDENTIFIER') !== undefined) {
                if (this.funcLine === this.cursor.y) this.funcLine = -1;
                token = "PARAM_START";
                this.paramLine = true;
              } else if (this.inClass() && ((this.prev()[0] === "IDENTIFIER") || (this.prev().spaced && (this.prev()[0] === "WITH" || this.prev()[0] === "WITHIN")) || (!this.prev()[2].generated && ["INDENT", "NEWLINE"].includes(this.prev()[0])))) {
                token = "PARAM_START"
                this.paramLine = true;
              } else if ("SUCH SUPER IDENTIFIER PROPERTY ] INDEX_END CALL_END ) } SYMBOL_EXISTS".split(" ").includes(this.prev()[0])) {
                if ((this.inExplicit() || (this.currExplicit() === "}" && this.stage().label === undefined)) && this.prev()[0] === "IDENTIFIER" && /^(NEWLINE|INDENT|,|\{)$/.test(this.tokens.slice(-2)[0][0])) {
                  token = "PARAM_START;"
                } else {
                  if (this.prev()[0] === "SYMBOL_EXISTS") {
                    this.prev()[0] = "FUNC_EXISTS";
                  }
                  token = "CALL_START";
                }
              } else token = "("
            } else if (!this.isELSON && (token === "[") && !this.prev().spaced && this.indexables.includes(this.prev()[0])) {
              token = "INDEX_START";
            } else if (!this.isELSON && (token === "[") && !this.prev().spaced && (this.prev()[0] === ".") && this.tokens.slice(-2)[0] && (this.tokens.slice(-2)[0][0] === "THIS") && (this.tokens.slice(-2)[0][2].generated)) {
              token = "INDEX_START";
            }
            break;
          };
          case ')':
          case ']': {
            token = closure[0];
            break;
          };
        };
      }

      if (token === ",") {
        if (this.stage().label !== ")") {
          this.rmNL();
        } else {
          if (this.stage().label === ")" && !this.stage().contains.length && ![this.forLine, this.funcLine, this.portLine].includes(this.cursor.y)) {
            token = "NEWLINE";
          }
        }
      }

      if (token === "|" && this.prev()[0] === "NEWLINE" && !this.prev()[2].generated && this.prev()[1] < 2 && !this.stage().typeKwd) {
        this.rmNL();
        output = false;
        input = /^(\|\s*)/.exec(this.chunk)[0];
      }

      if ((token === "|" || token === "&") && this.stage().typeKwd) {
        token = "TYPE_JOIN";
      }

      if (/^(\^|[&|]{1,2}|\+|\-|\*|\/|\%|[<>]{2,3})=/.test(token)) {
        origin = token;
        token = 'MATH_BIN';
      }

      if (/^(===?|!==?|[><]=?)$/.test(token) && /^(&&|AND)$/.test(this.prev()[0])) {
        this.prev()[2].origin = this.prev()[1];
        this.prev()[0] = "COMPOUND_AND"; // If not in a When or Multicondition rule, it will throw anyways.
      }

      if (token === "/") {
        token = "DIVISION";
        origin = "/";
      }

      if (/^([-=]>|=)$/.test(token)) {
        switch (this.prev()[0]) {
          case "]":
          case "}": {
            let lp = this.tokens.map(t => (t[0] === (this.prev()[0] === "]" ? "[" : "{")) && t.pair).lastIndexOf(this.prev().pair), Param = this.tokens.slice(lp);



            this.tokens.splice(lp, Param.length,
              this._token('PARAM_START', '(', {
                generated: true
              }),
              ...Param,
              this._token('PARAM_END', ')', { generated: true })
            );
            break;
          };
          default: {
            let x;
            if ("THIS . PROPERTY" === this.tokens.slice(-3).map(i => i[0]).join(" ") && this.tokens.slice(-3)[0].generated) {
              x = 3;
            } else if (this.prev()[0] === "IDENTIFIER") {
              x = 1
            }

            if (x) {
              this.tokens.splice(this.tokens.length - x, 0, this._token('PARAM_START', '(', { generated: true }));
              this.token('PARAM_END', ')', { generated: true });
            } else {
              if (this.prev()[0] === ')') {
                let brace = this.prev();
                this.tokens.forEach(token => {
                  token.pair === brace.pair && (token[0] = ({
                    "(": "PARAM_START",
                    ")": "PARAM_END"
                  })[token[0]])
                })
              } else if (this.prev()[0] !== "PARAM_END") {
                if (this.uncontinuous.includes(this.prev()[0]) && this.isPossibleArray()) {
                  this.createImplicitArray();
                }

                if (this.uncontinuous.includes(this.prev()[0])) {
                  if (!['NEWLINE', 'INDENT', 'CALL_START', 'INDEX_START', '[', '{'].includes(this.prev()[0])) {
                    this.token('NEWLINE', 0, { generated: true });
                  }

                  this.token('PARAM_START', '(', { generated: true });
                  this.token('PARAM_END', ')', { generated: true });
                }
              }
            }

            break;
          }
        };

        if (!this.opLine) {
          this.opLine = "FUNC_DIRECTIVE";
          this.opLevel = this.stages.length;
        }

        token = "FUNC_DIRECTIVE";
      }

      if (token === "?" && ["SUCH", "SUPER", "IDENTIFIER", "PROPERTY", "]", "INDEX_END", "CALL_END", ")", "}"].includes(this.prev()[0]) && !this.prev().spaced) {
        token = "SYMBOL_EXISTS";
        origin = "?";
      } else if (token === "?") {
        (this.stage().contains[this.stage().contains.length - 1] || {}).break = true;
      }

      if (token === "?.") {
        origin = token;
        token = ".";
      }

      if (token === "?") {
        if (!this.stage().quotedIf) this.stage().quotedIf = [];
        this.stage().quotedIf.push(1);
      }

      if (token === ':') {
        if (!this.stage().quotedIf) this.stage().quotedIf = [];
        this.stage().quotedIf.pop();
      }

      if (token === "::" && !this.prev().spaced && ["IDENTIFIER", "PROPERTY", "]", ")", "}", "CALL_END", "INDEX_END", "}", "THIS", "SUCH"].includes(this.prev()[0]) && !/^\s+/.test(this.chunk.slice(input.length))) {
        return 0;
      }

      // if (insertThen) {
      //   this.token('THEN', 'then', { generated: true });
      //   this.prev().canBlock = true;
      //   output = false;
      //   this.opLine = false;
      //   this.opLevel = -1;
      // }

      if (output) {
        if (/^([<>=!]=|[!=]==|>{1,3}|<{1,2}|\*{1,2}|\^|%|&{1,2}|\|{1,2}|\?|:|DIVISION|MATH_BIN|\}|\]|,|\)|INDEX_END|CALL_END|PARAM_END)$/.test(token)) {
          this.rmNL();
        }

        this.token(token, input, { pair: pair ? pair : closure && closure[2] || undefined, origin });
      }

      if (token === "PARAM_START") this.paramLine = true;
      if (token === "PARAM_END") this.paramLine = false;

      if (token === "(") this.prev().$$accept = true;

      if (token === "," || token === "..." && this.isPossibleArray()) {
        if ((this.forLine !== this.cursor.y || this.forLineArrayGen) && this.isPossibleArray()) {
          this.createImplicitArray(undefined, token === "...");
        } else if (this.forLine === this.cursor.y) {
          if (this.prev()[0] === ",") this.prev().$$accept = true;
          this.forLineArrayGen = true;
        }
      }

      if (token === "," && this.stage().assignKwd) {
        this.stage().seenEquals = false;
      }

      return input.length;
    }
  }

  Number() {
    let ref, exp = /^(0b[01](?:_?[01])*n?|^0o[0-7](?:_?[0-7])*n?|^0x[\da-f](?:_?[\da-f])*n?|^\d+n|^-?(?:\d(?:_?\d)*)?\.?(?:\d(?:_?\d)*)+(?:e[+-]?(?:\d(?:_?\d)*)+)?)(:)?/i;
    if (exp.test(this.chunk)) {
      let [, match, colon] = exp.exec(this.chunk), tag;

      if (match.startsWith(".") && !this.prev().spaced) return;
      if (colon) return; // pass to Identifier instead

      if (this.prev()[0] === ".") {
        match = match.indexOf(".") > -1 ? match.slice(0, match.indexOf(".")) : match
        this.tokens.pop();
        this.token("INDEX_START", "[", { generated: true });
        this.token("NUMBER", match);
        this.token("INDEX_END", "]", { generated: true, });
        this.prev()[2].first_column = this.cursor.x + match.length;
        return match.length;
      } else {
        if ("SUCH SUPER IDENTIFIER PROPERTY ] INDEX_END CALL_END ) } SYMBOL_EXISTS".split(' ').includes(this.prev()[0]) && this.prev().spaced) {
          let b = this.skipped === this.indentLevel;
          if (b && this.inExplicit()) {
            this.skipped.pop();
          }
          if (this.prev()[0] === "SYMBOL_EXISTS") {
            this.prev()[0] = "FUNC_EXISTS";
          }
          this.token(
            'CALL_START',
            '(',
            { generated: true }
          );
          ++this.indentLevel;
          this.insertStage('call', 'implicit', 1);
        } else if (this.uncontinuous.includes(this.prev()[0]) && this.prev().spaced) {
          if (this.isPossibleArray()) {
            this.createImplicitArray();
          }

          this.token('NEWLINE', 0, { generated: true });
        }

        let comma;

        if ((comma = this.prev()[0] === ",") && this.inImplicitObj()) {
          let i = this.stage().contains.findIndex(s => s[0] === "object");
          this.close(false, i);

          if (this.isPossibleArray()) {
            this.createImplicitArray();
          }

          this.token('NEWLINE', 0, {
            isNext2GenObj: true,
            generated: true
          });
        }

        if (parseInt(match) === 2e308) {
          tag = "INFINITY"
        } else {
          tag = "NUMBER"
        }
      }

      this.token(tag, match);
      return match.length;
    }

  }

  Whitespace() {
    if (/^( )+/.test(this.chunk)) {
      this.prev().spaced = true;
      return /^( )+/.exec(this.chunk)[0].length;
    }
  }

  Identifier() {
    let isNumber,
      reg = this.isELSON ?
        /^()((?:[^\x00-\x7F]|[a-z$_])(?:[^\x00-\x7F]|[a-z$_\d])*)(\s*(:|=>?|-?>))/i
        :
        /^(::)?((?:[^\x00-\x7F]|[a-z$_])(?:[^\x00-\x7F]|[a-z$_\d])*)(\??:(?!:))?/i,
      numReg = this.isELSON ?
        /^()(0b[01](?:_?[01])*n?|^0o[0-7](?:_?[0-7])*n?|^0x[\da-f](?:_?[\da-f])*n?|^\d+n|^(?:\d(?:_?\d)*)?\.?(?:\d(?:_?\d)*)+(?:e[+-]?(?:\d(?:_?\d)*)+)?)(\s*(:|=>?|-?>))/i
        :
        /^(::)?(0b[01](?:_?[01])*n?|^0o[0-7](?:_?[0-7])*n?|^0x[\da-f](?:_?[\da-f])*n?|^\d+n|^(?:\d(?:_?\d)*)?\.?(?:\d(?:_?\d)*)+(?:e[+-]?(?:\d(?:_?\d)*)+)?)(\??:(?!:))?/i;
    if (reg.test(this.chunk) || (numReg.test(this.chunk) && (isNumber = true))) {
      let [input, proto, token, colon] = (!isNumber ? reg : numReg).exec(this.chunk), tag, isExtend, optionalSymbol;

      if (colon === "?:" && (!this.stage().typeKwd && !this.paramLine)) {
        colon = false;
        input = token;
      } else if (colon === "?:") {
        optionalSymbol = colon;
      }

      if (proto) {
        [['.'], ['PROPERTY', 'prototype'], ['.']].forEach(([t, v = t]) => {
          this.token(t, v, { generated: true, origin: '::' });
        });
      }

      let prev = this.prev();

      if (this.isELSON && !colon) return;

      if (prev && prev[0] && prev.spaced && "SUCH SUPER IDENTIFIER PROPERTY ] CALL_END ) } SYMBOL_EXISTS )>".split(' ').includes(prev[0]) || this.stage().typeKwd === "interface" && this.prev()[0] === "NEW") {
        if (this.isELSON) return;

        let b;
        if ((prev[0] === "IDENTIFIER" || prev[0] === ")>") && this.inClass() && !(b = this.skipped === this.indentLevel) || (this.funcLine === this.cursor.y) || this.assertTokens("CLASS IDENTIFIER", "CLASS IDENTIFIER <( .+ )>") !== undefined || this.stage().typeKwd === "interface") {
          this.token(
            'PARAM_START',
            '(',
            { generated: true, pair: this.position }
          );

          if (!this.stage().typeKwd && !this.opLine) {
            this.opLine = 'function';
            this.opLevel = this.stages.length;
          }

          this.paramLine = true;
          this.prev().stageId = this.store(['param', this.position]);
          this.prev().fromClass = this.inClass();
        } else {
          if (b && this.inExplicit()) {
            this.skipped.pop();
          }

          if (this.inClass() && this.opLine) {
            this.opLine = false;
            this.opLevel = -1;
          }
          if (this.prev()[0] === "SYMBOL_EXISTS") {
            this.prev()[0] = "FUNC_EXISTS";
          }
          prev = this.token(
            'CALL_START',
            '(',
            { generated: true }
          );

          ++this.indentLevel;
          this.insertStage('call', 'implicit', 1);
        }
      } else if (this.opLine && prev && (prev[0] == "WITH" || prev[0] == "WITHIN")) {
        this.token(
          'PARAM_START',
          '(',
          { generated: true, pair: this.position }
        );
        this.paramLine = true;
        this.prev().stageId = this.store(['param', this.position]);
      }

      if (this.prev()[0] === ".") {
        tag = "PROPERTY"
      } else {
        tag = "IDENTIFIER";
        if (this.uncontinuous.includes(this.prev()[0]) && this.prev().spaced) {
          if (this.isELSON) return;
          if (this.isPossibleArray()) {
            this.createImplicitArray();
          }

          this.token('NEWLINE', 0, { generated: true });
        }

        if (colon && this.prev()[0] === "CLASS") {
          colon = false;
          isExtend = true;
        }
      }

      let i;

      if ((tag == "IDENTIFIER") && !colon && (this.prev()[0] == ",") && (i = this.stage().contains.findIndex(s => s[0] === "object")) > -1) {
        this.tokens.pop();
        this.closeImplicitsTo(i, false);

        if (this.isPossibleArray()) { // flaghere
          this.createImplicitArray();
        }

        this.token('NEWLINE', 0, {
          isNext2GenObj: true,
          generated: true
        });
      }

      if ((tag === "IDENTIFIER") && !colon && this.prev().comma && this.isPossibleArray()) {
        if (["indent", "unfinished"].includes(this.stage().type)) { // flaghere
          this.createImplicitArray();
        }
      }

      if (!colon && tag === "IDENTIFIER" && ((token === "this") || (token === "such") || (token === "super") || (token === "function"))) {
        tag = token.toUpperCase();
      }

      let b = ((this.trueStage().label === "switch") && (this.opLine || /^(default|otherwise|else)$/.test(token)) && /^\s*(\{\s*)?\n/.test(this.chunk.slice(input.length)));

      this.token(tag, token);
      if (((tag == "IDENTIFIER") || (tag == "VARIDENTIFIER") || (tag == "THIS") || (tag == "SUCH") || (tag == "SUPER") || this.assertTokens('THIS . PROPERTY') !== undefined && this.tokens.slice(-3)[0][2].generated && this.paramLine) && colon && (this.inExplicit() && (/^(A[ST]|FROM|:|\[|\(|PARAM_START|DEFAULTS)$/.test(prev[0])) || (!this.inExplicit() || this.currExplicit() !== "}") && (this.currExplicit() !== "}" || this.stage().label !== undefined)) && !b) {
        if (!this.stage().contains.find(o => o[0] === "object")) {
          let prev = this.tokens.pop();
          ++prev.lvl;
          prev[0] = "PROPERTY";
          if ((this.prev()[0] == "NEWLINE") && (this.prev()[1] === 0) && (this.prev().isNext2GenObj || (this.tokens.slice(-2)[0] || [])[0] === "}")) {
            let brace = this.tokens.slice(-2)[0];
            let stageId = this.tokens.slice(-2)[0].stageId;
            this.tokens.splice(this.tokens.length - 2, 2);
            this.tokens.push(this._token('NEWLINE', 0, { inImplicitObj: true }), prev);
            this.storeAt(stageId, ['object', brace ? brace.pair : this.position])
          } else {
            let prevs = [prev];
            if (this.prev()[0] === "..." || this.prev()[0] === "READONLY") {
              prevs = [this.tokens.pop(), ...prevs];
            } else if (this.assertTokens('THIS .') !== undefined) {
              prevs = [...this.tokens.splice(this.tokens.length - 2, 2), ...prevs];
            }

            this.tokens.push(this._token('{', '{', { generated: true, pair: this.position }), ...prevs);
            this.stage().lastValue = this.prev().stageId = this.store(['object', this.position]);
          }
        } else {
          let prev = this.tokens.pop();
          prev[0] = "PROPERTY";
          let prevs = [prev];
          if (this.prev()[0] === "...") {
            prevs = [this.tokens.pop(), ...prevs];
          } else if (this.assertTokens('THIS .') !== undefined) {
            prevs = [...this.tokens.splice(this.tokens.length - 2, 2), ...prevs];
          }

          if (this.prev()[0] === ":") {
            this.tokens.push(this._token('{', '{', { generated: true, pair: this.position }), ...prevs);
            this.prev().stageId = this.store(['object', this.position]);
          } else this.tokens = [...this.tokens, ...prevs];
        }
        this.token(':', ':', {
          first_column: this.cursor.x + input.length - 1,
          last_column: this.cursor.x + input.length,
          origin: optionalSymbol
        });
        colon = false;
      }

      if (tag === "IDENTIFIER" && /^(yes|no)$/.test(token)) {
        if (/^(yes|no)$/.test(token)) {
          this.prev()[2].origin = token;
          this.prev()[1] = token === "yes" ? "true" : "false";
          this.prev()[0] = "BOOL";
        }
      }

      if (["SWITCH", "FOR", "UNLESS", "WHILE", "FUNCTION"].includes(tag)) {
        if (tag === "FUNCTION") {
          this.funcLine = this.cursor.y;
        }

        this.opLine = tag.toLowerCase();
        this.opLevel = this.stages.length;

        if (this.tokens.slice(-2)[0] && /^(A[ST]|FROM|:)$/.test(this.tokens.slice(-2)[0][0])) {
          (this.stage().contains[this.stage().contains.length - 1] || [{}])[0].break = true;
        }
      }

      if (colon && !b) {
        this.prev()[0] = "PROPERTY";
        this.token(':', ':', {
          first_column: this.cursor.x + input.length - 1,
          last_column: this.cursor.x + input.length,
          origin: optionalSymbol
        });
      } else if (colon) {
        if (tag === "IDENTIFIER" && /^(default|otherwise|else)$/.test(token)) {
          this.prev()[2].origin = this.prev()[1];
          this.prev()[0] = "DEFAULT";
          this.opLevel = this.trueStageLevel() + 1;
          this.opLine = "default";
        }
      } else if (isExtend) {
        this.token('EXTENDS', 'extends', { generated: true });
      }

      if (!this.names.includes(token)) {
        this.names.push(token);
      }

      return input.length;
    }
  }

  KeywordStatement() {
    // every keyword below, either as JavaScript's or Relic's ones, have their own tag
    // since Relic is literate-like script, we reserve a bunch of keywords
    let reg = this.isELSON ? /^(true|false|yes|no|null|nil|undefined)(:)?(?!(?:[^\x00-\x7F]|[a-zA-Z$_])(?:[^\x00-\x7F]|[a-zA-Z$_\d])*)/ : /^(into|as|and|or|plus|includes|has|function\*?|[gs]et|static|i[fn]|of|or|not|true|false|undefined|nil|null|new|delete|return|void|yield|await|async|either|do|with(?:in)?|whil(?:e|st)|for|whe(?:n|ther)|unless|until|else|loop|has|try|catch|finally|otherwise|then|exists|class(?:\*)?|extends|implements|typeof|keyof|instanceof|is\s+not|is(?:nt)?|defaults?|continue|break|switch|case|when|on|throw|readonly|debugger|using)(:(?!:))?(?!(?:[^\x00-\x7F]|[a-zA-Z$_])(?:[^\x00-\x7F]|[a-zA-Z$_\d])*)/;

    if (reg.test(this.chunk) || !this.isELSON && ((reg = /^(@)\s*/).test(this.chunk) || (reg = /^(with(?:in)?(?=[([{<]))/).test(this.chunk)) || (reg = /^(=(?!(?:>|=)))/).test(this.chunk)) {
      let output = true,
        input, [, token, colon] = reg.exec(this.chunk),
        origin;
      input = token;

      if ((this.prev()[0] == ".") && token !== "=") {
        this.token(
          'PROPERTY',
          token.split(' ')[0]
        );

        return this.prev()[1].length;
      } else {
        if (colon) {
          return;
        }

        if ((this.inClass() && /^[gs]et(;|\s|:)?$/.test(token) && !["NEWLINE", "INDENT"].includes(this.prev()[0]))) {
          return;
        }

        if (token === "readonly" && this.stage().typeKwd !== "interface" || token === "new" && this.stage().typeKwd === "interface") return;
      }

      token = token.split(' ').join('');
      if (token == "extending") { origin = token; token = 'extends' }
      if ((token === "isnot") || (token === "isn't")) { origin = token; token = "isnt" };
      if (token === "function*") {
        token = "function";
        origin = "function*";
      }

      if (token === "=" && [")", "PARAM_END"].includes(this.prev()[0])) return;

      if ((token === "default" && !(this.inSwitch() && (this.portLine !== this.cursor.y) && this.prev()[0] === "NEWLINE")) || (token === "=") || (token === "as")) {
        this.rmNL();
        origin = token; token = "defaults";
      } // when an assign word (either 'default', 'as' or '=') that is inside a parameter scope, will be transformed into defaults

      if ((token === "otherwise" || token === "else") && this.inSwitch() && this.prev()[0] === "NEWLINE") {
        [origin, token] = [token, 'default'];
      }

      if ((token === "defaults") && !this.paramLine) {
        token = "default";
        origin = origin || "defaults";
        if (this.prev()[0] === ":") {
          this.tokens.pop();
        }

        if (this.prev()[0] === "PROPERTY") {
          this.prev()[0] = "IDENTIFIER";
        } else {
          this.rmNL();
        }
      }

      if (token === "otherwise") {
        [token, origin] = ["else", token];
      }

      if (token === "nil") {
        [origin, token] = [token, 'null'];
      }

      if (token === "yes") {
        [origin, token] = [token, 'true'];
      }

      if (token === "no") {
        [origin, token] = [token, 'false'];
      }

      if (token === "class*") {
        [origin, token] = [token, 'class'];
      }

      if (((this.prev()[0] === ",") || (this.prev()[0] === ":" && (["defaults"].includes(token)) && origin !== "=")) && this.inImplicitObj()) {
        let pop;
        if (this.prev()[0] === ",") pop = this.tokens.pop();
        this.closeImplicitObjects(!!pop && token !== "defaults", true);
      }

      if (token === "either") {
        this.stage().eitherLine = this.cursor.y;
        if (this.inSwitch()) {
          this.opLine = token; this.opLevel = this.stages.length
        }
      }

      if (["and", "or", "in", "of", "is", "isnt", "extends", "implements"].includes(token)) {
        this.rmNL();
        let z;
        
        if (["in", "of"].includes(token) && this.forLine === this.cursor.y) {
          origin = token;
          token = "for_" + token;
          this.forLine = -1;
          this.forAssignLine = -1;
          z = this.forLineArrayGen;
          delete this.forLineArrayGen;
          this.forStage.pop();
        }

        let stage = this.stages.length - this.stages.map(i => i).reverse().findIndex(s => (s.type === "indent") || (s.type === "explicit"));
        this.close();
        if (!["indent", "explicit", "indent&call"].includes(this.stage().type)) {
          this.closeTo(stage);
        }

        if ((this.prev()[0] === "]" || z) && token === "for_in") {
          token = "for_as"; // don't mind me, this has to be done.
        }

        if (token === "or" && this.stage().eitherLine === this.cursor.y) token = "either_or";
      }

      if (!this.isELSON && (this.postfixeables.includes(this.prev()[0]) && 'if switch case when within while whilst class new delete await async do for until loop unless @ whether function plus includes has true false undefined null catch finally try'.split(' ').includes(token) || token === "with" && this.prev()[0] && ["PROPERTY", "INDEX_END", "}", "}}", "CALL_END", "SUPER", "SUCH"].includes(this.prev()[0]))) {
        if (!["RETURN", "BREAK", "CONTINUE", "STRING", "STRING_END", "NUMBER", "UNDEFINED", "NULL", "BOOL", "THIS", "REGEX", "REGEX_END", "INFINITY"].includes(this.prev()[0]) && (!["if", "when", "on", "whilst", "for", "unless", "while", "until", "return", "break", "loop", "continue", "function", "plus", "includes", "has", "else", "finally", "catch"].includes(token) || token === "case" && !this.inSwitch())) {
          if (this.prev()[0] === "SYMBOL_EXISTS") {
            this.prev()[0] = "FUNC_EXISTS";
          }
          this.token('CALL_START', '(', { generated: true });

          ++this.indentLevel;
          this.insertStage('call', 'implicit', 1);
        } else if (["if", "for", "unless", "while", "until", "else", "catch", "finally", "when", "on", "whilst", "includes", "has", "plus"].includes(token) || token === "case" && this.inSwitch()) {
          let stage = this.stages.length - this.stages.map(i => i).reverse().findIndex(s => (s.type === "indent") || (s.type === "explicit"));
          this.close();
          if (!["indent", "explicit", "indent&call"].includes(this.stage().type)) {
            this.closeTo(stage);
          }
          let origin;

          if (["catch", "finally"].includes(token)) {
            this.opLine = token;
            this.opLevel = this.stages.length;
          }

          if (token === "for") {
            this.forLine = this.cursor.y;
            this.forStage[this.forStage.length] = this.stages.length
          }

          if (token === "while" && this.forLine === this.cursor.y) {
            token = "whilst";
            origin = 'while';
          }

          if (this.inSwitch() && (this.prev()[0] === "NEWLINE") && ((token === "when") || (token === "case") || (token === "on"))) this.stage().eitherLine = this.cursor.y;

          if (!this.inSwitch() && token == "when" && this.prev()[0] == "]" && this.prev()[2].generated && this.forLine === this.cursor.y) {
            this.tokens = this.tokens.filter((t) => {
              return !(/\[|\]/.test(t[0]) && t.pair == this.prev().pair)
            });
          }

          this.rmNL();
          this.token(
            ({ if: "POSTIF", unless: "POSTUNLESS", for: "POSTFOR", while: "POSTWHILE", until: "POSTUNTIL", case: "POSTCASE", on: "POSTCASE", when: this.forLine === this.cursor.y ? "WHEN" : "POSTCASE" })[token] || token.toUpperCase(),
            token,
            { $$accept: true, origin }
          );

          return token.length
        } else if (this.uncontinuous.includes(this.prev()[0]) && this.prev().spaced) {
          if (this.isPossibleArray()) {
            this.createImplicitArray();
          }

          this.token('NEWLINE', 0, { generated: true });
          (this.stage().contains[this.stage().contains.length - 1] || {}).break = true;
        }
      } else if (!this.isELSON && [":", "=", "AS", "FROM", "AT"].includes(this.prev()[0]) && ["if", "unless", "switch", "for", "while", "try", "with", "within", "either", "async", "until"].includes(token)) {
        (this.stage().contains[this.stage().contains.length - 1] || []).break = true;
      }

      if (["case", "or", "on", "if", "when"].includes(token) && this.inSwitch() && this.prev()[0] === "OR") {
        this.prev()[0] = "COMPOUND_OR";
        this.prev()[2].origin = "OR";
      }

      if ((token === "case" && !this.inSwitch()) || token === "whether") {
        token = "!";
        this.token('!', '!', { origin: 'case' });
      }

      if ((token == "if") || (token == "switch") || (token == "case") || (token == "on") || (token == "when") || (token == "while") || (token == "class") || (token == "with") || (token == "within") || (token == "function") || (token == "else") || (token == "otherwise") || (token == "return") || (token == "unless") || (token == "until") || (token == "loop") || (token == "for") || (token == "try") || (token == "catch") || (token == "async") || (token == "finally") || (token == "using") || ((!this.inClass() && this.stage().typeKwd !== "interface") && /[gs]et/.test(token))) {
        if (!this.opLine || this.opLine === "else" || this.opLine === "otherwise") {
          // What do we know?
          if (!/[gs]et/.test(token)) {
            this.opLine = token;
            this.opLevel = this.stages.length;
          } else {
            return;
          }
        }
        if (token == "function") {
          this.funcLine = this.cursor.y;
        }
        if (token == "async" && this.funcLine !== this.cursor.y) {
          this.funcLine = this.cursor.y;
        }
        if (token === "for") {
          this.forLine = this.cursor.y;
        }

        if ((token === "with" || token === "within") && undefined === this.assertTokens("CLASS IDENTIFIER", "CLASS IDENTIFIER <( .+ )>")) {
          let travel = this.assertTokens(
            `IDENTIFIER <( .+ )>`,
            `IDENTIFIER`,
            `<( .+ )>`,
          );

          let crop = travel !== undefined ? this.popTokens(travel) : [];

          let _prevTag = () => this.prev()[0];
          while (/ASYNC|[GS]ET|STATIC/.test(_prevTag())) {
            crop.unshift(this.tokens.pop());
          }

          if ("FUNCTION" !== _prevTag()) {
            this.token(`FUNCTION`, `function`, { generated: true, origin: token });
          }

          if (crop.length) this.tokens.push(...crop);
        }
      }

      if ((token == "else") || (token == "otherwise") || (token == "then" || token === "into") || (token == "or") || (token == "in") || (token == "either_or") || (token == "and") || (token == "catch") || (token == "finally")) {
        this.rmNL();
      }

      let _type;
      if (token == "then" && this.opLine && this.opLevel === this.trueStageLevel()) {
        this.rmNL();
        this.close();
        this.closeTo(this.opLevel);

        this.actExp = this.opLine;
        this.opLine = false;
        this.opLevel = -1;

        if (this.actExp === "if" && this.prev()[0] !== ")") {
          let lookup = [...this.tokens].reverse().findIndex(t => {
            return t[0] === "IF" && this.stage().id === t.stage
          });

          if (lookup > -1) {
            let rearrange = this.popTokens(this.tokens.length - lookup);
            let pair = this.position + 1;
            this.token('(', '(', { generated: true, pair });
            this.tokens.push(...rearrange);
            this.token(')', ')', { generated: true, pair })
          }
        }

        if (this.prev()[0] === "THEN") {
          if (this.prev()[2].generated) {
            _type = this.tokens.pop()[2].type;
          }

          this.tokens.pop();
        }
      } else if (token === "then" || token === "into") {
        this.closeTo(this.trueStageLevel());
        origin = token;
        token = 'CHAIN';
      }

      if (/^(true|false|null|undefined)$/.test(token)) {
        this.token(
          /true|false/.test(token) ? "BOOL" : token.toUpperCase(),
          token.trim(),
          { origin }
        );
      } else if (output) {
        this.token(
          token.trim().toUpperCase(),
          token.trim(),
          { origin, $$accept: token !== "!" }
        );

        if (_type) this.prev()[2].type = _type;
      }

      return input.length;
    }
  }

  Assign() {
    let reg = /^((?:at|from|as)(:)?\s|=(?!(?:=|>)))/;
    if (reg.test(this.chunk)) {
      let [, token, colon] = reg.exec(this.chunk), len = token.length, origin, wordlenght;

      token = token.trim();
      wordlenght = token.length;

      if (token === "=" && ["PARAM_END", ")"].includes(this.prev()[0])) {
        return;
      }

      if ((token == "=") || (token == "as")) {
        if (this.paramLine) {
          return;
        }

        if (token == "=") {
          if (this.prev()[0] === ":") {
            this.tokens.pop();
            if (this.prev()[0] === "PROPERTY" && ((this.tokens.slice(-2)[0] || [])[0] !== ".")) {
              this.prev()[0] = "IDENTIFIER";
            }
          }

          origin = token;
          token = "as";
        } else if (this.prev()[0] === "DEFAULTS") {
          this.prev()[0] = "DEFAULT";
        } else if (this.prev()[0] === "EXPORT") {
          origin = token;
          token = "default"
        }
      } else {
        if ((this.prev()[0] == ".") && !colon) {
          this.token(
            'PROPERTY',
            token
          );

          return len;
        } else {
          if (colon) {
            return;
          }
        }
      }

      this.rmNL();
      let ch = token === "as" && (this.portLine === this.cursor.y || (this.stage().type === "indent") && ((this.stage().label === "import") || (this.stage().label === "export")));

      if (!origin) {
        if (!ch) this.closeImplicitObjects();
        this.assignLine = -1;
        if (token !== 'as' && this.forLine === this.cursor.y) {
          this.forLine = -1;
          this.forAssignLine = -1;
          delete this.forLineArrayGen;
          token = "for_" + token;
          this.close(false);
        }
      }

      // as from, as at...
      if ((token !== "as") && !origin && this.prev()[0] === "AS") {
        this.tokens.pop();
        origin = "as " + token
      }

      this.token(token.toUpperCase(), token, { origin, $$accept: origin !== "=" || this.stage().typeKwd || this.inClass() });

      if (this.inClass()) {
        this.skipped = this.indentLevel;
      }

      if (this.stage().assignKwd) this.stage().seenEquals = true;

      return wordlenght;
    }
  }

  // We treat newlines and semicolons here. If a newline is followed by a tab or at least 4 spaces, or if the prev token's tag is unfinished, it's called indent. 
  Separator() {
    let reg = new RegExp("^(\\n[\\s]*?)+((\\t| {" + this.tabSize + "})+|)?");
    if (reg.test(this.chunk)) {
      let [input, , indent] = reg.exec(this.chunk), unfinished = this.isUnfinished();

      let check;
      while (check = new RegExp("^\\n((\\t| {" + this.tabSize + "})+|)").exec(this.chunk.slice(input.length))) {
        input += check[0];
        indent = check[1];
      }

      let newlines = input.split('').filter(n => n == "\n").length;

      if (typeof indent == "undefined") {
        indent = 0;
      } else indent = indent.split(new RegExp(" {" + this.tabSize + "}|\t", "g")).slice(1).length;

      let currPosition = { ...this.cursor }; // We don't use 'this.cursor' directly to avoid inconsistences

      // Anyway, we update it before everything else
      currPosition.y += newlines;
      currPosition.x = input.split('\n').pop().length + 1;

      const updatePosition = () => {
        this.cursor.y = currPosition.y;
        this.cursor.x = currPosition.x;
        this.forceCursorAtX = true;
      }

      if (this.inClass() && this.prev()[0] === "PROPERTY") {
        if (this.opLine) {
          this.opLine = false;
          this.opLevel = -1;
        }
      }

      if (this.opLine) {
        this.closeTo(this.opLevel, true);
        this.rmNL();
        this.actExp = this.opLine;
        this.opLine = false;
        this.opLevel = -1;
        this.forceIndent = true;

        if (this.funcLine === this.cursor.y) this.funcLine = -1;
      }

      var aligned =
        input.split('\n').pop().slice((this.trueStage().indent - 1) * this.tabSize)
        +
        /^\s*/.exec(this.chunk.slice(input.length))[0], seemsLikeAligned = true;

      if (!this.inTrueExplicit() && this.trueStage().assignKwd && aligned.length === (this.trueStage().assignKwd.length + 1)) {

        this.closeToIndent(false, this.trueStage().indent);
      }

      if (indent == this.indentLevel) {
        if ((this.prev()[0] === "{") && this.actExp) {
          this.explicit[this.explicit.length - 1][0] = "}}";
          this.prev()[0] = "{{";
        }

        this.actExp = false;
        let comma;

        if ((this.prev()[0] === ",") || (this.prev()[0] === "NEWLINE") && this.prev().comma) comma = this.tokens.pop();

        let dontMerge, nlloc;
        if (this.prev()[0] === "NEWLINE") {
          newlines += (nlloc = this.tokens.pop())[1];
        }

        if (newlines > 1) {
          this.close();
          dontMerge = true;
        } else {
          if (this.inClass()) {
            this.close();
          } else this.closeImplicitObjects(false, !!comma, !!comma);
          dontMerge = false;
        }

        if (this.stage().typeKwd && this.stage().typeKwdOrigin && this.assertTokens("TYPE IDENTIFIER AS") === undefined) {
          this.stage().typeKwd = "";
          this.stage().typeKwdOrigin = false;
        }

        this.stage().quotedIf = undefined;
        this.skipped = -1;

        let addNewlines = !this.Unfinished.includes(this.prev()[0]),/*
        dontMerge = (/]|}/.test(this.prev()[0]) || (this.prev().isNext2GenArr && this.prev().comma) || this.prev().isNext2GenObj) && newlines > 1,*/
          bool = this.stage().contains.length

        if (comma) {
          this.rmNL();
        }

        if (addNewlines && newlines && bool) {
          this.token('NEWLINE', Math.max(newlines - 1, 0), {
            isNext2GenObj: !dontMerge && (this.prev()[0] === "}") && this.prev()[2].generated,
            isNext2GenArr: !dontMerge && (this.prev()[0] === "]") && this.prev()[2].generated,
            $$accept: !dontMerge
          });
        }

        if (addNewlines && (this.prev()[0] !== "NEWLINE") && (this.prev()[0] !== "INDENT")) {
          this.token('NEWLINE', Math.max(newlines - 1, 0), {
            isNext2GenObj: !dontMerge && (this.prev()[0] === "}") && this.prev()[2].generated,
            isNext2GenArr: !dontMerge && (this.prev()[0] === "]") && this.prev()[2].generated,
            $$accept: true
          })
        }

        if (dontMerge) {
          this.prev().$$accept = true;
          delete this.prev().isNext2GenArr;
          delete this.prev().isNext2GenObj;
        }

        this.prev().comma = !!comma;

        if ((newlines > 1) && this.stage().assignKwd) this.stage().assignKwd = "";

        if (this.inClass() && (!this.opLine)) {
          this.opLine = 'function';
          this.opLevel = this.stages.length;
        }

        if (bool) {
          this.prev().inImplicitObj = true
        }

        if (this.stage().assignKwd) {
          this.stage().seenEquals = false;
        }

        if (this.prev()[0] === "NEWLINE" && nlloc) {
          Object.assign(this.prev()[2], { first_column: nlloc[2].first_column, first_line: nlloc[2].first_line });
        }

        updatePosition();
        return input.length;
      } else if (indent > this.indentLevel) {
        let bool;
        if ((this.stage().contains.map(i => i[0]).includes('object')) && (this.prev()[0] !== ":")) {
          bool = true;
        }

        if (this.actExp && (this.prev()[0] !== "OUTDENT") && (this.prev()[0] !== "NEWLINE") && !bool && (this.prev()[0] !== "IF") && (this.prev()[0] !== "SWITCH") && (this.prev()[0] !== "WHILE") && (this.prev()[0] !== "[") && (this.prev()[0] !== "{") && (this.prev()[0] !== "(" && (this.prev()[0] !== ":") && !/^(A[ST]|FROM)$/.test(this.prev()[0]))) {
          this.close(false, 0, true);

          let t;
          if (this.inClass()) {
            if ((this.prev()[0] !== "PARAM_END") && (this.prev()[0] !== "WITH" && this.prev()[0] !== "WITHIN") && this.prev()[0] == "IDENTIFIER") {
              this.token('WITH', 'with', {
                generated: true
              })
            }
          }

          if (this.inClass()) {
            t = true;
          }

          let indents = 0;

          while (this.indentLevel !== indent) {
            ++this.indentLevel;
            ++indents;
          }

          if (this.actExp === "if" && ![")", "THEN"].includes(this.prev()[0])) {
            let lookup = [...this.tokens].reverse().findIndex(t => {
              return t[0] === "IF" && this.stage().id === t.stage
            });

            if (lookup > -1) {
              let rearrange = this.popTokens(this.tokens.length - lookup);
              let pair = this.position + 1;
              this.token('(', '(', { generated: true, pair });
              this.tokens.push(...rearrange);
              this.token(')', ')', { generated: true, pair })
            }

            this.token('THEN', 'then', { generated: true });
          }

          this.token('INDENT', input, { $$accept: true, pair: this.position + 1 });

          this.insertStage('indent', this.actExp, indents);

          if (t && this.actExp !== "function") {
            while (this.prev()[0] === "NEWLINE") {
              this.tokens.pop();
            }
            this.opLine = this.actExp = 'function';
            this.opLevel = this.stages.length;
          } else this.actExp = false;
        } else {
          var tag = "INDENT", inArrayLevel = this.stage().contains.map(i => i[0]).includes('array'),
            inTypeStatement = this.stage().typeKwd,
            inAssignChain = !inTypeStatement && !!this.stage().assignKwd,
            output = true;

          let t, type = 'indent';

          let indents = 0;

          while (this.indentLevel !== indent) {
            ++this.indentLevel;
            ++indents;
          }

          let close = true;

          if ((this.prev()[0] === "{") && this.actExp || this.prev()[0] === "{" && this.tokens[this.tokens.length - 2] && this.tokens[this.tokens.length - 2].canBlock) {
            this.explicit[this.explicit.length - 1][0] = "}}";
            this.prev()[0] = "{{";
          } else if ("IDENTIFIER SUCH SUPER PROPERTY ] INDEX_END CALL_END ) } SYMBOL_EXISTS".split(' ').includes(this.prev()[0]) && !this.actExp && !inAssignChain && !this.stage().typeKwd) {
            if (!this.inClass() || !(this.assertTokens("THIS . PROPERTY") === undefined || this.prev()[0] === "IDENTIFIER")) {
              if (this.prev()[0] === "SYMBOL_EXISTS") {
                this.prev()[0] = "FUNC_EXISTS";
              }
              tag = "CALL_START";
              type = "call";
              close = false;
            } else if (!["WITH", "PARAM_END"].includes(this.prev()[0])) {
              this.token("PARAM_START", "(", { generated: true });
              this.token("PARAM_END", ")", { generated: true });
            }
          } else if (!this.actExp && /^AT|AS|FROM|:$/.test(this.prev()[0])) {
            close = false;
          }

          if (close) this.close(false, 0, true);

          if ([inArrayLevel, inAssignChain].includes(true)) {
            if (this.prev()[0] === "NEWLINE") {
              this.tokens.pop();
            }
          }

          if (output) {
            this.insertStage(type === "call" ? "indent&call" : type, type === "call" ? "implicit" : this.actExp, indents);

            if (inAssignChain) {
              this.stage().assignKwd = inAssignChain
            }

            if (inTypeStatement) {
              this.stage().typeKwd = inTypeStatement;
            }

            if (this.inClass()) {
              while (this.prev()[0] === "NEWLINE") {
                this.tokens.pop();
              }

              this.opLine = 'function';
              this.opLevel = this.stages.length;
            }
          }

          this.token(tag, input, { $$accept: true, pair: this.position, indent: true });

          this.actExp = false;
        }

        updatePosition();
        this.skipped = -1;
        return input.length;
      } else if (indent < this.indentLevel) {
        while (this.prev()[0] == "NEWLINE") {
          this.tokens.pop();
        }

        let comma;
        if (this.prev()[0] === ",") this.tokens.pop();

        this.closeToIndent(indent);

        if (((!this.stage().contains.length) || !(this.stage().type === "explicit"))) {
          if (this.stage().type === "call") {
            this.close();
          }

          if (newlines > 1) { // we can add up to 2 newlines
            this.token('NEWLINE', Math.max(newlines - 1, 0), { $$accept: true });
          }
        }

        let dontMerge;
        if (newlines > 1) {
          this.close();
          dontMerge = true;
          this.stage().assignKwd = "";
        } else {
          this.closeImplicitObjects(false, !!comma, !!comma);
          dontMerge = false;
        }

        if (this.stage().typeKwdOrigin) {
          this.stage().typeKwd = "";
          this.stage().typeKwdOrigin = false;
        }
        if ((this.prev()[0] !== "NEWLINE") && (this.prev()[0] !== "INDENT")) {
          this.token('NEWLINE', Math.max(newlines - 1, 0), {
            isNext2GenObj: (this.prev()[0] === "}") && this.prev()[2].generated,
            isNext2GenArr: (this.prev()[0] === "]") && this.prev()[2].generated,
            $$accept: !(/}|]/.test(this.prev()[0]) && !this.prev()[2].generated)
          })
        }

        this.prev().comma = !!comma;

        this.actExp = false;

        if (this.inClass()) {
          this.opLine = this.actExp = 'function';
          this.opLevel = this.stages.length;
        }

        this.skipped = -1;
        updatePosition();
        return input.length;
      }

      updatePosition();
      return input.length;
    }
  }

  Regex() {
    let match = /^(\/)((?:\n|.|[$#]\{(?:.|\n)+\})*)(?<!\\)\1/.exec(this.chunk);

    if (Array.isArray(match)) {
      let [input, slash, exp] = match, flags = "";
      let i = 1, chunk = this.chunk, char = "", prevChar = "", fragments = [], lastFragment = i, isInsideSet = false;

      while (char = chunk.charAt(i)) {
        if ((char === slash) && !isInsideSet && ((prevChar !== "\\") || chunk.charAt(Math.max(0, i - 2)) === "\\")) {
          i++;
          if (flags = /^[gimsy]+/.exec(chunk.slice(i))) {
            flags = flags[0];
            i += flags.length
          }
          break;
        }

        if ((char === "[") && prevChar !== "\\") {
          isInsideSet = true;
        } else if ((char === "]") && isInsideSet && prevChar !== "\\") {
          isInsideSet = false;
        }

        if ((char === "{") && /[$#]/.test(prevChar) && ((chunk.charAt(Math.max(0, i - 2)) !== "\\") || (chunk.charAt(Math.max(0, i - 3)) === "\\"))) {
          let tokens, length, isTypeScript;
          ({ tokens, length, isTypeScript } = new Lexer(chunk.slice(i + 1), { isInterpolation: true, cursor: this.cursor, filename: this.filename }));

          fragments.push(this._token('REGEX', chunk.slice(lastFragment, i - 1)), this._token('INTERPOLATION_START', '${'), ...tokens, this._token('INTERPOLATION_END', '}'));
          lastFragment = i + length + 2;
          prevChar = '}';
          i += length + 2;
          if (isTypeScript) this.isTypeScript = true;
          continue;
        }

        i++;
        prevChar = char;
      }

      if (chunk.slice(lastFragment, i - 1)) fragments.push(this._token('REGEX', chunk.slice(lastFragment, i - 1)))

      if ("IDENTIFIER SUCH SUPER PROPERTY ] INDEX_END CALL_END ) } SYMBOL_EXISTS )>".split(' ').includes(this.prev()[0]) && this.prev().spaced) {
        let b = this.skipped === this.indentLevel;
        if (b && this.inExplicit()) {
          this.skipped.pop();
        }
        if (this.prev()[0] === "SYMBOL_EXISTS") {
          this.prev()[0] = "FUNC_EXISTS";
        }
        this.token(
          'CALL_START',
          '(',
          { generated: true }
        );

        ++this.indentLevel;
        this.insertStage('call', 'implicit', 1);
      }

      switch (fragments.length) {
        case 1: {
          fragments[0][1] = `/${fragments[0][1]}${flags ? flags : "/"}`;
          fragments[0][2].last_column += 2 + (flags && flags.length - 1 || 0);

          this.tokens.push(fragments[0]); break;
        };
        default: this.tokens.push(
          this._token('REGEX_START', slash),
          ...fragments,
          this._token('REGEX_END', flags)
        ); break;
      }

      return this.chunk.slice(0, i).length;
    }
  }

  importPath() {
    let reg = /^(([a-zA-Z]:[\/\\])?((?:(\w+|\.{1,2})[\/\\])+\w*(\.\w+)*|(?:(\w+|\.{1,2})[\/\\])*\w+(\.\w+)+)|\.)/i;

    if (reg.test(this.chunk) && this.prev()[0] === "IMPORT" && this.prev().spaced) {
      let match = reg.exec(this.chunk);
      if (!match[0]) return;

      if (typeof existsSync !== 'function') {
        throwSyntaxError({
          message: 'Unable to load imports in browser compiler. This function should only be used when bundling.',
          location: { first_line: this.cursor.y, first_column: this.cursor.x, last_column: this.cursor.x + match[0].length, last_line: this.cursor.y, src: join(this.sdir, this.filename) },
          type: 'error'
        }, this.code.split("\n")[this.cursor.y - 1]);
      }

      let file = resolvePath(match[0], this.dirname), dirname = _dirname(file);

      if (fileIsDir(file)) {
        file = join(file, 'index.rc');
      }

      if (!existsSync(file)) {
        let msg = "file not found";
        throwSyntaxError({
          message: msg,
          location: { first_line: this.cursor.y, first_column: this.cursor.x, last_column: this.cursor.x + match[0].length, last_line: this.cursor.y, src: join(this.sdir, this.filename) },
          type: 'error'
        }, this.code.split("\n")[this.cursor.y - 1]);
      } else if (this.cantImport.includes(relative(file, this.sdir))) {
        let msg = "prevented endless loop from import";
        throwSyntaxError({
          message: msg,
          location: { first_line: this.cursor.y, first_column: this.cursor.x, last_column: this.cursor.x + match[0].length, last_line: this.cursor.y, src: join(this.sdir, this.filename) },
          type: 'error'
        }, this.code.split("\n")[this.cursor.y - 1]);
      }

      let source = readFileSync(file, { encoding: 'utf-8' });

      let Include = new Lexer(source, {
        isInclude: true,
        filename: relative(this.sdir, file),
        sdir: this.dirname,
        dirname,
        cantImport: this.cantImport.concat(relative(file, this.sdir))
      });

      this.portLine = -1;
      this.opLevel = -1;
      this.opLine = false;
      this.tokens.pop();
      this.tokens.push(...Include.tokens);
      this.comments = [...this.comments, ...Include.comments].filter(Boolean);
      return match[0].length;
    }
  }

  String() {
    let match = /^("|'|`)((?:\n|.|[$#]\{(?:.|\n)+\})*)(?<!\\)(\1)/.exec(this.chunk),
      sling = /^\\([^\s\n]+)/.exec(this.chunk)

    if (match) {
      let [input, quote, string] = match, cursor = { ...this.cursor };
      cursor.x++; // we count the quote token;
      let i = 1, chunk = this.chunk, char = "", prevChar = "", fragments = [], lastFragment = i, isPaired;

      function isNotEscaped(to_index = 0) {
        let sReg = /(\\+)$/.exec(chunk.slice(0, (i) - to_index));
        if (!sReg) return true;
        let [, slashes] = sReg;
        if (slashes.length % 2) return false;
        else return true;
        return
      }

      while (char = chunk.charAt(i)) {
        if (char === "\n") {
          cursor.x = 0;
          cursor.y++;
        }
        cursor.x++;

        if ((char === quote) && isNotEscaped()) {
          i++;
          isPaired = true;
          break;
        }

        let hashsymbol;
        if (!this.isELSON && (char === "{") && ((hashsymbol = /\$|#/.test(prevChar)) && isNotEscaped(1) || isNotEscaped())) {
          let tokens, length, isTypeScript;
          ({ tokens, length, isTypeScript } = new Lexer(chunk.slice(i + 1), { isInterpolation: true, cursor }));
          fragments.push(this._token('STRING', chunk.slice(lastFragment, i - (+hashsymbol))), this._token('INTERPOLATION_START', '${'), ...tokens, this._token('INTERPOLATION_END', '}'));
          lastFragment = i + length + 2;
          prevChar = '}';
          i += length + 2;
          if (isTypeScript) this.isTypeScript = true;
          continue;
        }

        i++;
        prevChar = char;
      }

      if (!isPaired) {
        throwSyntaxError({
          message: 'This string needs to be closed',
          location: { first_line: this.cursor.y, first_column: this.cursor.x, last_column: this.cursor.x + match[0].length, last_line: this.cursor.y, src: join(this.sdir, this.filename) },
          type: 'error'
        }, this.code.split("\n")[this.cursor.y - 1]);
      }

      if (chunk.slice(lastFragment, i - 1)) fragments.push(this._token('STRING', chunk.slice(lastFragment, i - 1)))

      if ("IDENTIFIER SUCH SUPER PROPERTY ] INDEX_END CALL_END ) } SYMBOL_EXISTS )>".split(' ').includes(this.prev()[0]) && this.prev().spaced) {
        let b = this.skipped === this.indentLevel;
        if (b && this.inExplicit()) {
          this.skipped.pop();
        }
        if (this.prev()[0] === "SYMBOL_EXISTS") {
          this.prev()[0] = "FUNC_EXISTS";
        }
        this.token(
          'CALL_START',
          '(',
          { generated: true }
        );

        ++this.indentLevel;
        this.insertStage('call', 'implicit', 1);
      } else if (this.uncontinuous.includes(this.prev()[0]) && this.prev().spaced) {
        if (this.isPossibleArray()) {
          this.createImplicitArray();
        }

        this.token('NEWLINE', 0, { generated: true });
      }

      switch (fragments.length) {
        case 0: this.token('STRING', quote.repeat(2)); break;
        case 1: {
          if (this.prev()[0] === "IMPORT") {
            if (typeof existsSync !== "function") {
              throwSyntaxError({
                message: 'Unable to load imports in browser compiler. This function should only be used when bundling.',
                location: { first_line: this.cursor.y, first_column: this.cursor.x, last_column: this.cursor.x + fragments[0][1].length + 2, last_line: this.cursor.y, src: join(this.sdir, this.filename) },
                type: 'error'
              }, this.code.split("\n")[this.cursor.y - 1]);
            }

            let file = resolvePath(fragments[0][1], this.dirname), dirname = _dirname(file);

            if (!existsSync(file)) {
              let msg = "file not found: " + file;
              throwSyntaxError({
                message: msg,
                location: { first_line: this.cursor.y, first_column: this.cursor.x, last_column: this.cursor.x + fragments[0][1].length + 2, last_line: this.cursor.y, src: join(this.sdir, this.filename) },
                type: 'error'
              }, this.code.split("\n")[this.cursor.y - 1]);
            } else if (this.cantImport.includes(relative(file, this.sdir))) {
              let msg = "prevented endless loop from import";
              throwSyntaxError({
                message: msg,
                location: { first_line: this.cursor.y, first_column: this.cursor.x, last_column: this.cursor.x + match[0].length, last_line: this.cursor.y, src: join(this.sdir, this.filename) },
                type: 'error'
              }, this.code.split("\n")[this.cursor.y - 1]);
            }

            let source = readFileSync(file, { encoding: 'utf-8' });

            let Include = new Lexer(source, {
              isInclude: true,
              filename: relative(this.sdir, file),
              sdir: this.dirname,
              dirname,
              cantImport: this.cantImport.concat(relative(file, this.sdir))
            });

            this.portLine = -1;
            this.opLevel = -1;
            this.opLine = false;
            this.tokens.pop();
            this.tokens.push(...Include.tokens);
            this.comments = [...this.comments, ...Include.comments].filter(Boolean);
            if (Include.isTypeScript) this.isTypeScript = true;
            break;
          }

          this.tokens.push(Object.assign(fragments[0], {
            1: `${quote}${fragments[0][1]}${quote}`, 2: {
              ...fragments[0][2],
              last_column: fragments[0][2].last_column + 2
            }
          })); break;
        }
        default: {
          let pair = this.position + 1;
          this.tokens.push(
            this._token('STRING_START', quote, { pair }),
            ...fragments,
            this._token('STRING_END', quote, { pair, loc: { last_column: cursor.x, last_line: cursor.y } })
          ); break;
        }
      }

      return i;
    } else if (sling) {
      let [input, string] = sling;
      string = string.replace(/(?:\\*)"|\\+/g, function (s) {
        let slashes = (/^\\+/.exec(s) ?? [])[0], qt = s.endsWith('"');

        if (qt) {
          if (!slashes || (slashes.length % 2) === 0) {
            return s.slice(0, -1) + '\\"';
          }

          return s;
        } else {
          if ((slashes.length % 2) === 0) {
            return s;
          } else return s + '\\';
        }
      });

      if ("IDENTIFIER SUCH SUPER PROPERTY ] INDEX_END CALL_END ) } SYMBOL_EXISTS )>".split(' ').includes(this.prev()[0]) && this.prev().spaced) {
        let b = this.skipped === this.indentLevel;
        if (b && this.inExplicit()) {
          this.skipped.pop();
        }
        if (this.prev()[0] === "SYMBOL_EXISTS") {
          this.prev()[0] = "FUNC_EXISTS";
        }
        this.token(
          'CALL_START',
          '(',
          { generated: true }
        );

        ++this.indentLevel;
        this.insertStage('call', 'implicit', 1);
      } else if (this.uncontinuous.includes(this.prev()[0]) && this.prev().spaced) {
        if (this.isPossibleArray()) {
          this.createImplicitArray();
        }

        this.token('NEWLINE', 0, { generated: true });
      }

      this.token('STRING', `"${string}"`, {
        loc: {
          first_column: this.cursor.x,
          first_line: this.cursor.y,
          last_line: this.cursor.y,
          last_column: this.cursor.x + input.length
        }
      });
      return input.length;
    }
  }

  Comment() {
    let match = /^([{#][:?])/.exec(this.chunk) || /^(#|\/\/)/.exec(this.chunk) || /^(\/\*)/.exec(this.chunk)

    if (!match) return 0;

    let BlockComment, LineComment, DefComment;
    BlockComment = match[0] === "/*";
    DefComment = /[{#][:?]/.test(match[0]);
    LineComment = !BlockComment && !DefComment;

    let end;
    let Comment;
    if (BlockComment) {
      let pair = /\*\//g.exec(this.chunk);

      if (!pair) {
        return 0;
      }

      Comment = this._token("COMMENT", this.chunk.slice(2, pair.index));
      this.cursor.y = Comment[2].last_line;
      this.cursor.x = Comment[2].last_column;
      this.forceCursorAtX = true;
      this.comments.push({ ...Comment, inline: false, id: this.comments.length, addNewlines: (/^\n*/.exec(this.chunk.slice(pair.index + 2)) || [""])[0].length, loc: Comment[2] });
      return pair.index + 2
    } else if (DefComment) {
      let i = 1, braces = [], pair = {};
      while (true) {
        i++;

        if (!this.chunk.charAt(i)) return 0;

        if (this.chunk.charAt(i) === "\n" && match[0][0] === "#") break;
        if (this.chunk.charAt(i) === "}") {
          if (!braces.length) {
            break;
          }

          braces.pop();
        }

        if (this.chunk.charAt(i) === "{") {
          braces.push(1);
        }
      }

      Comment = this._token("COMMENT", this.chunk.slice(2, i).trim().split('\n').map(s => s.trim()).join('\n'));
      this.cursor.y = Comment[2].last_line;
      this.cursor.x = Comment[2].last_column;
      this.forceCursorAtX = true;
      this.comments.push({ ...Comment, jsdoc: true, id: this.comments.length, addNewlines: (/^\n*/.exec(this.chunk.slice(i + 1)) || [""])[0].length, loc: Comment[2] });
      return i + (match[0][0] === "#" ? 0 : 1);
    } else {
      let ref;
      let pair;
      if (match[0] === "#") {
        pair = (ref = /#/.exec(this.chunk.slice(1).split(/\n/)[0])) ? 2 + ref.index : false
      }

      if (!pair) {
        pair = match[0].length + this.chunk.slice(match[0].length).split(/\n/)[0].length;
      }

      Comment = this._token("COMMENT", this.chunk.slice(match[0].length, ref ? pair - 1 : pair));
      this.comments.push({ ...Comment, inline: ref ? false : true, id: this.comments.length, addNewlines: (/^\n*/.exec(this.chunk.slice(pair)) || [""])[0].length, loc: Comment[2] });
      return pair
    }
  }

  _token(tag, value, { lvl, loc, origin, generated, inImplicitObj, isNext2GenArr, isNext2GenObj, $$accept, pair, cursor, ...info } = {}) {
    let token = [tag, value];

    token.lvl = typeof lvl == "undefined" ? this.indentLevel : lvl;
    token[2] = loc || {
      first_column: (cursor || this.cursor).x,
      first_line: (cursor || this.cursor).y,
      last_column: generated ? (cursor || this.cursor).x : '?',
      last_line: generated ? (cursor || this.cursor).y : (cursor || this.cursor).y + (typeof value === "string" ? (value !== "\n" ? value.split(/\n/) : value.repeat(2)).length - 1 : 1),
      indented: (this.prev()[2] || {}).indent,
      ...info
    }

    if (token[2].last_column === "?") {
      let comp = origin ? origin : value;
      if (token[2].last_line !== token[2].first_line) {
        token[2].last_column = (typeof comp === "string" ? (comp !== "\n" ? comp.split(/\n/).pop().length : token[2].first_column + 1) : token[2].first_column + 1);
      } else {
        token[2].last_column = token[2].first_column + (typeof comp === "string" ? comp.length : 1);
      }
    }

    if (origin) token[2].origin = origin;
    if (generated) token[2].generated = true;
    if (inImplicitObj) token.inImplicitObj = true;
    if (isNext2GenArr) token.isNext2GenArr = true;
    if (isNext2GenObj) token.isNext2GenObj = true;
    if ($$accept) token.$$accept = true;
    if (pair) token.pair = pair;
    token.stage = this.stage().id

    token[2].src = this.filename;

    return token;
  }

  token(...args) {
    let token = this._token.apply(this, args);
    token.hash = this.position++;
    token.inImplicit = this.inImplicit();
    this.tokens[this.tokens.length] = token;
    return token;
  }

  createImplicitArray(inclusive, dotted) {
    let x, z;
    let i = this.tokens.map(i => i).reverse().findIndex((token) => {
      if (((token[0] === "NEWLINE") || token.$$accept || ["AS", ":"].includes(token[0]) && dotted) && token.lvl === this.indentLevel) {
        if (token[0] === "NEWLINE") {
          if (token.isNext2GenObj && token.comma && !token.inImplicitObj) return;
          if (token.inImplicitObj) return;
        }

        if (token.isNext2GenArr) {
          z = token.lvl;
        }

        if (token[0] == "INDENT") {
          x = token.lvl
        }

        return true
      }
    });

    if (i > 0 - +(!!inclusive)) {
      i = this.tokens.length - i;
      if (!this.tokens[i]) {
        this.tokens.push(Object.assign(this._token('[', '[', { generated: true, pair: this.position }), {
          stageId: this.storeBefore(['array', this.position])
        }))
      } else if ((typeof z === "undefined") && (typeof x === "undefined") && this.tokens[i][0] !== "[") {
        this.tokens.splice(i, 0,
          Object.assign(this._token('[', '[', { generated: true, pair: this.position }), {
            stageId: this.storeBefore(['array', this.position])
          }));

      } else if (typeof z === "number") {
        let { stageId, hash } = this.tokens[i - 2];
        this.tokens.splice(i - 2, 1);
        this.storeAt(stageId, ['array', hash]);
      } else if (typeof x === "number") {
        if (this.tokens[i][0] !== "[") {
          this.tokens.splice(i, 0, Object.assign(this._token('[', '[', { generated: true, pair: this.position }), {
            stageId: this.storeBefore(['array', this.position])
          }));
        }
      }
    } else if (i === 0) {
      return;
    } else if ((this.stage().contains.findIndex(y => y[0] === "array")) === -1) {
      this.tokens.splice(0, 0, Object.assign(this._token('[', '[', { generated: true, pair: this.position }), {
        stageId: this.storeBefore(['array', this.position])
      }));
    }
  }

  fix() {
    if (this.explicit.length) {
      let explicit = this.currExplicit(), data = this.explicit.pop(), matching;
      matching = ({
        ")": "(",
        "]": "[",
        "}": "{",
        "}}": "{{",
        ")>": "<(",
        CALL_END: "CALL_START",
        INDEX_END: "INDEX_START"
      })[explicit];

      explicit = ({ CALL_END: ")", INDEX_END: ")", ")>": ">", "}}": "}" })[explicit] || explicit;
      throwSyntaxError({
        message: `Missing "${explicit}" for this token`,
        location: this.tokens.find(t => t.pair === data[2] && t[0] === matching)[2]
      });
    }

    this.rmNL();
    while (this.tokens[0] && this.tokens[0][0] === "NEWLINE") this.tokens = this.tokens.slice(1);
  }

  Unfinished = 'get static set async new await do with within for when or else until loop try catch then whether case post_case if unless function var const let otherwise as from at import export class extends ? : [ { {{ ( call_start index_start ** division * ~ ^ % math_bin is isnt == === != !== <= >= < > << >> >>> func_exists . indent newline , throw yield && || & |'.split(' ').map(tag => tag.toUpperCase());

  inExplicit() {
    return this.stage().type === "explicit";
  }

  inTrueExplicit() {
    let stg = this.trueStage();
    return stg && ["indent", "explicit"].includes(stg.type)
  }

  currExplicit() {
    return this.explicit.slice(-1)[0] && this.explicit.slice(-1)[0][0];
  }

  rmNL() {
    let data = {};
    while (this.prev()[0] === "NEWLINE") {
      let t;
      for (let i in (t = this.tokens.pop())) {
        if (!data[i]) data[i] = t[i];
      }
    }

    return data;
  }

  isPossibleArray() {
    return (this.stage().type === "indent") && (this.stage().label !== "import") && (this.stage().label !== "export") && !this.stage().contains.length && !this.stage().assignKwd && (this.stage().typeKwd !== "interface") && (this.portLine !== this.cursor.y && this.forAssignLine !== this.cursor.y) && (!this.inExplicit() && !(this.currExplicit() && !this.paramLine && [undefined, 'Root'].includes(this.stage().label)))
  }

  inImplicitObj() {
    return this.stage().contains.map(i => i[0]).includes('object');
  }

  inImplicit() {
    return !!this.stage().contains.length;
  }

  inClass() {
    return this.stage().label === "class";
  }

  inSwitch() {
    return this.stage().label === "switch";
  }

  stage() {
    return this.stages.slice(-1)[0];
  }

  insertStage(type, label, indent) {
    this.stages.push({
      type, label: label || undefined, indent, totalIndent: this.indentLevel, location: { ...this.cursor }, contains: [], position: this.position,
      id: this.stage().id + 1
    });
  }

  store(child) {
    let len = this.stage().contains.length + 1;
    this.stage().contains.push([...child, len, this.cursor]);
    return len;
  }

  storeBefore(child) {
    let len = this.stage().contains.length + 1;
    this.stage().contains.unshift([...child, len, this.cursor]);
    return len;
  }

  storeAt(index, child) {
    let len = this.stage().contains.length + 1;
    this.stage().contains.splice(index, 0, [...child, len, this.cursor]);
    return len;
  }

  trueStageLevel() {
    let lvl = this.stages.length;
    for (let i = this.stages.length; i > 0; i--) {
      let stage = this.stages[i - 1];
      if (['explicit', 'indent'].includes(stage.type)) {
        lvl = i;
        break;
      }
    }

    return lvl;
  }

  trueStage() {
    return this.stages.filter(stage => ['explicit', 'indent'].includes(stage.type)).slice(-1)[0];
  }

  trueIndentOrExplicit() {
    if (this.explicit.length) {
      return this.explicit.slice(-1)[0][1]
    } else return this.trueStage().indent;
  }

  inExplicitCall() {
    let ref = this.explicit.slice(-1)[0]
    return Array.isArray(ref) ? /(CALL|PARAM)_END/.test(ref[0]) : false;
  }

  close(addNewlines, until = 0, fromOpline) {
    let { loc } = this.prev(), stage;
    while ((stage = this.stage()) && stage.contains.length >= until) {
      if (fromOpline && stage.contains.length && stage.contains[stage.contains.length - 1].break) return false;
      let stageId = stage.contains.length, implicit = stage.contains.pop();
      if (stageId === 0) break;

      switch (implicit[0]) {
        case "object": {
          this.rmNL();
          this.token("}", "}", { generated: true, pair: implicit[1] });
          this.prev().stageId = stageId;
          this.prev().loc = loc;
          addNewlines && this.token("NEWLINE", 0, {
            isNext2GenObj: true,
            generated: true
          });
          break;
        };
        case "array": {
          this.rmNL();
          this.token("]", "]", { generated: true, pair: implicit[1] });
          this.prev().stageId = stageId;
          this.prev().loc = loc;
          addNewlines && this.token("NEWLINE", 0, {
            isNext2GenArr: true,
            generated: true
          });
          break;
        };
        case "call":
        case "param":
        case "indent&call": {
          this.rmNL();
          this.token(`${implicit[0].replace("indent&", "").toUpperCase()}_END`, ")", { generated: true, pair: implicit[1] });
          this.prev().stageId = stageId;
          this.prev().loc = { ...loc, type: null };
          addNewlines && this.token("NEWLINE", 0, { generated: true });

          if (implicit[0] === "param") this.paramLine = false;
          break;
        }
      }
    }

    return true;
  }

  closeTo(to, fromOpline) {
    while (this.stages.length > to) {
      let br = this.close(false, 0, fromOpline);
      if (!br && fromOpline) return false;
      if (this.stage().label === "Root") break;
      let stage = this.stages.pop();
      if (stage.type === "indent") {
        this.token('OUTDENT', '', { pair: stage.position });
      } else if (stage.type === "call" || stage.type === "indent&call") {
        this.token('CALL_END', ')');
      }

      this.indentLevel -= stage.indent;
    }
  }

  closeToIndent(to) {
    while (this.indentLevel > to) {
      this.close();
      if ((this.stage().label === "Root") || (this.stage().type === "explicit")) {
        break;
      }

      let stage = this.stages.pop();
      this.indentLevel -= stage.indent;
      if (stage.type === "indent") {
        this.token('OUTDENT', '', { pair: stage.position });
      } else if (stage.type === "call" || stage.type === "indent&call") {
        this.token('CALL_END', ')');
      }
    }
  }

  closeUntil(cb) {
    let last = this.stages.slice(-1)[0]
    while (true && this.stages.length) {
      this.close();
      if (this.stage().label === "Root" || this.stage().type === "explicit") break;
      let stage = this.stages.pop();
      switch (stage.type) {
        case "indent": {
          this.token('OUTDENT', '', { pair: stage.position }); break;
        };
        case "call":
        case "indent&call": {
          this.token('CALL_END', ')'); break;
        };
      }
      if (cb(last)) break;
      last = this.stages.slice(-1)[0]
      this.indentLevel -= stage.indent;
    }
  }

  closeImplicitsTo(index, addNewlines) {
    let { loc } = this.prev();
    while (this.stage().contains.length > index) {
      let stageId = this.stage().contains.length, implicit = this.stage().contains.pop();
      if (!implicit) break;
      switch (implicit[0]) {
        case "object": {
          this.rmNL();
          this.token("}", "}", { generated: true, pair: implicit[1] });
          this.prev().stageId = stageId;
          this.prev().loc = loc;
          addNewlines && this.token("NEWLINE", 0, {
            isNext2GenObj: true,
            generated: true
          });
          break;
        };
        case "array": {
          this.rmNL();
          this.token("]", "]", { generated: true, pair: implicit[1] });
          this.prev().stageId = stageId;
          this.prev().loc = loc;
          addNewlines && this.token("NEWLINE", 0, {
            isNext2GenArr: true,
            generated: true
          });
          break;
        };
        case "call":
        case "param":
        case "indent&call": {
          this.rmNL();
          this.token(`${implicit[0].replace("indent&", "").toUpperCase()}_END`, ")", { generated: true, pair: implicit[1] });
          this.prev().stageId = stageId;
          this.prev().loc = { ...loc, type: null };
          addNewlines && this.token("NEWLINE", 0, { generated: true });
          break;
        }
      }
    }
  }

  closeImplicitObjects(addNewlines, suppressArrays, comma = false) {
    let currAction = this.stage().contains.slice(-1)[0] || []
    while (/array|object/.test(currAction[0])) {
      let stageId = this.stage().contains.length;
      switch (currAction[0]) {
        case "object": {
          this.rmNL();
          this.token("}", "}", { generated: true, pair: currAction[1] });
          this.prev().stageId = stageId;
          addNewlines && this.token("NEWLINE", 0, {
            isNext2GenObj: true,
            generated: true
          });
          break;
        };
        case "array": {
          if (suppressArrays) return;
          this.rmNL();
          this.token("]", "]", { generated: true, pair: currAction[1] });
          this.prev().stageId = stageId;
          addNewlines && this.token("NEWLINE", 0, {
            isNext2GenArr: true,
            generated: true
          });
          break;
        };
      }

      this.stage().contains.pop();

      if (comma) this.prev().comma = true;
      currAction = this.stage().contains.slice(-1)[0] || [];
    }
  }

  isUnfinished() {
    return this.Unfinished.includes(this.prev()[0]);
  }

  postfixeables = 'THIS IDENTIFIER REGEX REGEX_END JSX_END PROPERTY ] } ) NUMBER CALL_END INDEX_END STRING_END STRING NpmPackage RETURN CONTINUE BREAK DEBUGGER SUCH SUPER SYMBOL_EXISTS ARGUMENT'.split(' ');

  indexables = 'THIS IDENTIFIER REGEX REGEX_END PROPERTY ] } ) CALL_END INDEX_END STRING_END STRING SUCH SUPER ARGUMENT'.split(' ')

  uncontinuous = 'STRING STRING_END JSX_END NUMBER UNDEFINED NULL BOOL THIS REGEX REGEX_END INFINITY TAG'.split(' ')

  Opening = '( { {{ [ INDEX_START CALL_START INDENT'.split(" ")

  Callable = "SUCH SUPER IDENTIFIER PROPERTY ] INDEX_END CALL_END ) } SYMBOL_EXISTS IMPORT )>".split(" ")

  prev() {
    return this.tokens[this.tokens.length - 1] || []
  }

  indent() {
    return this.stage().indent;
  }

  assertTokens(...str) {
    if (str.length > 1) {
      var checks = [], assert;
      for (let query of str) {
        if (undefined !== (assert = this.assertTokens(query))) break;
      }

      return assert;
    } else {
      str = str[0];
    }

    let ord = str.split(/\s+/g), len = ord.length;

    let last_tag = '', last_token = [], i = this.tokens.length - 1, asserted = true;
    while (true) {
      let query = ord.pop(), token;
      if (!query) break;
      if (token = this.tokens[i]) {
        if (query === '.+') {
          let copyI = i, copyT;
          find: while (copyT = this.tokens[copyI]) {
            if (copyT.pair !== last_token.pair) {
              copyI--;
            } else {
              break find;
            }
          }

          i = copyI;
          continue;
        } else {
          let [tag] = token;
          if (query !== tag) {
            asserted = false;
            break;
          } else {
            i--;
            last_token = token;
            continue;
          }
        }
      } else {
        asserted = false;
        break;
      }
    }

    return asserted ? ++i : undefined;
  }

  popTokens(where) {
    return this.tokens.splice(where);
  }
}

function fileIsDir() {
  let subfolder;
  try {
    subfolder = readdirSync(join.apply(null, arguments));
  } catch (_) { }

  if (subfolder !== undefined) return true;
}

export default Lexer;

if (typeof module !== "undefined" && typeof require === "function") {
  module.exports = Lexer;
}