import { throwSyntaxError } from './helpers.js';
import { Sources } from './sourcemaps.js';
import Relic from '../index.js';
import Grammar from './grammar.js';

const Nodes = {};

class Parser {
  constructor(tree, options = {}) {
    this.nodes = tree;
    this.comments = (options.isELSON || options.removeComments) ? [] : options.comments;
    this.isELSON = options.isELSON;
    this.useVar = options.useVar;
    this.sourceMaps = options.sourceMaps;
    this.wrapSafe = options.wrapSafe;
    this.tsCheck = options.tsCheck;
    this.omitTypeScript = options.omitTypeScript;
    this.isTypeScript = options.isTypeScript;
    this.isJSX = options.isJSX;
    this.isRecomp = options.isRecomp;
    this.cout = options.cout;
    this.tabSize = options.outputTabSize || 2;
  }

  parse({ scope }) {
    let sources, js, registry;
    sources = new Sources();
    registry = { sources: this.sourceMaps ? sources : undefined, scope: ['Root'], useVar: this.useVar, isELSON: this.isELSON, omitTypeScript: this.omitTypeScript, isRecomp: this.isRecomp, cout: this.cout, isTypeScript: this.isTypeScript, isJSX: this.isJSX, tabSize: this.tabSize };
    js = this.nodes.parse({ comments: this.comments, registry, wrapSafe: this.wrapSafe, scope, tsCheck: this.tsCheck });

    return { js, sources, isTypeScript: registry.isTypeScript, isJSX: registry.isJSX };
  }
}

var Base;

Nodes.Base = Base = class Base extends Array {
  constructor(...args) {
    let rule;
    super(...args);
    this.setRule(args[0]);
  }

  get location() {
    return this.loc;
  }

  setRule(rule) {
    this.rule = rule;
    return this;
  }

  setTokens(...tokens) {
    this.tokens = {};
    for (var [token, loc] of tokens) {
      if (!loc) continue;
      if (!this.tokens[token]) this.tokens[token] = [];
      this.tokens[token].push(loc);
    }

    return this;
  }

  findToken(token) {
    if (!this.tokens) return;
    var tok = this.tokens[token];
    if (Array.isArray(tok)) {
      return tok[tok.length - 1];
    }
  }

  setLocation({ first_line, first_column, ...first }, { last_line, last_column } = {}) {
    if (!last_line) ({ last_line } = first);
    if (!last_column) ({ last_column } = first);
    this.loc = { first_line, first_column, last_line, last_column, src: first.src, type: first.type };
    return this;
  }

  setLoc(...loc) {
    return this.setLocation(...loc);
  }

  get contents() {
    return Object.assign(this.slice(1), { loc: this.loc, rule: this.rule });
  }

  get unwrap() {
    return this.contents.length > 1 ? this.contents : this.contents[0];
  }

  unwraps(num) {
    let returns = this;
    while (num !== 0) {
      num--;
      returns = returns.unwrap;
    }

    return returns;
  }

  visit(...indexes) {
    var result = this;
    for (let index of indexes) {
      result = result[index];
    }

    return result;
  }

  get unwrapAll() {
    let res = this;
    while (res.unwrap instanceof Base) res = res.unwrap;
    return res;
  }

  unwrapUntil(cb) {
    let res = this, bool = false, id = 0;
    while (res && res.unwrap && !(bool = cb(res, id))) {
      res = res.unwrap;
      id++;
    }
    return bool ? res : false;
  }

  throwSyntaxError(message, location = this.loc) {
    throwSyntaxError({
      message,
      location
    })
  }
}

Nodes.Access = class Access extends Base {
  parse(opts = { registry: {} }) {
    let { rule, unwrap: Access } = this;
    let output = "";
    switch (rule) {
      case ". PROPERTY": {
        output += (!opts.noDot ? '.' : '') + (opts.registry && opts.registry.sources ? opts.registry.sources.add(this.loc) : '') + Access[0];
        break;
      };
      case "INDEX_START Expression INDEX_END": {
        output += (opts.registry && opts.registry.sources ? opts.registry.sources.add(this.findToken('INDEX_START') || this.loc) : '') + "[" + Access.parse({ ...opts, isValue: true }) + "]";
        break;
      }
    }
    return output;
  }
}

Nodes.AlphaNum = class AlphaNum extends Base {
  parse(opts) {
    switch (true) {
      case this.unwrap instanceof Nodes.String:
        return this.unwrap.parse(opts);
      default: {
        return this.unwrap;
      }
    }
  }
}

Nodes.Array = class Array extends Base {
  parse({ that, $such, scope, addSemicolon, vars, varExistent, constants, prevLine, isCondition, isValue, tabs, wrap, isClass, isAssignment, ID, comments, lastNodeLocation, registry = {}, isFrom, isObjProperty }) {
    let Arr = this.contents, { loc: initLoc } = Arr[0] || this, lastNode = initLoc;
    let output = "";
    output += "[";
    let x = this.indented, BeforeComments = "";

    for (let comment of comments.filter(c => (c.loc.first_line < initLoc.first_line) || (c.loc.first_line === initLoc.first_line && c.loc.first_column < initLoc.first_column))) {
      if (registry[comment.id]) continue;
      let commentOutput = parseComment(comment, tabs + 1, true, registry);
      BeforeComments += commentOutput;
      x = true;
      registry[comment.id] = true;
    }

    let Spots = [], il = 0;

    for (let Spot of Arr) {
      let nl;
      il++;

      if (Spot instanceof Nodes.Statement) throwSyntaxError({
        message: 'Unexpected statement',
        location: Spot.loc
      });

      if (Spot === null) {
        Spots.push(['', '']); continue
      } else if (/boolean|undefined/.test(typeof Spot)) {
        if (!Spot) {
          x = true;
          Spots.push(['jump', '']);
        }
        continue;
      }

      let { childComments, matchedComments } = matchComments(lastNode, comments, Spot.loc);

      if (isAssignment) {
        if (!(Spot.unwrap instanceof Nodes.Value) && !(Spot.unwraps(2) instanceof Nodes.Assignment || Spot.unwraps(2) instanceof Nodes.Assignable)) {
          Spot.throwSyntaxError('Invalid left-hand assignment reference.')
        }
      }

      let test = (nl = (Spot.rule === "Value") && (Spot[1].rule === "Assignable")) && (Spot[1][1].rule === "Object") && isFrom;

      if (nl && ["Object", "Array", "Invocation"].includes(Spot[1][1].rule)) {
        nl = true;
        x = true;
      } else nl = false;

      let cO = "", it = Spot.parse({ that, $such, scope, addSemicolon: [], vars, varExistent, constants, prevLine, isCondition, isValue: true, isParam: true, tabs: tabs + 1, wrap, isClass, isAssignment, ID, comments: childComments, lastNodeLocation, registry });

      if (test) {
        it = it.slice(2, -2);
      }

      if (Spot.unwraps(2).rule === "Value Access" && isFrom) {
        if (Spot.unwraps(2)[1].rule === "This") {
          it = `${Spot.unwraps(2)[2].parse({ registry, noDot: true })}: ${it}`
        } else {
          Spot.throwSyntaxError('Invalid left-hand assignment reference.');
        }
      }

      if (Spot.expansion) it = `...${it}`;

      if (matchedComments.length) {
        for (let comment of matchedComments) {
          if (registry[comment.id]) continue;

          cO = parseComment(comment, tabs + 1, true, registry);

          Spots.slice(-1)[0][1] += cO;
          registry[comment.id] = true;
          x = true;
        }
      }

      lastNode = Spot.loc;
      Spots.push([it, ""]);
      if (nl && (il < Arr.length)) {
        Spots.push(["jump", '\n' + tab(registry.tabSize, tabs + 1)]);
      }
    }

    let ll = Spots.filter(s => s[0] !== "jump").length;
    Spots = Spots.map(([s, c], i, r) => {
      let z = i !== r.length - 1 ? ", " : ""
      if (i === 0) {
        return s + z + (c && (x = true) && (c || "\n" + tab(registry.tabSize, tabs + 1)))
      }
      else if (s === "") return z + (c && (x = true) && c)
      else if (s === "jump") return (x = true) && (this.separate ? '\n' + tab(registry.tabSize, tabs + 1) : c);
      else if (r[i - 1] !== "") return s + z + (c && (x = true) && c)
      else return s + z + (c && (x = true) && c)
    }).join('').replace(/\s+\n/g, '\n');


    let b = false, AfterComments = "";
    for (let comment of comments.filter(c => c.loc.first_line >= lastNode.last_line)) {
      if (registry[comment.id]) continue;
      b = true;
      let commentOutput = parseComment(comment, tabs + 1, true, registry);
      if (comment.loc.first_line == lastNode.last_line) {
        let resource = AfterComments, trim = 0;
        while (/\n|\r| /.test(resource.charAt(resource.length - 1))) {
          resource = resource.slice(0, -1);
          trim++;
        }

        AfterComments = resource + " " + commentOutput
      } else {
        AfterComments += commentOutput
      }

      registry[comment.id] = true;
    }

    if (x && !BeforeComments && Spots.startsWith('{\n') && !(/\n\s*\}$/.test(Spots) && ll > 1)) {
      x = false;
      Spots = Spots.replace(new RegExp(`\\n(${" ".repeat(registry.tabSize)}){${tabs},}`, 'gm'), function (str) {
        var tb = str.slice(1);
        tb = tb.split(new RegExp(`(${" ".repeat(registry.tabSize)})`, 'g')).filter(t => t !== "").length;

        return '\n' + tab(registry.tabSize, tb - 1);
      })
    }

    if (x || b) output += "\n" + tab(registry.tabSize, tabs + 1);

    output += (BeforeComments + Spots + AfterComments).trim();

    if (b || x) output += "\n" + tab(registry.tabSize, tabs);

    output += "]";

    return output;
  }

  static from(Body) {
    let middleware = new Nodes.Array(null).setLoc(Body.loc);
    middleware.indented = true;
    middleware.separate = true;

    if (Body instanceof Nodes.Block) Body = Body.unwrap;

    let Lines = Body.unwrap;
    let i = 0, lineCount = 0;
    for (let Line of Lines) {
      i++;
      Line = Line.unwrap;

      lineCount++;

      middleware[middleware.length] = Line;
      if (i !== Lines.length) {
        middleware[middleware.length] = false;
      }
    }

    if (lineCount === 1) {
      return middleware[1];
    }

    let wrapped = new Nodes.Expression('Value',
      new Nodes.Value('Assignable',
        new Nodes.Assignable('Array', middleware).setLoc(Body.loc)
      ).setLoc(Body.loc)
    ).setLoc(Body.loc)

    return wrapped;
  }
}

Nodes.Assign = class Assign extends Base {
  parse({ that, $such, scope, vars, varExistent, constants, constant, construct, isValue, prevLine, tabs, lineReturns, isCondition, isCompare, comments = [], lastNodeLocation, registry = {}, ID = [], FiresSuper, FiresAwait, FiresYield, isStatement, addSemicolon, afterParse, metaComments, isClass, hasTypes = [] } = {}) {
    let { rule, contents: Assign } = this;
    if ((Assign.length == 1)) Assign = Assign[0];
    let output = "", wrap, isModule;

    if (Assign[1].rule === "Object" || Assign[3][0] === "FROM") wrap = true;
    else if (Assign[1].rule === "Array" || Assign[3][0] === "AT") {
      output += registry.sources ? registry.sources.add(Assign[2].loc) : '';
    }

    output += Assign.parse({ that, $such, scope, vars, varExistent, constants, constant, construct, isValue, prevLine, tabs, lineReturns, isCondition, isCompare, comments, lastNodeLocation, registry, ID, FiresSuper, FiresAwait, FiresYield, isStatement, addSemicolon, afterParse, metaComments, isClass, hasTypes });

    if (!Array.isArray(ID)) {
      ID = [ID];
    }

    if (constant) {
      for (let [id, loc] of ID) {
        if (id && vars && vars.includes(id)) {
          throwSyntaxError({
            message: `'${id}' is already assigned as a variable`,
            location: loc
          });
        }

        constants.push(id.toString());
      }
    }

    for (let [id, loc] of ID) {
      if (id && !id.isProperty && vars && !vars.includes(id.toString()) && !constant && !isModule) {
        if (constants && constants.includes(id)) {
          throwSyntaxError({
            message: `Assignment to constant variable.`,
            location: loc
          });
        }

        if (!isStatement) {
          vars.push(id.toString());
          if (!vars.__locations) vars.__locations = {};
          vars.__locations[id.toString()] = loc;
          scope.push(id.toString());
        }
      }
    }

    if (wrap && !isCondition && !isStatement) {
      output = [registry.sources ? registry.sources.add(Assign[2].loc) : '', "(", output, ")"].join("")
    }

    return output;
  }
}

Nodes.Assignable = class Assignable extends Base {
  isDestructor([KEYWORD]) {
    let state = 0, rule = this.rule;
    if (rule === "Object") {
      state++
    }

    if (rule === "Array") {
      if (KEYWORD === "AS" && this.unwrap.loc.generated === undefined) state = 0;
      else state++;
    }

    return state > 0;
  }

  parse({ that, $such, scope = [], addSemicolon, vars = [], constants = [], prevLine, isCondition, isValue, tabs, wrap, isClass, isLine, lineReturns, isAssignment, isOperation, isStatement, ID = [], func, scopedParams, method, isAssigned, comments = [], lastNodeLocation, registry = {}, isFrom, isParam, varExistent, FiresSoak = [], isInvoked, isNarrow = false, isObjProperty, typeData = [], afterParse, metaComments = [] } = {}) {
    let Assignable = this, rule = this.rule, id;
    let output = "", isProperty;
    switch (rule) {
      case "Identifier": {
        let $such = Assignable[1].parse({ registry });
        if (isAssignment) {
          let metaType = this.loc.type ? { value: this.loc.type.nodes.parse({ registry }), loc: this.loc.type.nodes.loc } : undefined, vname = Assignable[1].parse();
          ID.push([vname, this.loc]);

          if (!metaType) {
            metaType = getDataOfMetaComments({ metaComments, ID: vname, tabs, loc: this.loc, registry });
          } else {
            attachDescriptions(metaComments, [metaType], tabs, registry);
          }

          if (metaType) {
            typeData.push({
              ID: vname,
              ...metaType
            })
          }
        }
        output += $such;
        break;
      };
      case "ThisProperty": {
        isProperty = true;
        output += (that && that[0]) || "this";
        output += Assignable[1].parse({ that, $such, scope, addSemicolon, vars, varExistent, constants, prevLine, isCondition, isValue, tabs, wrap, isClass, isAssignment, ID, isLine, lineReturns, comments, lastNodeLocation, registry });
        break;
      };
      case "Value Access": {
        let metaType = this.loc.type ? { value: this.loc.type.nodes.parse({ registry }), loc: this.loc.type.nodes.loc } : undefined, _parent, _child;
        if (isAssignment && isStatement) {
          this.throwSyntaxError('Unexpected property', Assignable[2].loc);
        }
        let soak = Assignable[2][2];
        isProperty = true;

        let _refer = Assignable[1].parse({ that, $such, scope, addSemicolon: [], vars, varExistent, constants, prevLine, isCondition, isValue: true, tabs, wrap, isClass, isLine, lineReturns, func, scopedParams, comments, lastNodeLocation, registry: { ...registry, sources: undefined, isRecomp: true }, FiresSoak, isAssignment, isInvoked: true, isOperation, isParam, isNarrow });

        let s = Assignable[1].parse({ that, $such, scope, addSemicolon: [], vars, varExistent, constants, prevLine, isCondition, isValue: true, tabs, wrap, isClass, isLine, lineReturns, func, scopedParams, comments, lastNodeLocation, registry, FiresSoak, isAssignment, isInvoked: true, isOperation, isParam, isNarrow });

        let Access = Assignable[2].parse({ that, $such, scope, addSemicolon: [], vars, varExistent, constants, prevLine, isCondition, isValue, tabs, wrap, isClass, isAssignment, ID, isLine, comments, lastNodeLocation, registry, isParam, isNarrow, FiresSoak });

        let cantSoakLine = isAssignment || isOperation || isInvoked || isParam || isCondition || isNarrow;
        if (soak) {
          let _ref = FiresSoak[FiresSoak.length - 1], sym = "", isVerbose;

          if (_ref) {
            s = _ref[1] + _ref[2];
          } else {
            s = _refer;
          }

          if (Assignable[1].unwrap.rule !== 'Identifier') {
            isVerbose = true;
            _ref = Letter(scope, 's');
            vars.push(_ref);
            scope.push(_ref);
            sym += `(${_ref} = ${s})`
          } else {
            sym = s;
            _ref = s;
          }

          s = `typeof ${sym} ${(!isVerbose || cantSoakLine) ? `!== "undefined" && ${_ref} ` : ''}!== null`;

          FiresSoak.push([s, _ref, Access]);

          s = _ref;
        }

        output += s + Access;

        if (isAssignment) {
          if (Assignable[1].rule === "Assignable" && /Identifier|Value Access|Expression IN Expression/.test(Assignable[1].unwrap.rule)) {
            _parent = _refer;
          }

          let prop = _parent + Access;

          if (!metaType) {
            metaType = getDataOfMetaComments({
              metaComments,
              ID: prop,
              tabs,
              loc: this.loc, registry
            });
          } else {
            attachDescriptions(metaComments, [metaType], tabs, registry);
          }

          if (metaType) {
            typeData.push({
              ID: prop,
              kind: 'access',
              ...metaType
            })
          }
        }

        if (soak && !cantSoakLine) {
          output = loadSoaks(output, { Soaks: FiresSoak, tabs, scope, vars, prevLine, registry, loc: this.loc });

          if (isValue) {
            output = `(${output})`
          }
        }
        break;
      };
      case "Expression IN Expression": {
        let [Value, Accessor] = Assignable.contents;

        output += Value.parse({ that, $such, scope, addSemicolon: [], vars, varExistent, constants, prevLine, isCondition, isValue: true, tabs, wrap, isClass, isAssignment, ID, isLine, lineReturns: false, comments, lastNodeLocation, registry });

        var noDot = false, Accs;

        if (Accessor.unwrap instanceof Nodes.Value && (Accessor.unwraps(2) instanceof Nodes.Assignable && (["IDENTIFIER", "Value Access"].includes(Accessor.unwraps(3).rule) || Accessor.unwraps(2).rule === "Array" && (noDot = true)) || (Accessor.unwraps(2) instanceof Nodes.Invocation && (Accs = Accessor.unwraps(2)[1])) && (Accs.unwrap instanceof Nodes.Assignable && ((["IDENTIFIER", "Value Access"].includes(Accs.unwraps(2).rule) || Accs.unwrap.rule === "Array" && (noDot = true))))) || Accessor.unwrap.rule === "@ Value" && (Accs = Accessor.unwraps(2)) && (Accs.unwrap instanceof Nodes.Assignable && ((["IDENTIFIER", "Value Access"].includes(Accs.unwraps(2).rule) || Accs.unwrap.rule === "Array" && (noDot = true))))) {
          var Prop = Accessor.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isCondition, isValue: true, tabs, wrap, isClass, isAssignment, ID, comments, lastNodeLocation, registry, NoPrint: true });

          if (Prop.startsWith('[')) noDot = true;

          output += (noDot ? "" : ".") + Prop;
        } else {
          output += `[${Accessor.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isCondition, isValue: true, tabs, wrap, isClass, isAssignment, ID, comments, lastNodeLocation, registry })}]`
        }

        break;
      };
      case 'Object': {
        Assignable = Assignable.unwrap;

        output += Assignable.parse({ that, $such, scope, addSemicolon, vars, varExistent, constants, prevLine, isCondition, isValue, tabs, wrap, isClass, isAssignment, ID, isLine, lineReturns, comments, lastNodeLocation, registry, isParam, isStatement, isObjProperty, typeData, afterParse, metaComments });
        break;
      };
      case 'Array': {
        Assignable = Assignable.unwrap;

        output += Assignable.parse({ that, $such, scope, addSemicolon, vars, varExistent, constants, prevLine, isCondition, isValue, tabs, wrap, isClass, isAssignment, ID, method, comments, lastNodeLocation, registry, isFrom, isParam, isStatement, isObjProperty, typeData, afterParse, metaComments });
        break;
      };
    }

    if (isAssignment && !isStatement) {
      for (let [id, loc] of ID) {
        if (scope && !scope.includes(id.toString())) {
          id = id.toString()
          if (!vars.includes(id)) {
            vars.push(id);
            if (!vars.__locations) vars.__locations = {};
            vars.__locations[id] = loc;
          }

          scope.push(id);
        }
      }
    }

    return output;
  }
}

Nodes.Assignment = class Assignment extends Base {
  parse({ that, $such, scope, vars, varExistent, constants, constant, construct, isValue, prevLine, tabs, lineReturns, isCondition, isCompare, comments, lastNodeLocation, registry = {}, ID = [], FiresSuper, FiresAwait, FiresYield, isStatement, addSemicolon, afterParse, metaComments, isClass, hasTypes, typeData = [] }) {
    let Assign = this, output = "";
    let TargetSoak = [];
    let { childComments } = matchComments(Assign[2].loc, comments, Assign[2].loc);
    
    let target = Assign[2].parse({ that, $such, scope, vars, varExistent, constants, isValue: true, prevLine, tabs, isCompare, isAssigned: true, isNarrow: true, comments: childComments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, FiresSoak: TargetSoak, afterParse, metaComments });

    if (TargetSoak.length) {
      target = loadSoaks(target, { tabs, scope, vars, prevLine, Soaks: TargetSoak, registry, loc: this.loc })
    }

    let LH, FiresSoak = [];
    switch (Assign[3][0]) {
      case "FROM": {
        LH = Assign[1].parse({ that, $such, scope, vars, varExistent, constants, constant, construct, isValue, prevLine, tabs, lineReturns, isCondition, isCompare, isAssignment: true, lastNodeLocation, registry, isFrom: true, ID, isStatement, FiresSoak, typeData, afterParse, metaComments });
        let forCheck = Assign[1].parse({ isAssignment: true, isFrom: true }).toString();
        if (/^\[(.|\n)+\]$/.test(forCheck)) {
          LH = `{ ${LH.slice(1, -1)} }`
        } else if (/^([a-zñ$_](?:[a-zñ$_\d]+)?)$/i.test(forCheck)) {
          LH = `{ ${LH} }`
        } else if (Assign[1].rule === "Value Access" && Assign[1][1].rule === "This") {
          LH = `{ ${Assign[1][2].parse({ registry, noDot: true })}: ${LH} }`
        }
        break;
      };
      case "AT": {
        LH = Assign[1].parse({ that, $such, scope, vars, varExistent, constants, constant, construct, isValue, prevLine, tabs, lineReturns, isCondition, isCompare, isAssignment: true, lastNodeLocation, registry, ID, isStatement, FiresSoak, typeData, afterParse, metaComments });
        if (!/^\[(.|\n)+\]$/.test(LH)) {
          LH = `[${LH}]`
        };
        break;
      };
      case "AS": {
        LH = Assign[1].parse({ that, $such, scope, vars, varExistent, constants, constant, construct, isValue, prevLine, tabs, lineReturns, isCondition, isCompare, isAssignment: true, lastNodeLocation, registry, ID: isClass ? [] : ID, isStatement, FiresSoak, typeData, afterParse, metaComments });
        break;
      }
    }
    
    if ((isClass || isStatement) && registry.isTypeScript && !registry.omitTypeScript && typeData.length && typeData[0].value) {
      LH += `: ${typeData[0].value}`
    }

    output += LH + " = " + target;

    if (FiresSoak.length && constant) {
      this.throwSyntaxError(`Existential operators not supported in declaration statements.`)
    } else if (FiresSoak.length) {
      output = loadSoaks(output, {
        tabs,
        scope,
        vars,
        prevLine,
        Soaks: FiresSoak,
        registry,
        loc: this.loc
      })
    }

    if ((!isClass && !isStatement) && !["Value Access", "Expression IN Expression", "ThisProperty"].includes(Assign[1].unwrap.rule)) {
      if (!vars.__data) {
        vars.__data = [];
      }

      vars.__data.push(...typeData);
    } else if (!FiresSoak.length && typeData.length) {
      let mData = addMetaDataToPrevLine({
        prevLine, typeData: (registry.isTypeScript && !registry.omitTypeScript) ? typeData.map(d => Object.fromEntries(Object.entries(d).filter(o => o[0] !== "value"))) : typeData, tabs, metaComments, registry
      });

      output = mData + output;
    }

    if (typeData.length) hasTypes.push(1);

    return output;
  }
}

Nodes.Block = Nodes.ClassBlock = class Block extends Base {
  static wrap(...nodes) {
    let first = Array.from(nodes)[0], last;
    const jar = new Nodes.Body(null, []);
    if (typeof nodes === "undefined") nodes = [];
    for (const node of Array.from(nodes)) {
      jar[1].push(new Nodes.Line(null, node));
    }

    return jar;
  }
}

Nodes.Body = Nodes.ClassBody = class Body extends Base {
  parse({ tabs = 0, vars = [], constants = [], that = [], $such = [], scope = [], isChildren = false, isClass = false, callSelf = false, func = false, scopedParams = Object.assign([], { generated: true }), top = 0, lastValue = [], varExistent = [], comments = [], lastNodeLocation = { first_line: 1, first_column: 1, last_line: 1, last_column: 1 }, registry = {}, debug = false, FiresSuper = [], FiresYield = [], FiresAwait = [], assignRes, appendToVars, isParenthetical = false, canReturn = true } = {}) {
    const [rule, Lines] = this;
    let output = "";

    if (callSelf) {
      ++tabs;
    }

    var count = 0;

    var LastLineLocation = lastNodeLocation, disableNewlines = false, afterParse = [], mappedLocations = {};

    for (let Line of Lines) {
      ++count;
      let it, CurrLineLocation = Line.loc || LastLineLocation, lineReturns;

      if (Line.loc && !mappedLocations[Line.loc.src]) {
        mappedLocations[Line.loc.src] = { first_line: 1, first_column: 1, last_line: 1, last_column: 1 };
      }

      let { childComments, matchedComments, metaComments } = matchComments(mappedLocations[Line.loc && Line.loc.src] || LastLineLocation, comments.filter(c => c.loc.src === (Line.loc && Line.loc.src)), CurrLineLocation);
      if ((count === Lines.length) && (assignRes || callSelf || func) && canReturn) {
        lineReturns = true; // Parser-only var
      } else {
        lineReturns = false;
      }

      it = Line.parse({ that, $such, scope, vars, varExistent, constants, tabs, lineReturns: isParenthetical ? false : lineReturns, assignRes, isClass, isLine: true, func, scopedParams, nl: Line.lineCount || 0, lastValue, comments: childComments, metaComments, afterParse, lastNodeLocation: mappedLocations[Line.loc && Line.loc.src] || LastLineLocation, registry, FiresSuper, FiresAwait, FiresYield, isParenthetical });

      if (it === "" || it === ";") {
        disableNewlines = true;
        continue;
      }

      if (!disableNewlines) {
        output += "\n".repeat(Line.lineCount || 0);
      } else disableNewlines = false;

      let x;
      if (matchedComments.length) {
        for (let comment of matchedComments) {
          let commentOutput = parseComment(comment, tabs, undefined, registry);

          if (registry[comment.id]) continue;
          if (comment.appendToLastLine) {
            let resource = output, trim = 0;
            while (/\n|\r| /.test(resource.charAt(resource.length - 1))) {
              resource = resource.slice(0, -1);
              trim++;
            }
            output = resource + " " + commentOutput;
            x = !commentOutput.endsWith('\n');
          } else {
            output += tab(registry.tabSize, tabs) + commentOutput
            x = !commentOutput.endsWith('\n');
          }

          registry[comment.id] = true;
        }
      }

      output += (x ? it.replace(/^ +/, " ") : it) + (isParenthetical ? ((count === Lines.length) ? "" : ", ") : "\n");

      LastLineLocation = CurrLineLocation;
      if (Line.loc && Line.loc.src) mappedLocations[Line.loc.src] = CurrLineLocation;
    }

    for (let comment of comments.filter(c => c.loc.first_line >= LastLineLocation.last_line && !c.jsdoc)) {
      if (registry[comment.id]) continue;
      let commentOutput = parseComment(comment, tabs, undefined, registry);

      if (comment.loc.first_line == LastLineLocation.last_line) {
        let resource = output, trim = 0;
        while (/\n|\r| /.test(resource.charAt(resource.length - 1))) {
          resource = resource.slice(0, -1);
          trim++;
        }

        output = resource + " " + commentOutput.trim() + "\n".repeat(trim);
      } else {
        output += tab(registry.tabSize, tabs) + commentOutput
      }

      registry[comment.id] = true;
    }

    if (varExistent && varExistent.length && vars.length && !isChildren && !isClass) {
      for (let every in varExistent) {
        if (vars.includes(varExistent[every])) {
          vars.splice(vars.indexOf(varExistent[every]), 1);
        }
      }
    }

    if (scopedParams && scopedParams.length && vars.length) {
      for (let every of scopedParams) {
        if (vars.includes(every)) {
          vars.splice(vars.indexOf(every), 1);
        }
      }
    }

    if (!isChildren && !isClass) {
      if (appendToVars) vars.push(appendToVars);

      if (vars.length) {
        let _vars = vars.sort((a, b) => b.length - a.length).sort((a, b) => +(a.startsWith('_')) - +(b.startsWith('_'))).filter((t, i, r) => r.indexOf(t) === i);

        let dTypes = vars.__data && vars.__data.filter(d => _vars.includes(d.ID)) || [], ddef = "";
        if (dTypes.length && !registry.omitTypeScript) {
          registry.isTypeScript = true;
          let rewrite = [];
          ddef += buildVarDefinitions(dTypes, tabs, registry.useVar ? "var " : "let ", comments.filter(c => c.jsdoc), rewrite, registry);
          _vars = _vars.filter(v => !rewrite.includes(v)).map(v => {
            let ddef = dTypes.find(d => d.ID === v);
            if (ddef) {
              if (vars.__locations && vars.__locations[v] && registry && registry.sources) {
                v = registry.sources.add(vars.__locations[v]) + v;
              }
              return `${v}: ${registry.sources ? registry.sources.add(ddef.loc) : ''}${ddef.value}`
            } else { 
              if (vars.__locations && vars.__locations[v] && registry && registry.sources) {
                v = registry.sources.add(vars.__locations[v]) + v;
              }

              return v 
            };
          });
        } else if (dTypes.length && registry.omitTypeScript) {
          ddef += buildVarDefinitionsWithJSDoc(dTypes, tabs, registry.useVar ? "var " : "let ", comments.filter(c => c.jsdoc), registry);
          _vars = _vars.filter(v => !dTypes.find(d => d.ID === v));
        }

        output = (_vars.length ? tab(registry.tabSize, tabs) + (registry.useVar ? "var " : "let ") + _vars.map(v => {
          if (vars.__locations && vars.__locations[v] && registry && registry.sources) {
            v = registry.sources.add(vars.__locations[v]) + v;
          }

          return v;
        }).join(', ') + ";\n\n" : '') + ddef + output;
      }
    } else if (appendToVars) {
      output = tab(registry.tabSize, tabs) + (registry.useVar ? "var " : "let ") + appendToVars + ';\n\n' + output;
    }

    if (afterParse.length) {
      output = afterParse.join(`\n${tab(registry.tabSize, tabs)}`) + `\n\n${tab(registry.tabSize, tabs)}` + output;
    }

    if (callSelf) {
      output = "(" + (FiresAwait.length ? "async " : "") + "function () {\n" + output + tab(registry.tabSize, tabs - 1) + "}).call(this)"
    }

    return top ? output.replace(/(\n| )+$/, '') : output.trim();
  }
}

Nodes.Class = class Class extends Base {
  parse({ that, $such, scope, vars = [], varExistent, constants, prevLine, isValue, isAssigned, tabs = 0, lineReturns, addSemicolon, comments = [], lastNodeLocation, registry = {}, metaComments } = {}) {
    let output = "", className, classExtends, classAugment, classImplements, nom;
    let { contents: Class } = this;
    let { args: classArguments, ctor: classCtor } = Class[4] || {};
    classAugment = Class[3] || !!classCtor;
    classImplements = Class[5];

    nom = (Class[0] && Class[0].parse) ? Class[0].parse({ registry: {} }).toString() : Class[0] ?? "Class";

    if (Class[0]) {
      className = Class[0].parse ? Class[0].parse({ registry }).toString() : Class[0];
    } else if (!(isValue || isAssigned)) {
      className = nom = Reference(scope, true);
      $such[0] = className;
    }

    if (Class[1]) {
      classExtends = Class[1].parse({ that, scope, tabs: tabs + 1, isParam: true, vars, varExistent, constants, comments, registry, addSemicolon: [] });
    }

    if (classCtor && classExtends) {
      this.throwSyntaxError('Class inheritance is not supported with automated constructors.', this.findToken("EXTENDS") || Class[1].loc);
    }

    let Body = [], ForeignExps = [], ThisProperties = []; // a copy

    var vBody = Class[2], thisRegistered = [];
    if (vBody instanceof Nodes.Body) {
      ForeignExps = [];
      for (var _i = 0, _len = vBody[1].length; _i < _len; _i++) {
        var Line = vBody[1][_i], x;
        if ((x = Line.rule === "ClassFunction" || (Line.unwrap.rule === "Value") && Line.unwrapUntil && !!Line.unwrapUntil(node => (node instanceof Nodes.Function) && !/FUNCTION/.test(node.rule))) || Line.unwrap.rule === "Assign" && Line.unwraps(2).rule === "Assignment" && Line.unwraps(3)[1].rule === "Identifier") {
          if (Line.unwrap.rule === "Assign") {
            thisRegistered.push(Line.unwraps(3)[1].parse({}));
          }

          if (Line.rule === "ClassFunction") {
            Line.setRule('Expression');
            Line[1] = new Nodes.Expression('Value', Line[1].setRule('Function')).setLoc(Line);
          }

          if (x) Line.isMethod = true;
          Body.push(Line);

          continue;
        }

        if (Line.unwrap.rule === "Value" && Line.unwraps(2).rule === "Assignable" && Line.unwraps(3).rule === "Identifier" && !!(Line.unwraps(3).loc || {}).type) {
          if (registry.isTypeScript && !registry.omitTypeScript) {
            ThisProperties.push(Line);
          }

          thisRegistered.push(Line.unwraps(3).parse({}));
          continue;
        }

        ForeignExps.push(Line);
      }

      Body = new Nodes.Body(null, Body).setLoc(Class[2].loc || Class.loc);
    } else {
      Body = [];
      ForeignExps = [];
    }

    let header = className ? "class " + className : "class";
    let cArgs = classArguments ? `<${classArguments.parse({})}>` : '';

    if (classArguments) header += `${registry.sources ? registry.sources.add(classArguments.loc) : ''}<${classArguments.parse({ registry })}>`;
    if (classExtends) header += " extends " + classExtends;

    if (classImplements && classImplements[0]) {
      let Implements = classImplements.contents;
      header += ` implements ${Implements.map((i) => {
        let [iName, iTags] = i.contents;

        return iName.parse({ registry }) + (iTags ? `<${iTags.parse({ registry })}>` : '');
      }).join(', ')}`
    }

    if (classCtor && !ForeignExps.length && !registry.isRecomp) {
      if (!Body.length) {
        Body = new Nodes.Body(null, []).setLoc(Class.loc);
      }

      Body.unwrap.unshift(
        Object.assign(new Nodes.Line("Expression",
          new Nodes.Expression('Value',
            new Nodes.Value("Function",
              new Nodes.Function(
                null,
                {},
                new Nodes.Base(null, {
                  id: new Nodes.Identifier('null', 'constructor').setLoc(classCtor.loc),
                  params: Object.assign(classCtor, { insertAll: true })
                }).setLoc(classCtor.loc),
                new Nodes.Body(null, []).setLoc(classCtor.loc)
              ).setLoc(classCtor.loc)
            ).setLoc(classCtor.loc)
          ).setLoc(classCtor.loc)
        ).setLoc(classCtor.loc), { isMethod: true })
      )
    }

    if (Body.length && classAugment && !registry.isRecomp) {
      let ctor, hasToString;
      for (let [func] of Body.contents.filter(Line => Line && Line.length)) {
        let synt = func.unwrapUntil && func.unwrapUntil(x => x instanceof Nodes.Function);
        if (synt) {
          let funcName = synt.unwrap[0][0] ? synt.unwrap[0][0][1] : null;
          if ([null, "constructor"].includes(funcName) && !ctor) {
            ctor = synt;
          }

          if (funcName === "toString") {
            hasToString = true;
          }
        }
      }

      let inserted = ctor ? getInsertedParams(ctor, { metaComments }) : [];

      if (registry.isTypeScript && !registry.omitTypeScript) {
        inserted.forEach(([i, , loc, tloc]) => {
          if (!thisRegistered.includes(i)) {
            let node = new Nodes.Line("Expression",
              new Nodes.Value("Assignable",
                new Nodes.Assignable("Identifier",
                  new Nodes.Identifier("IDENTIFIER", i)
                )
              )
            );
            if (tloc) {
              node.setLoc({ ...loc, type: tloc });
            }
            ThisProperties.push(node);
          }
        })
      }

      if (ctor && !hasToString) {
        let ins = inserted.map(p => p[0]), refVals, valArg, valContent;
        if (ins.length) {
          refVals = Reference(scope, true, 'vals');
          valArg = Reference(scope, true, 'val');
          valContent = Reference(scope, true, 'cont');
        }

        var loc = this.findToken('CLASS') || classCtor && classCtor.loc || this.loc;
        Body.unwrap.push(
          Object.assign(new Nodes.Line("Expression",
            new Nodes.Expression('Value',
              new Nodes.Value("Function",
                new Nodes.Function(
                  null,
                  {},
                  new Nodes.Base(null, {
                    id: new Nodes.Identifier(null, 'toString').setLoc(Class.loc)
                  }).setLoc(loc),
                  new Nodes.Body(null, [
                    new Nodes.Line("SimpleCode", [
                      `${ins.length ?
                        `${registry.useVar ? 'var' : 'let'} ${refVals} = ["${ins.join('", "')}"].map((function (${(!registry.omitTypeScript && registry.isTypeScript) ? `this: ${nom + cArgs}, ` : ''}${valArg}${(!registry.omitTypeScript && registry.isTypeScript) ? ': string' : ''}) {\n${tab(registry.tabSize, tabs + 3 + (!!ForeignExps.length))}${registry.useVar ? 'var' : 'let'} ${valContent}${(!registry.omitTypeScript && registry.isTypeScript) ? ': any' : ''} = this[${valArg}${(!registry.omitTypeScript && registry.isTypeScript) ? ` as keyof ${nom + cArgs}` : ''}];\n${tab(registry.tabSize, tabs + 3 + (!!ForeignExps.length))}return ${valArg} + "=" + (typeof ${valContent} === "string" && ('"'+ ${valContent}.replace('"', '\\"') +'"') || ${valContent});\n${tab(registry.tabSize, tabs + 2 + (!!ForeignExps.length))}}).bind(this));\n\n${tab(registry.tabSize, tabs + 2 + (!!ForeignExps.length))}` : ''
                      }return \`${nom}(${ins.length ? '${' + refVals + '.join(", ")}' : ''})\`;`
                    ])
                  ]).setLoc(loc),
                  { returns: ["string"] }
                ).setLoc(loc)
              ).setLoc(loc)
            ).setLoc(loc)
          ).setLoc(loc), { isMethod: true })
        );

        var tInserted = inserted.filter(inst => !!inst[3] && ThisProperties.findIndex(t => {
          return t.unwrap.parse({ addSemicolon: [] }) === inst[1]
        }) === -1);

        if (registry.isTypeScript && !registry.omitTypeScript && tInserted.length) {
          ThisProperties.unshift(...tInserted.map(([, Identifier, Loc, Type]) => {
            return new Nodes.Line('Expression',
              new Nodes.Expression('Value',
                new Nodes.Value('Assignable',
                  new Nodes.Assignable('Identifier',
                    new Nodes.Identifier(null, Identifier)
                  )
                )
              )
            ).setLoc({ ...Loc, type: Type })
          }))
        }
      }
    }

    if (!ForeignExps.length) {
      if (Body instanceof Nodes.Body) {
        Body = new Nodes.Body(null, Body.unwrap.
          sort((a, b) => {
            return (a.loc.first_line - b.loc.first_line) 
          })
          .map((Line, ind, arr) => ((Line.isMethod || arr[ind - 1] && arr[ind - 1].isMethod) && !Line.lineCount) ? Object.assign(Line, { lineCount: 1 }) : Line))
          .parse({ $such, scope, tabs: tabs + 1, isClass: { doesExtend: !!classExtends }, isChildren: true, vars: [].concat(vars), varExistent, constants, comments: [...comments, ...(metaComments || [])], lastNodeLocation: (Class[1] || Class[0] || { loc: lastNodeLocation }).loc, debug: true, registry });
      } else {
        Body = "";
      }

      if (ThisProperties.length && !this.isRecomp) {
        Body = ThisProperties.map((Type) => {
          return `${Type.unwrap.parse({ registry, addSemicolon: [] })}${Type.loc && Type.loc.type.optional ? '?' : ''}: ${Type.loc ? Type.loc.type.value : 'any'};`
        }).join(`\n${tab(registry.tabSize, tabs + 1)}`) + (Body.length ? `\n${tab(registry.tabSize, tabs + 1)}` : '') + Body;
      }

      output += header;
      if (Body.length) output += " {\n" + tab(registry.tabSize, tabs + 1) + Body + "\n" + tab(registry.tabSize, tabs) + "}"
      else output += ` {\n${tab(registry.tabSize, tabs)}}`
    } else {
      var lastNode, parsedBody;
      Body = Body.unwrap;

      vars.push(className);
      scope.push(className);

      let classBlock = new Nodes.Line("Expression",
        new Nodes.Expression("Class",
          new Nodes.Class(null, [nom], Class[1], new Nodes.Body(null, Body), classAugment, { ctor: classCtor, args: classArguments }).setLoc(this.loc)
        ).setLoc(this.loc)
      ).setLoc(this.loc);

      parsedBody = tab(registry.tabSize, tabs + 1) + new Nodes.Body(null, [classBlock, new Nodes.Line("SimpleCode", ""), ...ForeignExps]).parse({ that: [nom], scope, tabs: tabs + 1, vars: [], varExistent: [], comments: [...comments, ...(metaComments || [])], constants, registry });

      parsedBody += `\n${tab(registry.tabSize, tabs + 1)}return ${nom};`;

      output = nom + " = (function() {\n" + parsedBody + "\n" + tab(registry.tabSize, tabs) + "}).call(this);";

      if (!isValue) addSemicolon.push(1)
    }

    return output;
  }
}

Nodes.Compare = class Compare extends Base {
  get operand() {
    switch (this.rule) {
      case "IS":
        return "===";
      case "ISNT":
        return "!==";
      case "OR":
        return "||";
      case "AND":
        return "&&";
      default:
        return this.rule.toLowerCase();
    }
  }

  get inverse() {
    switch (this.operand) {
      case "IS":
        return "===";
      case "ISNT":
        return "!==";
      case "===":
        return "!==";
      case "!==":
        return "===";
      case "==":
        return "!=";
      case "!=":
        return "==";
      case "<":
        return ">=";
      case ">":
        return "<=";
      case ">=":
        return "<";
      case "<=":
        return ">";
      default:
        return this.operand; // Have to wrap the expression with !( ), so we return the same operand
    }
  }
}

Nodes.Else = class Else extends Base {
  get isIndirect() {
    if (this.rule === "ElseOtherwise Expression" && !(this.unwrapAll instanceof Nodes.Body)) return true;
  }
}

Nodes.Expression = class Expression extends Base {
  parse({ lineReturns = false, addSemicolon = [], construct = false, constants = [], vars = [], varExistent = [], that = [], $such = [], scope = [], isValue = false, isInvoked = false, isOperation = false, isLine = false, prevLine = [], tabs = 0, isCondition = false, isDirect = false, isClass = false, isCompare = false, isAssignment = false, isAssigned = false, ID = [], isParam = false, nl, func = false, scopedParams = Object.assign([], { generated: true }), comments = [], afterParse, metaComments = [], lastNodeLocation = { first_line: 0, first_column: 0, last_line: 0, last_column: 0 }, registry = {}, isUnless = false, FiresSuper = [], FiresAwait = [], FiresYield = [], assignRes = false, isStatement = false, constant = false, FiresSoak, isNarrow = false, isObjProperty, metaQueue, isParenthetical, NoPrint = false } = {}) {
    if (isParenthetical) isValue = true;
    var [rule, Exp] = this;
    let output = "", block, wrap, inverse;
    if (Exp[0] == "Expression") Exp = Exp[1];

    comments = matchComments(undefined, comments, this.loc).childComments;

    switch (this.rule) {
      case "JSX": {
        let wrapSelf;
        registry.isJSX = true;

        if (!isLine) {
          wrap = true;
        } else {
          if (lineReturns) wrapSelf = true;
          addSemicolon.pop();
        }

        let outcome;

        if (wrapSelf || wrap) {
          outcome = `\n${tab(registry.tabSize, tabs + 1)}${Exp.parse({ lineReturns, addSemicolon, construct, that, $such, scope, constants, vars, varExistent, isValue, prevLine, tabs: tabs + 1, isCondition, isOperation, isStatement, isDirect, isClass, isLine, isAssignment, ID, isParam, func, scopedParams, isAssigned, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, FiresSoak, isNarrow, isObjProperty, afterParse, metaComments, metaQueue, NoPrint })}\n${tab(registry.tabSize, tabs)}`
        } else {
          outcome = Exp.parse({ lineReturns, addSemicolon, construct, that, $such, scope, constants, vars, varExistent, isValue, prevLine, tabs, isCondition, isOperation, isStatement, isDirect, isClass, isLine, isAssignment, ID, isParam, func, scopedParams, isAssigned, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, FiresSoak, isNarrow, isObjProperty, afterParse, metaComments, metaQueue, NoPrint });
        }

        if (wrapSelf) outcome = `(${outcome})`;

        output += outcome;
        break;
      };
      case "While": {
        block = true;

        if (isValue) {
          let res = Reference(scope, true, 'results');
          output += Nodes.Block.wrap(this, '', 'return ' + res + ';').parse({ addSemicolon: [1], that, $such, scope, constants, vars, varExistent, isChildren: true, appendToVars: `${res}${(registry.isTypeScript && !registry.omitTypeScript ? ': any[]' : '')} = []`, tabs, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, callSelf: true, assignRes: [res, true] });
          break;
        }

        addSemicolon.pop();
        let [Condition, Body, Keyword] = Exp.contents;

        output += "while (" + Condition.parse({ addSemicolon: [], constants, vars, varExistent, that, $such, scope, isValue: true, prevLine, tabs, isCondition: true, isAssigned, scopedParams, comments, registry, isUnless: Keyword[0].endsWith("UNTIL"), FiresSuper, FiresAwait, FiresYield }) + ") {\n" + tab(registry.tabSize, tabs + 1) + Body.parse({ lineReturns: !!assignRes, that, $such, scope, vars, varExistent, constants, tabs: tabs + 1, comments, registry, isChildren: true, assignRes, FiresSuper, FiresAwait, FiresYield }) + "\n" + tab(registry.tabSize, tabs) + "}";
        break;
      };
      case "Switch": {
        block = true;
        if (isValue) {
          let res = Letter(scope, 's');
          output += Nodes.Block.wrap(this, '', 'return ' + res + ';').parse({ addSemicolon: [1], construct, that, $such, scope, constants, vars, varExistent, tabs, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, callSelf: true, assignRes: [res, false], appendToVars: res + (registry.isTypeScript && !registry.omitTypeScript ? ': any' : ''), isChildren: true });
          break;
        }

        addSemicolon.pop();
        output += Exp.parse({ lineReturns: !!assignRes, that, $such, scope, vars, varExistent, constants, tabs: tabs + 1, comments, registry, isChildren: true, assignRes, prevLine, FiresSuper, FiresAwait, FiresYield });
        break;
      }
      case "For": {
        block = true;
        if (isValue) {
          let res = Reference(scope, true, 'results');
          let Awaits = [];
          output += Nodes.Block.wrap(this, '', 'return ' + res + ';').parse({ addSemicolon: [1], construct, that, $such, scope, constants, vars: [], varExistent: [].concat(varExistent), tabs, comments, lastNodeLocation, registry, FiresSuper, FiresAwait: Awaits, FiresYield, callSelf: true, assignRes: [res, true], appendToVars: res + (registry.isTypeScript && !registry.omitTypeScript ? ': any[]' : '') + ' = []' });
          if (Awaits.length) {
            output = `await ${output}`;
            FiresAwait.push(1);
          }
          break;
        }

        addSemicolon.pop();
        output += Exp.parse({ lineReturns: !!assignRes, that, $such, scope, vars, varExistent, constants, tabs: tabs + 1, comments, registry, isChildren: true, assignRes, prevLine, FiresSuper, FiresAwait, FiresYield });
        break;
      };
      case "TryBlock": {
        block = true;
        if (isValue) {
          let res = Reference(scope, true, 'result');
          output += Nodes.Block.wrap(this, '', 'return ' + res + ';').parse({ addSemicolon: [1], construct, that, $such, scope, constants, vars, varExistent, isChildren: true, tabs, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, callSelf: true, isChildren: true, assignRes: [res, false], appendToVars: res + (registry.isTypeScript && !registry.omitTypeScript ? ': any' : '') });
          break;
        }

        addSemicolon.pop();
        let TRY, CATCH, FINALLY
        Exp.contents.filter(x => x !== null).map(([a, ...b]) => {
          switch (a.split(' ')[0]) {
            case "TRY":
            case "FINALLY": {
              let [Block] = b;
              if (Block instanceof Nodes.Block) {
                Block = Block.unwrap;
              }

              Block = Block.parse({
                lineReturns: lineReturns || !!assignRes, addSemicolon: [1], construct, that, $such, scope, constants, vars, varExistent, prevLine, tabs: tabs + 1, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield,
                assignRes, isChildren: true, func: lineReturns
              });
              let formatted = `${a.split(' ')[0].toLowerCase()} {\n${tab(registry.tabSize, tabs + 1)}${Block}\n${tab(registry.tabSize, tabs)}}`;

              if (a.split(' ')[0] === "TRY")
                TRY = formatted
              else FINALLY = formatted;
              break;
            };
            case "CATCH": {
              let [ErrValue, Block] = b, $$such = [];
              if (ErrValue) {
                ErrValue = ErrValue.parse({ registry })
              } else {
                ErrValue = Reference(scope, true, 'err');
                $$such[0] = ErrValue
              }

              if (Block instanceof Nodes.Block) {
                Block = Block.unwrap;
              }

              Block = Block.parse({
                lineReturns: lineReturns || !!assignRes, addSemicolon: [1], construct, that, $such: $$such, scope, constants, vars, varExistent, prevLine, tabs: tabs + 1, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, assignRes, isChildren: true, func: lineReturns
              });

              CATCH = `catch (${ErrValue}) {\n${tab(registry.tabSize, tabs + 1)}${Block}\n${tab(registry.tabSize, tabs)}}`;
              break;
            }
          }
        });

        if (!CATCH) {
          CATCH = `catch(${Reference(scope, false, 'err')}) {  }`
        }

        output += `${TRY} ${CATCH}${FINALLY ? ` ${FINALLY}` : ""}`
        break;
      };
      case "Operation": {
        if (isInvoked && !["DO Expression", "@ Value"].includes(this.unwrap.rule)) wrap = true;
        if (isUnless && !Exp.canInverse) { inverse = false; wrap = true; } else if (isUnless) {
          inverse = true;
        }

        isValue = isValue || Array.isArray(assignRes) && lineReturns;

        output += Exp.parse({ lineReturns, addSemicolon, construct, that, $such, scope, constants, vars, varExistent, isValue, prevLine, tabs, isCondition, isLine, isCompare, func, scopedParams, isAssigned, comments, lastNodeLocation, registry, isUnless, FiresSuper, FiresAwait, FiresYield });
        break;
      };
      case "Value": {
        if (!registry.isELSON && (isInvoked || isLine) && !lineReturns && (['Assignable'].includes(Exp.rule) && !["Identifier", "Array", "Value Access", "Expression IN Expression"].includes(Exp[1].rule)) || Exp.rule === "Function" && isInvoked) {
          wrap = true;
        }

        if (["Function"].includes(Exp.rule) && isClass) {
          block = true;
          addSemicolon.pop();
        }

        output += Exp.parse({ lineReturns, addSemicolon, construct, that, $such, scope, constants, vars, varExistent, isValue, prevLine, tabs, isCondition, isOperation, isStatement, isDirect, isClass, isLine, isAssignment, ID, isParam, func, scopedParams, isAssigned, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, FiresSoak, isNarrow, isObjProperty, afterParse, metaComments, metaQueue, NoPrint });
        break;
      };
      case "Class": {
        if (isInvoked) wrap = true;
        else block = true
        output += Exp.parse({ lineReturns, addSemicolon, construct, that, $such, scope, constants, vars, varExistent, isValue, prevLine, tabs, isCondition, isLine, func, scopedParams, isAssigned, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, metaComments });
        addSemicolon.pop();
        break;
      };
      case "Assign": {
        if (!isCompare && !isStatement && (isInvoked || isOperation || isNarrow)) wrap = true;
        output += Exp.parse({ vars, varExistent, lineReturns, that, $such, scope, constants, construct, isValue, prevLine, isCondition, isCompare, tabs, func, scopedParams, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, ID, isStatement, constant, addSemicolon, afterParse, metaComments, isClass });
        break;
      };
      case "If": {
        if (isInvoked) wrap = true;
        if (!Exp.quoteSyntax) {
          block = true;
          addSemicolon && addSemicolon.pop && addSemicolon.pop();
        }
        if (Array.isArray(assignRes)) {
          if (Exp.unwrap[2] instanceof Nodes.Expression) {
            Exp.unwrap[2] = Nodes.Block.wrap(Exp.unwrap[2]);
          }
        }
        output += Exp.parse({ vars, varExistent, constants, that, $such, scope, isValue, isInvoked, prevLine, tabs, lineReturns, isLine, func, scopedParams, isAssigned, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, assignRes });
        break;
      };
      case "Code": {
        if (isInvoked) wrap = true;
        let [FuncParams, Arrow, Body] = Exp.contents, { async: sync, yield: yields } = Exp;
        if (Body instanceof Nodes.Block) Body = Body.unwrap;

        let isInline = Body instanceof Nodes.Expression;

        if (sync) output += "async ";
        if (Arrow === "=") Arrow = "->";

        if (Arrow === "->") {
          output += "function";
          if (isLine) {
            output += " " + Reference(scope, true, 'fn');
          }
          output += "(";
        } else output += "(";

        let Params = [], ParsedParams = [], Insert = [], lastNode;
        if (FuncParams !== null) {
          for (let Parameter of FuncParams.contents) {
            lastNode = Parameter.loc;
            ParsedParams.push(ParseParam(Parameter.unwrap, { scope, vars, varExistent, tabs: tabs + 1, constants, $such, that, varExistent, Insert, Params, comments, lastNodeLocation, registry, metaComments }));
          }
        }

        if (Insert.length && !registry.isRecomp) {
          if (isInline) {
            Body = Nodes.Block.wrap(Body);
            isInline = false;
          }

          let Lines = Body[1];
          let index = 0;
          Lines.find(([, Exp], i) => {
            if (!(Exp instanceof Base)) return;
            let FiresSuper = [];
            Exp.parse({ FiresSuper });
            if (FiresSuper.length) {
              index = i + 1;
            }
          });

          Lines.splice(index, 0, ...(Insert.map((ins, i) => {
            return new Nodes.Line("SimpleCode", [
              `${(that && that[0]) || "this"}.${registry.sources ? registry.sources.add(ins[2]) : ''}${ins[0]} = ${ins[1]};`
            ])
          })))
        }

        output += ParsedParams.join(', ') + ')';
        let Awaits = [], Generator = [], isArrow;
        if (isInline && Arrow === "=>") {
          isArrow = true;
          output += " => ";
          output += Body.parse({ constants, that, $such, scope: scope.concat(...Params), isValue: true, prevLine, tabs, isLine, func: true, scopedParams: Params, isAssigned, vars, varExistent, comments, lastNodeLocation, registry, FiresAwait: Awaits, FiresYield: Generator })
        } else {
          output += Arrow === "=>" ? (isArrow = true) && ` ${Arrow} ` : " ";
          output += "{\n" + tab(registry.tabSize, tabs + 1) + Body.parse({ lineReturns: true, constants, that, $such, scope: scope.concat(...Params), varExistent: vars, varExistent, tabs: tabs + 1, func: true, scopedParams: Params, comments, lastNodeLocation, registry, FiresAwait: Awaits, FiresYield: Generator }) + "\n" + tab(registry.tabSize, tabs) + "}";
        }
        if ((Generator.length || yields) && isArrow) {
          this.throwSyntaxError('Generators can\'t be used in arrow functions.', Generator[0]);
        } else if (Generator.length || yields) {
          output = output.replace(/^function\(/, 'function*(')
        }

        if (Awaits.length && !sync) {
          output = `async ${output}`;
        }
        break;
      };
      case "Label": {
        let Bd;
        output += Exp[1].parse({ registry }) + ': ';
        if (Exp[2] instanceof Nodes.Block) Bd = Exp[2].unwrap
        else Bd = Exp[2];
        output += `{\n${tab(registry.tabSize, tabs + 1)}${Bd.parse({ that, $such, scope, vars, varExistent, constants, tabs: tabs + 1, comments, registry, isChildren: true, assignRes, prevLine, FiresSuper, FiresAwait, FiresYield })}\n${tab(registry.tabSize, tabs)}}`
        break;
      }
    }

    if (lineReturns && !block) {
      if (Array.isArray(assignRes)) {
        output = (registry.sources ? registry.sources.add(this.loc) : '') + assignRes[0] + (assignRes[1] ? ".push(" + output + ")" : " = " + output);
      } else output = (registry.sources ? registry.sources.add(this.loc) : '') + "return " + output;
    }

    if (wrap) {
      output = (registry.sources ? registry.sources.add(this.loc) : '') + "(" + output + ")";
    }

    if (isUnless && !inverse) {
      output = "!" + output;
    }

    if (construct) {
      output = (registry.sources ? registry.sources.add(this.loc) : '') + "new " + output;
    }

    if (addSemicolon.length && !block) {
      output += ";";
      addSemicolon.pop()
    }

    return output;
  }
}

Nodes.For = class For extends Base {
  parse({ prevLine, lineReturns, that, $such, scope, vars, varExistent, constants, tabs, comments, registry = {}, isChildren, assignRes, appendToVars, FiresSuper, FiresAwait, FiresYield }) {
    let [Header, Body, Keyword] = this.contents, output = "";
    Body = Body instanceof Nodes.Block ? Body.unwrap : Body;

    if (typeof Header[1] === "string") {
      if (/for_(from|at|as)/.test(Header[1])) {
        let [[Index, Values], , Target] = Header, Assignments = [];
        let _ref = Letter(scope, 'j');
        let kw = Keyword ? Keyword[0].toLowerCase() + " " : "";

        scope.push(_ref);
        vars.push(_ref);
        if (!Keyword && !vars.includes(Index.parse().toString)) vars.push(Index.parse().toString());

        let refAssignable = new Nodes.Identifier('Identifier', _ref);

        output += `for (${kw}${Index.parse({ that, $such, scope, constants, vars, varExistent, registry })} in (${registry.sources ? registry.sources.add(Target.loc) : ''}${_ref} = ${Target.parse({ that, $such, scope, vars, varExistent, constants, isValue: true, isAssigned: true, registry, FiresSuper, FiresAwait, FiresYield })})) {\n` + tab(registry.tabSize, tabs);

        Target = new Nodes.Expression('Value',
          new Nodes.Value('Assignable',
            new Nodes.Assignable('Value Access',
              new Nodes.Value('Assignable',
                new Nodes.Assignable('Identifier',
                  refAssignable.setLoc(Target.loc)
                ).setLoc(Target.loc)
              ).setLoc(Target.loc),
              new Nodes.Access('INDEX_START Expression INDEX_END',
                Index
              ).setLoc(Index.loc)
            ).setLoc(Target.loc)
          ).setLoc(Target.loc)
        )

        let section = kw + new Nodes.Expression('Assign',
          new Nodes.Assign(
            'Assignment',
            new Nodes.Assignment(
              null,
              Values,
              Target,
              [Header[1].split('_').pop().toUpperCase()]
            ).setLoc(Values.loc)
          ).setLoc(Values.loc)
        ).parse({ that, $such, scope, vars, varExistent, constants, tabs: tabs, comments, registry, isChildren, assignRes, prevLine: Assignments, isLine: true, FiresSuper, FiresAwait, FiresYield, isStatement: Array.isArray(Keyword), constant: Keyword && Keyword[0] === "CONST" }) + `;\n\n${tab(registry.tabSize, tabs)}`;

        output += `${Assignments.length ? Assignments.join(`;\n${tab(registry.tabSize, tabs)}`) + `;\n${tab(registry.tabSize, tabs)}` : ''}${section}`;

        output += Body.parse({ prevLine, lineReturns, that, $such, scope, vars, varExistent, constants, tabs, comments, registry, isChildren: true, assignRes, FiresSuper, FiresAwait, FiresYield })
        output += `\n${tab(registry.tabSize, tabs - 1)}}`
      } else {
        let [Assignable, Kwd, TTarget] = Header, Assignments = [], section = "";

        if (Kwd === "for_of" || (Kwd === "for_in" && Assignable.rule === "Identifier")) {
          let ID = [];
          if (!Keyword) {
            (new Nodes.Assignment("Assignable AssignKeyword Expression", Assignable, new Nodes.Expression(null, []), ['AS'])).setLoc(Header[0].loc).parse({ that, $such, scope, vars, varExistent, constants, registry, ID, hasTypes: [], tabs });

            for (let [id, loc] of ID) {
              if (!vars.includes(id.toString())) {
                vars.push(id);
                if (loc) {
                  if (!vars.__locations) {
                    vars.__locations = {};
                  }
  
                  vars.__locations[id] = loc;
                }
              }
            }
          }

          let kw = Keyword ? Keyword[0].toLowerCase() + " " : ""

          output += `for (${kw}${Header[0].parse({ prevLine, that, $such, scope, vars, varExistent, constants, tabs, comments, registry, isChildren, assignRes, addSemicolon: [] })} ${registry.sources ? registry.sources.add(Header[2].loc) : ''}${Header[1].split('_')[1]} ${Header[2].parse({ prevLine, that, $such, scope, vars, varExistent, constants, tabs, comments, registry, isChildren, assignRes, addSemicolon: [], FiresSuper, FiresAwait, FiresYield })}) {\n${tab(registry.tabSize, tabs)}${Body.parse({ prevLine, lineReturns, that, $such, scope, vars, varExistent, constants, tabs, comments, registry, isChildren: true, assignRes, FiresSuper, FiresAwait, FiresYield })}\n${tab(registry.tabSize, tabs - 1)}}`
        } else {
          let _ref = Letter(scope, 'j'), _i = Letter(scope.concat(_ref), 'i');

          scope.push(_ref, _i);
          vars.push(_ref, _i);

          let refAssignable = new Nodes.Identifier('Identifier', _ref);
          let iAssignable = new Nodes.Expression('Value',
            new Nodes.Value('Assignable',
              new Nodes.Assignable('Identifier',
                new Nodes.Identifier('IDENTIFIER', _i)
              )
            )
          )

          let Target = new Nodes.Expression('Value',
            new Nodes.Value('Assignable',
              new Nodes.Assignable('Value Access',
                new Nodes.Value('Assignable',
                  new Nodes.Assignable('Identifier',
                    refAssignable.setLoc(TTarget.loc)
                  ).setLoc(TTarget.loc)
                ).setLoc(TTarget.loc),
                new Nodes.Access('INDEX_START Expression INDEX_END',
                  iAssignable
                ).setLoc(Assignable.loc)
              ).setLoc(TTarget.loc)
            ).setLoc(TTarget.loc)
          );

          let kw = Keyword ? Keyword[0].toLowerCase() + " " : ""
          section = kw + new Nodes.Expression('Assign',
            new Nodes.Assign(
              'Assignment',
              new Nodes.Assignment(
                null,
                Assignable,
                Target,
                ['AS']
              ).setLoc(Assignable.loc)
            ).setLoc(Assignable.loc)
          ).parse({ that, $such, scope, vars, varExistent, constants, tabs: tabs, comments, registry, isChildren, assignRes, prevLine: Assignments, isLine: true, FiresSuper, FiresAwait, FiresYield, isStatement: Array.isArray(Keyword), constant: Keyword && Keyword[0] === "CONST" }) + `;\n\n${tab(registry.tabSize, tabs)}`;

          output += `for (${_i} in (${_ref} = ${TTarget.parse({ that, $such, prevLine, scope, vars, varExistent, constants, isAssigned: true, isValue: true, addSemicolon: [], registry, comments, FiresSuper, FiresAwait, FiresYield })})) {\n${tab(registry.tabSize, tabs)}${Assignments.length ? Assignments.join(`;\n${tab(registry.tabSize, tabs)}`) + `;\n${tab(registry.tabSize, tabs)}` : ''}${section}${Body.parse({ prevLine, lineReturns, that, $such, scope, vars, varExistent, constants, tabs, comments, registry, isChildren: true, assignRes, FiresSuper, FiresAwait, FiresYield })}\n${tab(registry.tabSize, tabs - 1)}}`
        }
      }
    } else {
      let Headers = Header.map(h => {
        return h.parse({ that, $such, scope, vars, varExistent, constants, isValue: true, isAssigned: true, registry, FiresSuper, FiresAwait, FiresYield, registry })
      }).join('; ');
      output += `for (${Headers}) {\n${tab(registry.tabSize, tabs)}${Body.parse({ prevLine, lineReturns, that, $such, scope, vars, varExistent, constants, tabs, comments, registry, isChildren: true, assignRes, FiresSuper, FiresAwait, FiresYield })}\n${tab(registry.tabSize, tabs - 1)}}`;
    }

    return output;
  }
}

Nodes.ForExpression = class ForExpression extends Base {
  parse(opts) {
    let { rule } = this;
    if (rule === "Declare") {
      return (new Nodes.Statement('Declare', this.unwrap)).setLoc(this.loc).parse(opts);
    } else {
      return this.unwrap.parse(opts);
    }
  }
}

function getInsertedParams(Func, { metaComments }) {
  let Value = Func.contents;
  let Header = Value[1] && Value[1].unwrap, FuncParams = Header.params || [];

  let Params = [], ParsedParams = [], Insert = [], lastNode, typeData = [], InsertAll = FuncParams && FuncParams.insertAll;
  if (FuncParams && (FuncParams[1] instanceof Nodes.ParamList)) {
    for (let i = 0, p = FuncParams[1].contents; i < p.length; i++) {
      let Parameter = p[i];
      lastNode = Parameter.loc;
      ParsedParams.push(ParseParam(Parameter.unwrap, { scope: [], vars: [], varExistent: [], tabs: 1, constants: [], $such: [], that: [], Insert, Params, comments: [], lastNodeLocation: Func.loc, registry: {}, isParam: true, typeData, i, metaComments }));
    }
  }

  if (InsertAll) {
    Params.filter(P => Array.isArray(P)).filter(([Param]) => Insert.findIndex(Ins => Ins[1] === Param) === -1).map(([Param, Loc, Type]) => Insert.push([Param, Param, Loc, Type]));
  }

  return Insert;
}

Nodes.FunctionPostlude = class extends Base { }

Nodes.FunctionPrelude = Nodes.ClassFunctionPrelude = class FunctionPrelude extends Base {
  addTag(toAdd) {
    let [rule, token, loc] = toAdd;
    for (let [tag] of this.contents) {
      if (tag === "GET" && token === "SET") {
        toAdd.throwSyntaxError(`can't use a setter in a getter function`);
      } else if (tag === "SET" && token === "SET") {
        toAdd.throwSyntaxError(`can't use a getter in a setter function`);
      }
    }

    Object.assign(toAdd.loc, loc);

    this.push(toAdd);
    return this.contents;
  }

  buildObject() {
    let result = {};
    for (let token of this.contents) {
      result[token[0].toLowerCase()] = token;
    }

    return result;
  }
}

Nodes.Function = Nodes.ClassFunction = class Function extends Base {
  parse({ that = [], $such = [], scope = [], vars = [], varExistent = [], constants = [], prevLine = [], isValue, tabs = 0, func = [], scopedParams = [], comments = [], lastNodeLocation = {}, registry = {}, FiresSuper = [], isInvoked, isParam, isClass, isObject, lineReturns, isExport, isLine, metaComments = [], metaQueue = [] }) {
    let { loc, rule } = this;
    let output = "";

    let Value = this.contents;

    let FunctionTags = Value[0] && Value[0].addTag ? Value[0].buildObject() : Value[0];

    let returns, { get: getter = undefined, static: _static, set: setter, async: sync, function: FnT } = FunctionTags || {};
    let yields = FnT && FnT.loc && FnT.loc.origin === "function*";

    if (_static) {
      output += "static "
    }
    if (getter) {
      output += "get "
    }
    if (setter) {
      output += "set "
    }
    if (sync) {
      output += "async "
    }

    let yieldable = true;
    if (!isClass && !isObject) {
      output += `function${yields ? '*' : ''} `;
    } else {
      yields ? output += `* ` : void 0;
    }

    let Header = Value[1] && Value[1].unwrap || {}, { id: FuncName, params: FuncParams, generics: args } = Header || {}, asyncable = true, Supers;

    returns = [];

    if (FuncParams && FuncParams.loc && FuncParams.loc.type) {
      returns.push(FuncParams.loc.type)
    }


    if (returns.length > 1) {
      this.throwSyntaxError('Duplicate return-type annotation after end of name/parameters', returns[1].loc);
    }

    if (Value[2]) {
      if (Value[2].loc && Value[2].loc.type) {
        returns.push(Value[2].loc.type);
      }

      if (Value[2] instanceof Nodes.FunctionPostlude) {
        Value[2] = Value[2].unwrap;
      }
    } else {
      Value[2] = Nodes.Block.wrap().setLoc(this.loc);
    }

    if (!FuncName && isExport) {
      this.throwSyntaxError('Expected a name for exported function.');
    }

    if (FuncName) {
      FuncName = FuncName.parse ? FuncName.parse() : FuncName;

      if (isObject && /FUNCTION/.test(rule)) {
        output += `${FuncName}: function `
      }
      if (isClass && FuncName === "constructor") {
        asyncable = false;
      } else if (isClass && isClass.doesExtend) {
        Supers = FuncName.parse ? FuncName.parse() : FuncName;
      }
      output += FuncName.parse ? FuncName.parse({ registry }) : (registry.sources ? registry.sources.add(FuncName.loc || Value[1].loc) : '') + FuncName;
    } else if (isClass) {
      output += (registry.sources ? registry.sources.add(loc) : '') + (FuncName = "constructor");
      asyncable = false;
    } else if (isLine && !isValue) {
      output += (registry.sources ? registry.sources.add(loc) : '') + (FuncName = Reference(scope, true, "fn"));
      $such.push(FuncName);
    } else if (isObject) {
      throwSyntaxError({
        message: 'Object literals can\'t contain anonymous functions.',
        location: {
          ...loc,
          last_line: loc.first_line,
          last_column: loc.first_column + 1
        }
      });
    }


    if (sync && !asyncable) {
      throwSyntaxError({
        message: "'async' modifier cannot appear on a constructor declaration.",
        location: {
          ...loc,
          last_line: loc.first_line,
          last_column: loc.first_column + 5,
          scope: registry.scope
        }
      });
    }

    if (args && !registry.omitTypeScript) {
      registry.isTypeScript = true;
      output += (registry.sources ? registry.sources.add(args.loc) : '') + '<' + args.parse({ registry }) + '>';
      args = undefined;
    }

    output += "(";
    let b;

    if (output == "function (") output = "function(";
    let header = output;

    let { childComments } = matchComments(loc, comments, loc), commentOutput = "";

    let Params = [], ParsedParams = [], Insert = [], lastNode, typeData = [], InsertAll = !!FuncParams && FuncParams.insertAll;
    if (FuncParams && (FuncParams[1] instanceof Nodes.ParamList)) {
      for (let i = 0, p = FuncParams[1].contents; i < p.length; i++) {
        let Parameter = p[i];
        lastNode = Parameter.loc;
        ParsedParams.push(ParseParam(Parameter.unwrap, { scope, vars, varExistent, tabs, constants, $such, that, Insert, InsertAll, Params, comments: childComments, lastNodeLocation, registry, isParam: true, typeData, i, metaComments }));
      }
    }

    let DocParams = Params;
    Params = Params.filter(Param => Array.isArray(Param));

    if (InsertAll) {
      Params.filter(P => Array.isArray(P)).filter(([Param]) => Insert.findIndex(Ins => Ins[1] === Param) === -1).map(([Param, Loc]) => Insert.push([Param, Param, Loc]));
    }

    var ParamData = [];
    for (let l = DocParams.length, i = 0; i < l; i++) {
      let Param = DocParams[i];

      if (!Array.isArray(Param)) {
        ParamData.push(Param);
        continue;
      }

      let [ID, loc, metaType, ID2 = ID, propertyID] = Param;

      metaType = metaType ? { value: metaType.nodes.parse({ registry }), loc: metaType.nodes.loc, ID, ID2 } : undefined;

      if (!metaType) {
        metaType = getDataOfMetaComments({ metaComments, ID, ID2, tabs, loc, registry, strict: true });
      } else {
        attachDescriptions(metaComments, [metaType], tabs, registry, true);
      }

      if (metaType) {
        ParamData.push({
          ID,
          ...metaType,
          propertyID
        })
      } else {
        ParamData.push({ ID, propertyID });
      }
    }

    function gfl(elm) {
      if (elm.commentStart) {
        return elm.commentStart
      } else if (elm.last_comment) {
        return elm.last_comment.first_line;
      } else if (elm.comment) {
        return elm.comment.loc.first_line;
      }
    }

    let startLine, lessThanLine, startComm = ParamData.filter(t => !t.symbol && (t.commentStart !== undefined || t.last_comment !== undefined || t.comment !== undefined)).sort((a, b) => {
      return gfl(a) - gfl(b);
    })[0];

    if (startComm) {
      startLine = gfl(startComm);
    } else {
      lessThanLine = startLine = this.loc.first_line;
    }

    var selectedComments = metaComments.slice(0, lessThanLine !== undefined ? metaComments.length : metaComments.findIndex(c => c.loc.first_line === startLine)).filter(c => !c.read && !/^(#:)?\s*((?:[^\x00-\x7F]|[a-z$_])(?:[^\x00-\x7F]|[a-z$_\d])*)\s*(:|-*>|=>?)/i.test(c[1]));

    var selectedDescription = [];

    for (let comment of selectedComments.reverse()) {
      if (comment.loc.last_line === startLine - 1) {
        selectedDescription.unshift(comment[1]);
        startLine = comment.loc.first_line;
        comment.read = true;
      } else break;
    };

    if (!!ParamData.find(d => (registry.isTypeScript && !registry.omitTypeScript) ? d.description : d.value) || selectedDescription.length) {
      buildFunctionDefinitionWithJSDoc({ ParamData, registry, tabs, loc: this.loc, prevLine, scope, selectedDescription: selectedDescription.join(`\n${tab(registry.tabSize, tabs)} * `) });
    }

    if (Insert.length && !registry.isRecomp) {
      if (Value[2] instanceof Nodes.Expression || Value[2] instanceof Nodes.Statement) {
        Value[2] = new Nodes.Block(null, Nodes.Block.wrap(Value[2]));
      }

      let Lines = Value[2][1];
      let index = 0;

      Lines.find(([, Exp], i) => {
        if (!(Exp instanceof Base)) return;
        let FiresSuper = [];
        Exp.parse({ FiresSuper });
        if (FiresSuper.length) {
          index = i + 1;
          return true;
        }
      });

      Lines.splice(index, 0, ...(Insert.map((ins, i) => {
        return new Nodes.Line("SimpleCode", [
          `${(that && that[0]) || "this"}.${(registry && registry.sources) ? registry.sources.add(ins[2]) : ''}${ins[0]} = ${ins[1]};`
        ])
      })))
    }

    if (!Value[2][1] || !Value[2][1].length) Value[2][1] = [];

    if (childComments.length && Value[2].loc) {
      for (let comment of childComments) {
        if (registry[comment.id]) continue;
        if (comment.loc.first_line === Value[2].loc.first_line) {
          commentOutput += parseComment(comment, tabs, undefined, registry) + tab(registry.tabSize, tabs + 1);
          registry[comment.id] = true;
        }
      }
    }

    let Awaits = [], Yields = [];

    output = Value[2].parse({ scope: scope.concat(...Params), isValue, tabs: tabs + 1, lineReturns, canReturn: !setter, func: (FuncName === "constructor") && isClass ? false : true, scopedParams: Object.assign(Params.map(([Param]) => Param), { Supers }), varExistent: [...vars, ...varExistent], comments, lastNodeLocation, registry, FiresAwait: Awaits, FiresYield: Yields });

    let ParamsOutput = ParsedParams.join(', ');

    if (ParamsOutput && getter) {
      throwSyntaxError({
        message: 'An accessor cannot have parameters',
        location: FuncParams[1].loc
      });
    }

    header += ParamsOutput + ")";

    if (returns && returns.length && !registry.omitTypeScript) {
      registry.isTypeScript = true;
      header += `: ${returns[0].nodes ? returns[0].nodes.parse({ registry }) : returns[0]}`
    }

    header += ' ';

    output = header + "{" + (commentOutput ? " " + commentOutput.trim() : "") + "\n" + tab(registry.tabSize, tabs + 1) + output + "\n" + tab(registry.tabSize, tabs) + "}";

    if (Yields.length && !yields) {
      if (!yieldable) {
        throwSyntaxError({
          message: 'Unexpected yield.',
          location: Yields[0]
        });
      }

      output = output.replace(/^function/i, 'function*');
    }

    if (Awaits.length && !sync) {
      if (!asyncable) {
        throwSyntaxError({
          message: "'await' statements cannot appear on a constructor declaration.",
          location: Awaits[0]
        });
      }
      output = `async ${output}`;
    }

    let lastCommLoc = this.loc;
    let docComments = [];

    for (let o = metaComments.length; o > 0; o--) {
      let c = metaComments[o - 1];

      if (!registry[c.id] && ((c.loc.last_line + 1) === lastCommLoc.first_line || c.loc.last_line === lastCommLoc.first_line && c.loc.last_column < lastCommLoc.first_column)) {
        lastCommLoc = c.loc;
        docComments.unshift(c[1]);
      }
    };

    if (docComments.length) {
      if (metaQueue) {
        metaQueue.push({
          1: ['* ', ...docComments].join('\n' + tab(registry.tabSize, tabs) + ' * ') + '\n' + tab(registry.tabSize, tabs),
          block: true
        });
      }
    }

    return output;
  }
}


Nodes.Identifier = class Identifier extends Base {
  parse({ registry: { sources } = {} } = {}) {
    let Identifier = this[1];
    if (Array.isArray(Identifier[0]) && Identifier[0].length) { Identifier = Identifier[0] }

    if (this.rule === 0 && !/^((?:[^\x00-\x7F]|[a-z$_])(?:[^\x00-\x7F]|[a-z$_\d])*)$/i.test(Identifier)) this.throwSyntaxError('Can\'t convert property to importable variable.');

    if (sources) {
      Identifier = sources.add(this.loc) + Identifier
    }

    return Identifier;
  }
}

Nodes.If = class IfBlock extends Base {
  parse({ isStatement, vars, varExistent, constants, that, $such, scope, isValue, isInvoked, prevLine, tabs, lineReturns, isLine, scopedParams, isAssigned, comments, lastNodeLocation, registry = {}, FiresSuper = [], assignRes } = {}) {
    let func;
    let output = "";

    let If = this;

    if (If.postfix) {
      let isUnless = If.unless;
      if (If.statement) {
        isValue = false; isStatement = true;
      }

      If = If.contents;

      let plusTabs = tabs;

      if (isInvoked && !isValue) {
        plusTabs++
      }

      let [Condition, Body] = [
        If[0].parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue, isCondition: true, tabs, comments, lastNodeLocation, registry, isUnless, FiresSuper }),
        If[1].parse({ that, $such, scope, vars, varExistent, constants, prevLine, tabs, lineReturns, addSemicolon: isValue ? [] : [1], comments, lastNodeLocation: If[0].loc, registry, FiresSuper })
      ];

      if (isValue && !(If[1] instanceof Nodes.Statement)) {
        output += Condition + " ? " + Body + " : void 0"
      } else if (isInvoked) {
        output += "if (" + Condition + ") {\n" + tab(registry.tabSize, plusTabs + 1) + Body + "\n" + tab(registry.tabSize, tabs + 1) + "}" + "\n" + tab(registry.tabSize, tabs)
      } else {
        output += "if (" + Condition + ") {\n" + tab(registry.tabSize, tabs + 1) + Body + "\n" + tab(registry.tabSize, tabs) + "}"
      }

      if (isInvoked) {
        if (isStatement) output = "{\n" + tab(registry.tabSize, plusTabs) + output + "}";

        output = "() => " + output;
      }

      return output;
    }

    const { loc, quoteSyntax } = If, real = If;
    If = If.contents;

    let isIndirect = (quoteSyntax || /IfUnless (\( )?Expression (\) )?(DoThen )?(\{ )?Expression/.test(If[0].rule)) && !Array.isArray(assignRes);
    let isElseIndirect;
    if (If[1]) {
      isElseIndirect = isIndirect && (quoteSyntax || If[1].isIndirect)
    }

    if (isValue && !isIndirect) {
      let rearrange = Nodes.Block.wrap(new Nodes.Expression("If", real)).setLocation(If.loc);

      return rearrange.parse({ that, $such, scope, vars, varExistent, constants, tabs: tabs, callSelf: true, isChildren: true, comments, lastNodeLocation, registry, FiresSuper, scopedParams });
    }

    let Condition, Body, Unless, Else = If[1];
    [Condition, Body, Unless] = If[0].contents;

    let Soaks = [], condLoc = Condition.loc;
    Condition = Condition.parse({
      that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, tabs, isCondition: true, isDirect: true, comments, lastNodeLocation, FiresSuper, registry, isUnless: Array.isArray(Unless) && Unless[0] === "UNLESS", FiresSoak: Soaks
    });

    if (Soaks.length) {
      Condition = loadSoaks(Condition, { tabs, scope, vars, prevLine, Soaks, registry, loc: this.loc });
    }

    if (lineReturns) func = true;

    let bodyLoc = Body.loc, elseLoc = Else ? Else.loc : { first_line: bodyLoc.last_line, first_column: bodyLoc.last_column };
    Soaks = [];
    if (Body instanceof Nodes.Expression || Body instanceof Nodes.Statement) {
      let { matchedComments } = matchComments(condLoc, comments, elseLoc);
      Body = Body.parse({ that, $such, scope, vars, varExistent, constants, tabs: isIndirect ? tabs : tabs + 1, isValue: !Else ? isIndirect : isIndirect && isElseIndirect, prevLine, lineReturns: lineReturns && !isIndirect, addSemicolon: isIndirect ? [] : [1], comments: matchedComments, lastNodeLocation: Condition.loc, registry, FiresSuper, assignRes, FiresSoak: Soaks, isNarrow: !Else ? isIndirect : isIndirect && isElseIndirect });

      if (Soaks.length) {
        Body = loadSoaks(Body, { tabs, scope, vars, prevLine, Soaks, registry, loc: bodyLoc })
      }

      for (let comment of matchedComments) {
        if (registry[comment.id]) continue;
        let commentOutput = parseComment(comment, tabs + 1, true, registry);

        Body += '\n' + tab(registry.tabSize, tabs + 1) + commentOutput.trim();

        registry[comment.id] = true;
      }
    } else {
      Body = Body instanceof Nodes.Block ? Body.unwrap : Body;
      Body = Body.parse({ that, $such, scope, vars, varExistent, constants, tabs: tabs + 1, isChildren: true, func: lineReturns, comments, lastNodeLocation: Condition.loc, registry, FiresSuper, assignRes });
    }

    let isElseIf;
    if (Else) {
      Else = Else.unwrap;
      if ((Else instanceof Nodes.Expression) || (Else instanceof Nodes.Statement)) {
        Soaks = [];
        isElseIf = Else.unwrap instanceof Nodes.If;

        Else = Else.parse({ that, $such, scope, vars, varExistent, constants, tabs: tabs + 1 - (isElseIf || isIndirect), isValue: isIndirect && isElseIndirect, prevLine, lineReturns: !isElseIndirect && lineReturns, addSemicolon: isElseIndirect ? [] : [1], comments, lastNodeLocation: Body.loc, registry, FiresSuper, assignRes, FiresSoak: Soaks, isNarrow: isIndirect && isElseIndirect });

        if (Soaks.length) {
          Else = loadSoaks(Else, { tabs, scope, vars, prevLine, Soaks, registry, loc: elseLoc })
        }
      } else {
        Else = Else.unwrap;

        isElseIndirect = false;

        isElseIf = (Else[1].length === 1) && Else.unwrapUntil && !!Else.unwrapUntil(C => C instanceof Nodes.If);

        Else = Else.parse({ that, $such, scope, vars, varExistent, constants, isChildren: true, tabs: tabs + 1 - isElseIf, func, comments, lastNodeLocation: Condition.loc, registry, FiresSuper, assignRes });
      }
    }

    if (!isIndirect || isIndirect && Else && !isElseIndirect) {
      output += "if (" + Condition + ") ";
      output += "{\n" + tab(registry.tabSize, tabs + 1) + Body + "\n" + tab(registry.tabSize, tabs) + "}"
      if (Else) {
        if (isElseIf) {
          output += " else " + Else
        } else {
          output += " else {\n" + tab(registry.tabSize, tabs + 1) + Else + "\n" + tab(registry.tabSize, tabs) + "}"
        }
      }
    } else {
      if (!isValue && lineReturns) output = (registry.sources ? registry.sources.add(this.loc) : '') + "return " + output;
      output += `${Condition} ? ${Body} : ${Else ? Else : 'void 0'}`;
    }

    return output;
  }
}

Nodes.Interpolation = class Interpolation extends Base {
  parse(opts) {
    switch (this.rule) {
      case "String": {
        return this.unwrap.parse(opts).replace('`', opts.inJSX ? '`' : '\\`');
      };
      default: {
        let int = this.unwrap.parse({ ...opts, addSemicolon: [], isValue: true });
        return opts.inJSX ? `{${int}}` : `\${${int}}`;
      }
    }
  }
}

Nodes.Invocation = class Invocation extends Base {
  parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue, tabs = 0, lineReturns, func, scopedParams, comments = [], lastNodeLocation, registry = {}, FiresSuper = [], FiresSoak, NoPrint = false } = {}) {
    let [Value, Arguments, TypeArguments] = this.contents, { soak, templ } = this, lastNode;
    let Params = !templ && Arguments && Arguments.unwrap, x = Arguments && Arguments.indented, BeforeComments = "", ll;

    lastNode = Params && Params.loc || this.loc;


    let vRule = Value.rule, vLoc = Value.loc;
    let Soaks = [];


    Value = Value === "super" ? scopedParams && scopedParams.Supers ? `${Value}.${scopedParams.Supers}` : Value : (Value.parse({}) === "print" && registry.cout && !NoPrint) ? (registry.sources ? registry.sources.add(Value.loc) : "") + registry.cout : Value.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isInvoked: true, tabs, lineReturns, func, scopedParams, comments, lastNodeLocation, registry, FiresSoak: Soaks });

    if (Soaks.length) {
      Value = loadSoaks(Value, { tabs, scope, vars, prevLine, Soaks, registry, loc: vLoc })
    }

    if (soak) {
      let _ref = Value, s = "";

      if (vRule !== "Assignable") {
        _ref = Letter(scope, 'f');
        vars.push(_ref);
        scope.push(_ref);
        s += `(${_ref} = ${Value}) && `
      }

      s += `typeof ${_ref} === "function" ? ${_ref}`;

      Value = s;
    }

    if (TypeArguments) {
      TypeArguments = `${registry.sources ? registry.sources.add(TypeArguments.loc) : ""}<${TypeArguments.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isInvoked: true, tabs, lineReturns, func, scopedParams, comments, lastNodeLocation, registry, FiresSoak: Soaks })}>`;
    } else TypeArguments = "";

    for (let comment of comments.filter(c => (c.loc.first_line < lastNode.first_line) || (c.loc.first_line === lastNode.first_line && c.loc.first_column < lastNode.first_column))) {
      if (registry[comment.id]) continue;
      let commentOutput = parseComment(comment, tabs + 1, true, registry);

      BeforeComments += commentOutput;

      registry[comment.id] = true;
      x = true;
    }

    if (!templ && typeof Params !== "undefined" && Params.contents.length) {
      x = Params.contents.find((Param) => {
        if (/boolean|undefined/.test(typeof Param)) {
          return !Param;
        }

        if (Param.unwrap.rule === "Code") return true;
        if (Param.unwrap.rule === "Value" && Param.unwrap.unwrap.rule === 'Function') return true;
      }) || x;

      Params = Params.contents.map((Param, i, r) => {
        if (/boolean|undefined/.test(typeof Param)) {
          return undefined;
        }

        let { expansion } = Param, cO;
        Param = Param.unwrapUntil(C => C instanceof Nodes.Expression) || Param;

        let { childComments, matchedComments } = matchComments(lastNode, comments, Param.loc);

        let Soaks = [];
        let res = Param.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isParam: true, tabs: x ? tabs + 1 : tabs, func, scopedParams, comments: childComments, lastNodeLocation: lastNode, registry, FiresSoak: Soaks });

        if (Soaks.length) {
          res = loadSoaks(res, { tabs, scope, vars, prevLine, Soaks, registry, loc: Param.loc })
        }

        lastNode = Param.loc;

        if (expansion) res = `...${res}`;

        if (matchedComments.length) {
          for (let comment of matchedComments) {
            if (registry[comment.id]) continue;
            x = true;
            let separator = "";

            if (comment.loc.first_line > lastNode.last_line) separator = "\n" + tab(registry.tabSize, tabs + 1)

            cO = separator + parseComment(comment, tabs + 1, true, registry);
            res = `${cO}${res}`
            registry[comment.id] = true;
          }
        } else if (r[i - 1] === false || (i !== 0 && r[i - 1] === undefined)) {
          res = `\n${tab(registry.tabSize, tabs + 1) + res}`;
        }

        return res;
      }).filter(t => t !== undefined);
    } else {
      Params = [];
    }

    ll = Params.length

    let ParamsOutput = Params.join(', '), b, AfterComments = "", StringOutput = templ && Arguments.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue, tabs, lineReturns, func, scopedParams, comments, lastNodeLocation, registry, FiresSuper, forceBacktick: true });

    for (let comment of comments.filter(c => c.loc.first_line >= lastNode.last_line)) {
      if (registry[comment.id]) continue;
      x = true;
      let commentOutput = parseComment(comment, tabs, true, registry);
      if (comment.loc.first_line == lastNode.last_line) {
        let resource = AfterComments, trim = 0;
        while (/\n|\r| /.test(resource.charAt(resource.length - 1))) {
          resource = resource.slice(0, -1);
          trim++;
        }

        AfterComments = resource + " " + commentOutput
      } else {
        AfterComments += "\n" + tab(registry.tabSize, tabs + 1) + commentOutput
      }

      registry[comment.id] = true;
    }

    if (x && !BeforeComments && ParamsOutput.startsWith('{\n') && !(/\n\s*\}$/.test(ParamsOutput) && ll > 1)) {
      x = false;
    }

    if (x) ParamsOutput = "\n" + tab(registry.tabSize, tabs + 1) + BeforeComments + ParamsOutput + AfterComments + "\n" + tab(registry.tabSize, tabs);

    if (this.isSuper) FiresSuper.push(1);

    return Value + TypeArguments + (templ ? StringOutput : "(" + ParamsOutput + ")") + (soak ? ' : void 0' : '');
  }

  get isSuper() {
    return this[1] === "super";
  }
}

Nodes.JSX = class JSX extends Base {
  parse(opts) {
    let fragments = [], { tabSize } = opts.registry, { tabs } = opts, lastInterpolation;

    for (const Interpolation of this.unwrap[0].slice(1)) {
      if (typeof Interpolation === "number") {
        tabs += Interpolation;
        lastInterpolation = Interpolation;
        fragments.push(`\n${tab(tabSize, tabs)}`)
        continue;
      }

      if (Interpolation.rule === "String" && lastInterpolation instanceof Nodes.Interpolation && lastInterpolation.rule === "String") {
        fragments.push(`\n${tab(tabSize, tabs)}`)
      }

      fragments.push(Interpolation.parse({ ...opts, tabs, lineReturns: false, inJSX: true }));
      lastInterpolation = Interpolation;
    }

    return fragments.join('');
  }
}

Nodes.JointExpression = class JointExpression extends Base {
  parse(opts) {
    let Expressions = this.contents, output;

    output = Expressions.map(Exp => {
      return Exp.parse(opts)
    }).join(', ');

    return output;
  }
}

Nodes.Line = Nodes.ClassLine = class Line extends Base {
  parse({ that, $such, scope, constants, vars, varExistent, tabs = 0, lineReturns, isClass, isLine = true, func, scopedParams, nl, lastValue, comments = [], afterParse, metaComments = [], lastNodeLocation, registry = {}, FiresSuper = [], FiresYield = [], FiresAwait = [], assignRes = false, isParenthetical } = {}) {
    let colon = isParenthetical ? ", " : '\n\n';
    const [rule, Expression] = this;
    let output = "";
    var prevLine = [];
    output += tab(registry.tabSize, tabs) + (!!Expression.parse ? Expression.parse({ addSemicolon: (registry.isELSON || isParenthetical) ? [] : [1], that, $such, scope, constants, vars, varExistent, prevLine, tabs, lineReturns, isClass, isLine, func, scopedParams, nl, comments, lastNodeLocation, registry, FiresSuper, FiresYield, FiresAwait, assignRes, isParenthetical, isValue: !!isParenthetical, afterParse, metaComments }) : Expression);

    if (prevLine.length) output = tab(registry.tabSize, tabs) + prevLine.join(colon + tab(registry.tabSize, tabs)) + (colon === "\n\n" ? '\n' : colon) + output;
    return output
  }
}

Nodes.Literal = class Literal extends Base {
  parse({ that, $such, scope, addSemicolon, vars, varExistent, constants, lineReturns, prevLine, isCondition, isValue, tabs, wrap, isClass, isLine, isAssignment, ID, func, scopedParams, comments, lastNodeLocation, registry = {} }) {
    const [rule, Literal] = this;
    let output = "";

    switch (true) {
      case Literal instanceof Nodes.AlphaNum: {
        output = Literal.parse({ that, $such, scope, addSemicolon, vars, varExistent, constants, lineReturns, prevLine, isCondition, isValue, tabs, wrap, isClass, isLine, isAssignment, ID, func, scopedParams, comments, lastNodeLocation, registry });
      }; break;
      case Literal instanceof Nodes.Regex:
        output = Literal.parse({ that, $such, scope, addSemicolon, vars, varExistent, constants, lineReturns, prevLine, isCondition, isValue, tabs, wrap, isClass, isLine, isAssignment, ID, func, scopedParams, comments, lastNodeLocation, registry }); break;
      default: output = (registry.sources ? registry.sources.add(this.loc) : '') + Literal; break;
    }

    return output;
  }
}

Nodes.Logical = class Logical extends Nodes.Compare { }

Nodes.Object = class Object extends Base {
  parse({ that, $such, scope, addSemicolon = [], vars, varExistent, constants, prevLine, isCondition, isValue, isParam, tabs = 0, lineReturns, wrap, isClass, isAssignment, isStatement, ID = [], comments = [], lastNodeLocation, registry = {}, typeData = [], afterParse, metaComments = [] } = {}) {
    metaComments = comments.filter(c => c.jsdoc);
    let output = "";
    output += '{';
    let Object = this;
    let Assignments = [];
    let lastNode = Object.loc, initLoc = Object.unwrap[0] && (Object.unwrap[0][2] && Object.unwrap[0][2][0]) || lastNode, x = !isParam && Object.indented;
    Object = Object.unwrap;
    var test, BeforeComments = "";

    for (let comment of comments.filter(c => (c.loc.first_line < initLoc.first_line) || (c.loc.first_line === initLoc.first_line && c.loc.first_column < initLoc.first_column))) {
      if (registry[comment.id]) continue;
      let commentOutput = parseComment(comment, tabs + 1, true, registry);

      BeforeComments += commentOutput;

      registry[comment.id] = true;
      x = true;
    }

    for (let Obj of Object) {
      if (/boolean|undefined/.test(typeof Obj)) {
        if (!Obj) {
          x = true;
          Assignments.push(["jump", ""]);
        }
        continue;
      }

      if (!isAssignment && (Obj instanceof Nodes.Assignment)) {
        throwSyntaxError({
          message: 'Assignments not allowed in this context.',
          location: Obj.loc
        });
      } else if (isAssignment && !(Obj[1].unwrap instanceof Nodes.Value) && !(Obj instanceof Nodes.Assignment) && !(Obj[1] && Obj[1].unwrap instanceof Nodes.Assign) && Obj[1]) {
        if (!(Obj[1] instanceof Nodes.Assignable) || !(Obj[1].unwrap.unwrap instanceof Nodes.Assignment || Obj[1].unwrap.unwrap instanceof Nodes.Assignable)) {
          throwSyntaxError({
            message: 'Invalid left-hand assignment reference.',
            location: Obj[2] && Obj[2][1] || Obj.loc
          })
        }
      }

      let { childComments, matchedComments } = matchComments(lastNode, comments, Obj[2] && Obj[2][1] || Obj.loc),
        typeMatch = Obj[2] && Obj[2][0].type, Id;

      let it = "", cO = "", LH, RH, qt;
      if (Obj instanceof Nodes.Assignment) Obj = Obj.slice(1);
      LH = Obj[0];
      let metaQueue = [];
      if (LH instanceof Nodes.Expression) {
        LH = `[${LH.parse({ that, $such, scope, addSemicolon: [], vars, varExistent, constants, prevLine, isValue: true, isParam: true, tabs: tabs + 1, isAssignment, ID, comments: childComments, lastNodeLocation, registry })}]`;
      } else if (LH instanceof Nodes.AlphaNum) {
        let wrp;
        if (LH.unwrap && LH.unwrap[0] === "StringWithInterpolations") wrp = true;
        if (registry.isELSON && LH.unwrap && LH.unwrap[0] !== "STRING") qt = true;

        LH = LH.parse({ that, $such, scope, addSemicolon: [], vars, varExistent, constants, prevLine, isValue: true, isParam: true, tabs: tabs + 1, isAssignment, ID, comments: childComments, lastNodeLocation, registry });

        if (wrp) LH = `[${LH}]`;
        if (qt) {
          LH = `"${LH}"`;
        }
      } else if (registry.isELSON) {
        LH = `"${LH}"`;
      } else {
        if (isAssignment && LH.parse && !(LH[0] === "Identifier" || LH instanceof Nodes.Identifier)) {
          LH.throwSyntaxError('Unexpected left-hand assignment INSIDE another assignment')
        }

        Id = LH = LH.parse ? LH.parse({ registry }) : LH;
      }

      if (registry.sources) {
        it += registry.sources.add(Obj[2] && Obj[2][0] || Obj.loc);
      }

      if (Obj instanceof Nodes.Value) {
        if (isAssignment && !(Obj.unwrap.unwrap instanceof Nodes.Identifier)) {
          throwSyntaxError({
            message: 'Invalid left-hand assignment reference.',
            location: Obj.loc
          });
        }

        it += `...` + Obj.parse({ $such, that, scope, vars, varExistent, constants, isAssignment, isValue: true, tabs: tabs + 1 });
      } else if (Obj instanceof Nodes.Function) {
        test = x = true;
        it += new Nodes.Value("Function", Obj).parse({ tabs: tabs + 1, $such, that, scope, vars, varExistent, constants, isAssignment, isValue: true, isObject: true, func: true, comments, registry, lastNodeLocation: this.loc, metaComments });
      } else {
        it += LH;
        if (Obj[1]) {
          if ((Obj[1].rule === "Value") && ((["Function", "Code", "Class", "If", "Switch", "While", "TryBlock"].includes(Obj[1][1].rule)) || (Obj[1][1].rule === "Assignable") && (["Object", "Array"].includes(Obj[1][1][1].rule)))) {
            x = !isParam && true;
          }

          RH = Obj[1].parse({ that, $such, scope, addSemicolon: [], vars, varExistent, constants, prevLine, isValue: true, isAssigned: true, isObjProperty: true, isAssignment, tabs: tabs + 1, comments: childComments, lastNodeLocation, registry, isStatement, ID, metaComments, metaQueue });
          it += (Obj instanceof Nodes.Assignment ? " = " : ": ") + RH;
        } else {
          if (registry.isELSON) {
            this.throwSyntaxError('Value expected', Obj[2][0]);
          }
          if (Obj[3]) {
            it = `...${it}`;
          }
          ID.push([LH, Obj[2][0]]);
          Id = LH;
        }
      }

      if (test) {
        x = true;
        it = "\n" + tab(registry.tabSize, tabs + 1) + it;
      } else if (x) {
        it = "\n" + tab(registry.tabSize, tabs + 1) + it;
      }

      if (matchedComments.length) {
        for (let comment of matchedComments) {
          if (registry[comment.id]) continue;
          cO = parseComment(comment, tabs, true, registry).trim();
          Assignments.slice(-1)[0][1] += '\n' + tab(registry.tabSize, tabs + 1) + cO;
          registry[comment.id] = true;
          x = true;
        }
      }

      if (metaQueue.length) {
        for (let metaComment of metaQueue) {
          if (registry[metaComment.id]) continue;
          let mc = '\n' + tab(registry.tabSize, tabs + 1) + parseComment(metaComment, tabs, undefined, registry);

          if (Assignments.length === 0) {
            BeforeComments += mc;
          } else Assignments.slice(-1)[0][1] += mc;

          registry[metaComment.id] = true;
          x = true;
        }
      }

      lastNode = Obj[2] && Obj[2][1] || Obj.loc;
      Assignments.push([it, ""]);

      if (Id !== undefined) {
        if (!typeMatch) {
          typeMatch = getDataOfMetaComments({ metaComments, ID: Id, tabs, loc: this.loc, registry });
        } else {
          attachDescriptions(metaComments, [typeMatch], tabs, registry);
        }

        if (typeMatch) {
          typeData.push({
            ID: Id,
            kind: 'Property',
            ...typeMatch
          })
        }
      }
    }

    if (Assignments.length) {
      let AfterComments = "";
      for (let comment of comments.filter(c => c.loc.first_line >= lastNode.last_line)) {
        if (registry[comment.id]) continue;
        let commentOutput = parseComment(comment, tabs + 1, true, registry);
        AfterComments += commentOutput
        x = true;
        registry[comment.id] = true;
      }

      Assignments = Assignments.map(([a, b], i) => a === "jump" ? (x = true) && b : a + (i === Assignments.length - 1 ? "" : ",") + b + ((i == Assignments.length - 1) ? !x ? " " : "" : " ")).join("");

      if (x) output += `\n${tab(registry.tabSize, tabs + 1)}${(BeforeComments + Assignments + AfterComments).trim()}\n${tab(registry.tabSize, tabs)}`
      else output += " " + BeforeComments + Assignments + AfterComments
    }

    output += "}"

    if (3 === output.length) output = '{}';
    output = output.replace(/\n \}$/, '\n}')
    return output;
  }
}

Nodes.Operation = class Operation extends Base {
  parse({ vars, varExistent, that, $such = [], scope, constants, prevLine, isValue, isCompare, tabs = 0, lineReturns, isCondition, inverse, addSemicolon, func, scopedParams, comments = [], lastNodeLocation, registry = {}, isUnless, FiresSuper, FiresAwait = [], FiresYield = [], assignRes } = {}) {
    let output = "";
    let Operation = this.contents, { rule } = this;

    switch (rule) {
      case "DO Expression":
      case "@ Value": {
        let Soaks = [];
        let val = Operation[0].parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isInvoked: true, tabs, isCondition, func, scopedParams, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, FiresSoak: Soaks, isOperation: true });

        if (Soaks.length) {
          val = loadSoaks(val, { tabs, scope, vars, prevLine, Soaks, registry, loc: this.loc })
        }

        output += val + "()";

        break;
      };
      case "AWAIT Expression":
      case "AWAIT INDENT Expression OUTDENT": {
        FiresAwait.push({ ...Operation.loc, last_column: Operation.loc.first_column + 5, last_line: Operation.loc.first_line });
        output += "await ";
        output += Operation[0].parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isInvoked: true, tabs, isCondition, func, scopedParams, comments, lastNodeLocation, registry, FiresSuper, FiresYield });
        break;
      };
      case "YIELD Expression":
      case "YIELD INDENT Expression OUTDENT": {
        FiresYield.push({ ...this.loc, last_line: this.loc.first_line, last_column: this.loc.first_column + 5 });
        output += "yield ";
        output += Operation[0].parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isInvoked: true, tabs, isCondition, func, scopedParams, comments, lastNodeLocation, registry, FiresSuper, FiresYield });
        break;
      };
      case "WHETHER Expression":
      case "TYPEOF Expression":
      case "VOID Expression":
      case "VOID INDENT Expression OUTDENT": {
        if ((rule.split(' ')[0] == "WHETHER") && !isCompare) output += "!!";
        if (rule.split(' ')[0] == "TYPEOF") output += "typeof ";
        if (rule.split(' ')[0] == "VOID") output += "void ";

        Operation = Operation[0];
        output += Operation.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isOperation: true, tabs, isCondition, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield });
        break;
      };
      case "Expression INCLUDES Expression": {
        output += Operation[0].parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isOperation: true, isInvoked: true, tabs, lineReturns, isCondition, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield });
        output += `.includes(${Operation[1].parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isOperation: true, tabs, lineReturns, isCondition, isParam: true, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield })})`
        break;
      };
      case "MathPrefix Expression":
      case "Expression MathPostfix": {
        let Soaks = [], operand;
        output += Operation.map(E => {
          if (E instanceof Nodes.Expression) {
            return E.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isOperation: true, tabs, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, isOperation: true, FiresSoak: Soaks });
          } else {
            return operand = E[0].replace(/NOT/, "!")
          }
        }).join('');

        if (Soaks.length) {
          output = loadSoaks(output, { tabs, scope, vars, prevLine, Soaks, registry, loc: this.loc })
        }

        break;
      };
      case "Expression MATH_BIN Expression":
      case "Expression Compare Expression":
      case "Expression Logical Expression": {
        let Soaks = [];
        let o1 = Operation[0].parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isOperation: true, tabs, isCondition, isCompare: true, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, FiresSoak: Soaks });

        if (Soaks.length) {
          o1 = loadSoaks(o1, { tabs, scope, vars, prevLine, Soaks, registry, loc: Operation[0].loc })
        }

        output += o1;

        let operand = !Operation[1].operand ? Operation[1] : isUnless ? Operation[1].inverse : Operation[1].operand
        output += " " + operand + " ";

        Soaks = [];
        let RH = Operation[2].parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isOperation: true, tabs, isCondition, comments, lastNodeLocation: Operation[0].loc, registry, isUnless: isUnless && Operation[2].unwrap && (Operation[2].unwrap instanceof Nodes.Operation), FiresSuper, FiresAwait, FiresYield, FiresSoak: Soaks });

        if (Soaks.length) {
          RH = loadSoaks(RH, { tabs, scope, vars, prevLine, Soaks, registry, loc: Operation[2].loc })
        }

        output += RH;
        break;
      }

      case "Expression Operator Expression": {
        output += Operation.map(E => {
          if (!E.parse) {
            return E[0].replace("PLUS", "+").replace("DIVISION", '/');
          } else {
            let Soaks = [];
            let o = E.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isOperation: true, tabs, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, FiresSoak: Soaks });

            if (Soaks.length) {
              o = loadSoaks(o, { tabs, scope, vars, prevLine, Soaks, registry, loc: E.loc })
            }

            return o;
          }
        }).join(' ')
        break;
      };

      case "Expression EXISTS":
      case "Expression SYMBOL_EXISTS": {
        let isWordy = (Operation[0].rule === "Value") && (Operation[0][1][0] === "Assignable") && (Operation[0][1][1].rule === "Identifier"), content = Operation[0].parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isOperation: true, tabs, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield }), operand = isUnless ? "===" : "!==";

        if (!isWordy) {
          let refVar = Letter(scope, 'r');
          vars.push(refVar);
          scope.push(refVar);
          $such[0] = refVar;
          output += `(${refVar} = ${content}) && typeof ${refVar} ${operand} "undefined"`;
        } else {
          output += `typeof ${content} ${operand} "undefined"`
        }
        break;
      };
      case "Multicondition":
      case "Expression Multicheck": {
        let [Exp, [Combination, Clauses]] = Operation;
        let Content = Exp;
        let isWordy = Exp === null ? true : (Exp.rule === "Value") && (Exp[1][0] === "Assignable") && (Exp[1][1].rule === "Identifier"),
          checking;

        if (!isWordy) {
          let refVar = Letter(scope, 'r');
          vars.push(refVar);
          scope.push(refVar);
          $such[0] = refVar;
          checking = refVar;
          let content = Content.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isOperation: true, tabs, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield });
          prevLine.push(`${registry.sources && registry.sources.add(Operation.loc) || ''}${refVar} = ${content};`);
        } else if (Content !== null) {
          checking = () => {
            return Content.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isOperation: true, tabs, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield });
          }
        }

        let ParsedClauses = [];

        for (let Cls of Clauses.contents) {
          let final = (Cls.contents.length > 1 ? '(' : '') + Cls.contents.map(Clause => {
            let [Exp, Operator] = Clause;

            if (Operator && Content === null) {
              throwSyntaxError({
                message: 'Unexpected ' + Operator.operand,
                location: Operator.loc
              })
            }

            let def = new Nodes.Compare('===').setLoc(this.loc);

            let ss = Operator && Operator.operand || def.operand;


            Operator = (Operator || def);

            Operator = isUnless ? Operator.inverse : Operator.operand

            let pushed = Exp.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isOperation: true, isCompare: true, tabs, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield });

            if (typeof checking === "function") {
              pushed = `(${checking()} ${Operator} ${pushed})`
            } else if (typeof checking === "string") {
              pushed = `(${checking} ${Operator} ${pushed})`
            } else {
              pushed = `(${pushed})`
            }

            if (isUnless && (!ss || Operator === ss)) {
              pushed = `!${pushed}`
            }

            return pushed;
          }).join(' && ') + (Cls.contents.length > 1 ? ')' : '')

          ParsedClauses.push(final);
        }

        output += ParsedClauses.join(isUnless ? ' && ' : ' || ');
        break;
      };
      case "Expression CHAIN Expression":
      case "Expression CHAIN Block": {
        let Soaks = [];
        if (Operation[1] instanceof Nodes.Block) {
          let refV = Reference(scope, false, 'ref'), ccode = "", prevL = [];
          scope.push(refV);
          vars.push(refV);

          ccode += `${refV} = ${Operation[0].parse({
            that, $such, scope, vars, varExistent, constants, prevLine: prevL, isValue: true, isAssigned: true, tabs, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield
          })};`

          if (prevL.length) {
            ccode = prevL.join(`\n${tab(registry.tabSize, tabs + 1)}`) + `\n${tab(registry.tabSize, tabs + 1)}` + ccode;
          }

          let Body = Operation[1].unwrap;
          Body.unwrap.unshift(
            new Nodes.Line("SimpleCode", [
              ccode
            ])
          );

          output += Body.parse({ constants, that, $such: [refV], scope: scope.concat(refV), isValue: true, prevLine, tabs, callSelf: true, vars, varExistent, comments, lastNodeLocation, registry });
        } else {
          output += Object.assign(new Nodes.Invocation(null, Operation[1],
            new Base(null,
              new Base(null, Operation[0]).setLoc(this.loc)
            ).setLoc(this.loc)
          ).setLoc(this.loc), {
            soak: !!Operation[2]
          }).parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue: true, isOperation: true, tabs, isCondition, isCompare: true, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield, FiresSoaks: Soaks });
        }

        break;
      }
    };
    return output;
  }

  get canInverse() {
    switch (this.rule) {
      case "Expression Compare Expression":
      case "Multicondition":
      case "Expression Multicheck":
        return true;
      default:
        return false;
    }
  }
}

Nodes.ParamIdentifier = class ParamIdentifier extends Base { };

Nodes.ParamList = class ParamList extends Base {
  addParam(Param) {
    this.push(Param);
    return this.contents;
  }

  addParams(Params) {
    for (let Param of Params) {
      this.push(Param);
    }

    return this.contents;
  }
}

Nodes.ParamObject = class ParamObject extends Base {
  defaults(Expression) {
    this[1].defaults = Expression;
    return this;
  }
}

Nodes.ParamPropObj = class ParamPropObj extends Base { };

Nodes.Regex = class Regex extends Base {
  parse(opts) {
    switch (this.rule) {
      case "RegexWithInterpolations":
        return this.parseWithInterpolations(opts);
      case "REGEX":
        return this[1].replace(/\n/g, '\\n');
    }
  }

  parseWithInterpolations(opts) {
    let fragments = "", flags = this.unwrap[2];
    for (const Interpolation of this.unwrap[1].contents) {
      fragments += Interpolation.parse(opts);
    }

    return `new RegExp(\`${flags ? fragments.slice(0, -1) : fragments}${flags ? `\`, '${flags}'` : "`"})`
  }
}

Nodes.RegexInterpolation = class Interpolation extends Base {
  parse(opts) {
    switch (this.rule) {
      case "Regex": {
        return this.unwrap.parse(opts);
      };
      default: {
        let int = this.unwrap.parse({ ...opts, addSemicolon: [], isValue: true });
        return `\${${int}}`;
      }
    }
  }
}

Nodes.Root = class Root extends Base {
  parse(opts = {}) {
    let output = "";
    const Body = this.unwrap;

    if (opts.registry && opts.registry.isELSON && Body.unwrap.length > 1) {
      Body[1] = [
        new Nodes.Line('Expression',
          Nodes.Array.from(Body)
        ).setLoc(Body.loc)
      ]
    }
    if (Body !== 'EMPTY') output += Body.parse({ ...opts, tabs: opts.wrapSafe ? 1 : 0, top: 1 });
    else output += "// You should write some code below!";
    if (opts.wrapSafe) {
      output = `(function() {\n${output}\n})()`;
    }
    return output;
  }
}

Nodes.Statement = class Statement extends Base {
  parse({ addSemicolon = [], construct, constants, vars, varExistent, that, $such, scope = [], isValue, isInvoked, isOperation, isLine, prevLine, tabs = 0, isCondition, isDirect, isClass, isCompare, isAssignment, ID, isParam, nl, func, scopedParams, comments = [], lastNodeLocation, registry = {}, isParenthetical, FiresSuper, FiresAwait, FiresYield, afterParse = [], metaComments = [] } = {}) {
    var Expression = this.unwrap;
    let output = "";
    if (isParenthetical) {
      this.throwSyntaxError('Cannot use statements in this context.')
    }

    if (registry.sources) output += registry.sources.add(this.loc);

    switch (this.rule) {
      case "Type": {
        if (registry.omitTypeScript) return "";

        registry.isTypeScript = true;

        let build = [],
          [member, sentences] = Expression[1].contents;

        member = member.parse();
        let chunk = `type ${member} = `;

        if (Expression[1].rule.includes('OUTDENT')) {
          tabs++;
          chunk += `\n${tab(registry.tabSize, tabs)}`;
        }

        chunk += sentences.parse({ tabs, addSemicolon, that, $such, scope, constants, vars, varExistent, prevLine, isClass, isLine, func, scopedParams, nl, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, isValue: true });

        output += chunk;

        break;
      };
      case "Interface": {
        if (registry.omitTypeScript) return "";

        let [iName, iTags, iBody, iExtends] = Expression.contents;

        output += `interface ${iName.parse({ registry })}`;

        if (iTags[0]) {
          output += `<${iTags.unwrap.parse({ registry })}>`;
        }

        if (iExtends && iExtends[0]) {
          let Extends = iExtends.contents;
          output += ` extends ${Extends.map((e) => {
            let [eName, eTags] = e.contents;

            return eName.parse({ registry }) + (eTags ? `<${eTags.parse({ registry })}>` : '')
          }).join(', ')}`
        }

        let oBody = [];

        for (let iProp of iBody.unwrap) {
          let optional, [propName, propValue, extra = {}] = iProp.contents;


          if (propValue && !propValue.parse && propValue.nodes) {
            if (propValue.optional) optional = true;
            propValue = propValue.nodes;
          }

          let res = "";
          if (extra.readonly) res += 'readonly ';
          if (extra.getter) res += 'get ';
          if (extra.setter) res += 'set ';

          if (propName) {
            if (!extra.indexed) {
              res += `${propName.parse({ registry })}`;
            } else {
              res += `[${propName.parse({ registry })}${propName.loc.type ? ': ' + propName.loc.type.nodes.parse({ registry }) : ''}]`
            }
          }

          if (extra.params) {
            let { params } = extra;
            let Par = "(", ParsedParams = [];
            let Params = params.unwrap instanceof Nodes.ParamList ? params.unwrap.contents : [];

            for (let Parameter of Params) {
              ParsedParams.push(ParseParam(Parameter.unwrap, { registry }));
            }

            Par += ParsedParams.join(', ') + ")";

            res += Par;
          }

          if (propValue) {
            if (!optional && propValue.optional) optional = true;

            propValue.indented = iProp.tokens && iProp.tokens.INDENT && iProp.tokens.INDENT.length;

            res += `${(optional && !extra.indexed && !extra.getter && !extra.setter && !extra.params) ? '?' : ''}: ${propValue.parse({ registry })}`;
          }

          res += ";";
          oBody.push(res);
        }

        oBody = oBody.join(`\n${tab(registry.tabSize, tabs + 1)}`);

        if (oBody) output += ` {\n${tab(registry.tabSize, tabs + 1)}${oBody}\n${tab(registry.tabSize, tabs)}}`
        else output += ` {}`;

        break;
      };
      case "Return": {
        output += "return";
        if (Expression.rule === "RETURN INDENT Body OUTDENT") {
          output += " " + Expression.unwrap.parse({ scope, constants, vars, varExistent, prevLine, tabs, scopedParams, nl, comments, lastNodeLocation, registry, callSelf: true });
        } else if (Expression.unwrap) {
          output += " " + Expression.unwrap.parse({ addSemicolon, that, $such, scope, constants, vars, varExistent, prevLine, tabs, isClass, isLine, func, scopedParams, nl, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, isValue: true });
        }
        break;
      };
      case "BREAK Identifier":
      case "CONTINUE Identifier": {
        output += this.rule.split(' ')[0].toLowerCase() + ' ' + Expression.parse({ registry });
        break;
      };
      case "Import": {
        let { _imports: ImportList, _from: Module, _default: prevDefault } = this.unwraps(2);


        let isAll = ImportList && ImportList._isAll;
        ImportList = ImportList && ImportList.unwrap;

        output += "import ";
        if (prevDefault) output += `${prevDefault.parse({ registry })}`;
        if (isAll) output += (output.length !== 7 ? ', ' : '') + "* as ";
        if (ImportList && ImportList instanceof Nodes.Identifier) {
          if (isAll) {
            output += ImportList.parse ? ImportList.parse({ registry }) : ImportList[0].parse({ registry });
          } else {
            output += `, { ${ImportList.parse ? ImportList.parse({ registry }) : ImportList[0].parse({ registry })} }`;
          }
        } else if (ImportList) {
          if (ImportList.contents.findIndex(([, n]) => !!n) === -1 || ImportList[0].length <= 3) {
            output += `, { `;
            output += ImportList.contents.map(([iname, idest, iloc], i, r) => {
              let str = iname.parse ? iname.parse({ registry }) : iname;
              if (idest) str += " as " + idest.parse({ registry });
              if (i !== r.length - 1) {
                str += ", ";
              }
              return str;
            }).join('');
            output += ` }`;
          } else {
            output += `, {\n${tab(registry.tabSize, tabs + 1)}`;
            output += ImportList.contents.map(([iname, idest, iloc], i, r) => {
              let str = iname.parse ? iname.parse({ registry }) : iname;
              if (idest) str += " as " + idest.parse({ registry });
              if (i !== r.length - 1) {
                str += ", ";
                if (idest) str += "\n";
              }
              return str;
            }).join('');
            output += `\n${tab(registry.tabSize, tabs)}}`;
          }
        }
        output += " from " + Module
        break;
      };
      case "Export": {
        let { list, declarations, defaults, exportable } = this.unwrap.unwrap;

        if (declarations) {
          output += "export " + new Nodes.Statement('Declare', declarations).setLoc(declarations.loc).parse({ ...arguments[0], addSemicolon: [] });
        } else if (defaults) {
          output += "export default " + defaults.parse({
            addSemicolon: [], that, $such, scope, constants, vars, varExistent, prevLine, tabs, comments, registry, FiresSuper, FiresAwait, FiresYield, ID, isStatement: true, isValue: true
          });
        } else if (list) {
          list;
          output += "export {" + `\n${tab(registry.tabSize, tabs + 1)}${list.unwrap.contents.map(l => {
            if (l[1]) {
              return (l[0].parse ? l[0].parse({ registry }) : l[0]) + ' as ' + l[1].parse({ registry })
            } else if (l[2]) {
              return l[0].parse({ registry }) + ' as default'
            } else {
              return l[0].parse ? l[0].parse({ registry }) : l[0];
            }
          }).join(',\n' + tab(registry.tabSize, tabs + 1))}\n${tab(registry.tabSize, tabs)}` + "}"
        } else if (exportable) {
          output += "export " + exportable.parse({
            addSemicolon: [], that, $such, scope, constants, vars, varExistent, prevLine, tabs, comments, registry, FiresSuper, FiresAwait, FiresYield, ID, isStatement: true, isValue: true,
            isExport: true
          });
        }
        break;
      };
      case "Declare": {
        let [{ keyword, statements, indented }, locs] = this.unwrap.contents;
        output += keyword[0].toLowerCase() + ' ';

        let originalTabs = tabs;

        if (statements.contents.filter(statement => /boolean|undefined/.test(typeof statement)).findIndex(statement => statement === false || statement === undefined) > -1) {
          indented = true;
        }

        if (indented) {
          tabs++;
        }

        let Statements = "", n = false, LastLoc = lastNodeLocation, outerMeta = metaComments;
        statements.contents.forEach((statement, i, r) => {
          var metaComments = outerMeta;
          if (statement && statement.loc) {
            var { metaComments: mC } = matchComments(LastLoc, comments, statement.loc);

            metaComments = [...outerMeta, ...mC];
          }

          let self = statement, isLast = i === r.length - 1;
          if (/boolean|undefined/.test(typeof self)) {
            if (!self) {
              Statements += "\n" + tab(registry.tabSize, ++tabs);
            }
            return;
          } else if (self instanceof Nodes.Assignable && (self.unwrap instanceof Nodes.Identifier)) {
            if (keyword[0] === "CONST") self.unwrap.throwSyntaxError("Missing initializer in constant declaration")
            varExistent.push(self.parse());

            var that = self.parse({ registry });
            if (self.loc.type && registry.isTypeScript && !registry.omitTypeScript) {
              that += `: ${self.loc.type.nodes.parse({ registry })}`;
            } else if (self.loc.type) {
              var prevl = [];

              addMetaDataToPrevLine({ typeData: [{ ID: self.parse({}), ...self.loc.type }], prevLine: prevl, metaComments, tabs, registry });

              prevl[prevl.length - 1] = (prevl[prevl.length - 1] !== undefined ? prevl[prevl.length - 1] + `\n${tab(registry.tabSize, originalTabs)}` : "") + `${keyword[0].toLowerCase() + ' '}${that};`

              prevLine.push(...prevl.map(l => untab(registry.tabSize, tabs, l, originalTabs)));

              Statements = Statements.replace(/,\s*(\n\s+)?$/, '') + (!isLast ? ", " : "");
              return;
            }

            Statements += that;
          } else if (self instanceof Nodes.Assignable && !(self.unwrap instanceof Nodes.Identifier)) {
            self.unwrap.throwSyntaxError('Expected identifier, got ' + self[0].toLowerCase())
          } else {
            let ID = [], prevL = [], hasTypes = [];
            let them = new Nodes.Assign("Assignment", self).setLoc(self.loc).parse({ constant: keyword[0] === "CONST", addSemicolon: [], that, $such, scope, constants, vars, varExistent, prevLine: prevL, tabs: tabs + +(n), comments, metaComments, registry, FiresSuper, FiresAwait, FiresYield, ID, isStatement: true, isValue: true, hasTypes });

            for (let [id] of ID) {
              varExistent.push(id.toString());
            }

            if (hasTypes.length && registry.omitTypeScript) {
              prevL[prevL.length - 1] = (prevL[prevL.length - 1] !== undefined ? prevL[prevL.length - 1] + `\n${tab(registry.tabSize, originalTabs)}` : "") + `${keyword[0].toLowerCase() + ' '}${them};`
              
              prevLine.push(...prevL.map(l => untab(registry.tabSize, tabs, l, originalTabs)));


              Statements = Statements.replace(/,\s*(\n\s+)?$/, '') + (!isLast ? ", " : "");
              return;
            } else {
              them = `${prevL.length ? prevL.join('\n') + `\n${tab(registry.tabSize, tabs)}` : ''}${them}`;

              Statements = Statements.replace(/\s+$/, '\n' + tab(registry.tabSize, tabs)) + them;
            }
          }

          if (!isLast) Statements += ", ";
        });

        if (!Statements.length) {
          output = "";
          addSemicolon.pop();
        } else output += indented ? '\n' + tab(registry.tabSize, tabs) + Statements : Statements;
        break;
      };
      case "THROW Expression":
      case "THROW INDENT Expression OUTDENT": {
        output += `throw ${this.unwrap.parse({ addSemicolon, that, $such, scope, constants, vars, varExistent, prevLine, tabs, isClass, isLine, func, scopedParams, nl, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield })}`
        break;
      };
      case "DELETE Expression": {
        output += `delete ${this.unwrap.parse({ addSemicolon, that, $such, scope, constants, vars, varExistent, prevLine, tabs, isClass, isLine, func, scopedParams, nl, comments, lastNodeLocation, registry, FiresSuper, FiresAwait, FiresYield })}`
        break;
      };
      default: {
        output += this.rule.toLowerCase();
        break;
      }
    }

    if (addSemicolon.length) output += ";"

    return output;
  }
}

Nodes.String = class String extends Base {
  parse(opts) {
    switch (this.rule) {
      case "StringWithInterpolations":
        return this.parseWithInterpolations(opts);
      case "STRING":
        if (opts.registry && opts.registry.isELSON) this[1] = this[1].replace(/^['`]/, '"').replace(/['`]$/, '"')
        if (opts.forceBacktick) this[1] = this[1].replace(/^['"]/, '`').replace(/['"]$/, '`');
        return this[1].replace(/\n/g, opts.inJSX ? '\n' : '\\n');
    }
  }

  parseWithInterpolations(opts) {
    let fragments = "";
    for (const Interpolation of this.unwrap[1].contents) {
      fragments += Interpolation.parse({ ...opts, lineReturns: false });
    }

    return `\`${fragments}\``
  }
}

Nodes.Switch = class Switch extends Base {
  parse({ that, $such, assignRes, lineReturns, scope, vars, varExistent, constants, registry = {}, FiresSuper, prevLine, tabs }) {
    let [Expression, Cases] = this.contents, refVar, output = "", hasCondition;

    if (Expression) {
      refVar = Letter(scope, 'j');
      vars.push(refVar);
      scope.push(refVar);
      prevLine.push(`${registry.sources ? registry.sources.add(Expression.loc) : ''}${refVar} = ${Expression.parse({ that, $such, scope, addSemicolon: [], vars, varExistent, constants, registry, FiresSuper, prevLine, isValue: true, isAssigned: true, isCondition: true })};`);
      hasCondition = true;
    }

    output += `switch (true) {\n` + tab(registry.tabSize, tabs);

    let i = 0;
    for (let [rule, cases, Body] of Cases.contents) {
      let whens;
      if (rule.includes('Multicondition')) cases = cases.unwrap.unwrap;

      let Clauses = cases ? cases.contents : false;
      if (rule === "BREAK") {
        output += "break";
        if (i !== Cases.contents.length - 1) {
          output += `;\n${tab(registry.tabSize, tabs)}`;
        }

        i++;
        continue;
      } else if (!Clauses) {
        whens = `default:`;
      } else {
        whens = Clauses.map((cls) => {
          let output = 'case ';

          output += (hasCondition ? '' : '!!') + (cls.length > 1 ? '(' : '') + cls.slice(+/Multicondition|POSTCASE/.test(rule)).map(cl => {
            let [exp, compare] = cl;

            if (compare && !hasCondition) {
              this.throwSyntaxError('Unexpected ' + compare.operand, compare.loc)
            }

            let $$such = [refVar];
            exp = exp.parse({ that, $such: hasCondition ? $$such : $such, scope, vars, varExistent, constants, registry, FiresSuper, prevLine, tabs, isValue: true, isCondition: hasCondition, addSemicolon: [] });

            return hasCondition ? $$such.active ? exp : `${refVar} ${compare ? compare.operand : '==='} ${exp}` : exp
          }).join(`) && ${hasCondition ? '' : '!!'}(`) + (cls.length > 1 ? ')' : '')

          return output + ':';
        }).join(`\n${tab(registry.tabSize, tabs)}`);
      }

      output += whens;

      output += ` {\n${tab(registry.tabSize, tabs + 1)}` + Body.parse({ that, $such: hasCondition ? [refVar] : $such, assignRes, lineReturns, scope, vars, varExistent, constants, registry, FiresSuper, prevLine, tabs: tabs + 1, isChildren: true }) + (Body.rule === null ? `\n${tab(registry.tabSize, tabs + 1)}break;` : '') + `\n${tab(registry.tabSize, tabs)}}`;

      if (i !== Cases.contents.length - 1) {
        output += `;\n${tab(registry.tabSize, tabs)}`;
      }

      i++;
    }

    output += `\n${tab(registry.tabSize, tabs - 1)}}`;

    return output;
  }
}

Nodes.Value = class Value extends Base {
  parse({ that, $such, scope, addSemicolon = [], vars, varExistent, constants, prevLine, isCondition, isValue, isLine, tabs = 0, lineReturns, wrap, isClass, isAssignment, ID, isParam, func, scopedParams, isCompare, isStatement, inverse, isDirect, isAssigned, comments = [], lastNodeLocation, registry = {}, FiresSuper = [], FiresAwait = [], FiresYield = [], isObject, FiresSoak, isOperation, isInvoked, isNarrow, isObjProperty, metaComments = [], metaQueue, NoPrint = false } = {}) {
    var output = "";
    let { rule } = this, Value = this.unwrap;
    switch (rule) {
      case 'Assignable': {
        if (isValue && !isAssignment && !isParam && !isAssigned && !isCompare && !isOperation && !registry.isELSON && Value.rule === "Object") wrap = true;

        output += Value.parse({ that, $such, scope, addSemicolon, vars, varExistent, constants, lineReturns, prevLine, isCondition, isValue, tabs, wrap, isClass, isLine, isAssignment, lineReturns, ID, func, scopedParams, comments, lastNodeLocation, registry, isParam, FiresSoak, isOperation, isInvoked, isCondition, isStatement, isNarrow, isObjProperty });
        break;
      };
      case 'TypeGeneric': {
        break;
      };
      case 'Literal': {
        return Value.parse({ that, $such, scope, addSemicolon, vars, varExistent, constants, lineReturns, prevLine, isCondition, isValue, tabs, wrap, isClass, isLine, isAssignment, lineReturns, func, scopedParams, comments, lastNodeLocation, registry, FiresSoak })
        break;
      };
      case 'Module': {
        output += Value.parse({ registry });
        break;
      };
      case 'Parenthetical': {
        wrap = true;
        Value = Value.unwrap;

        if (Value instanceof Nodes.Expression) {
          output += Value.parse({ vars, varExistent, that, $such, scope, constants, prevLine, isValue: true, isCompare, tabs, isCondition, inverse, addSemicolon: [], comments, lastNodeLocation, registry, FiresSoak, isInvoked });

          if (isCondition && isDirect) wrap = false;
          else isValue = true;
        } else {
          output += Value.parse({ vars, varExistent, that, $such, scope, constants, prevLine, isValue: true, isCompare, tabs, isCondition, inverse, addSemicolon: [], comments, lastNodeLocation, registry, isChildren: true, isParenthetical: true, FiresSoak, isInvoked });
          if (isCondition && isDirect) wrap = false;
          else isValue = true;
        }
        break;
      };
      case "Invocation": {
        output += Value.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue, tabs, func, scopedParams, comments, lastNodeLocation, registry, FiresSuper, FiresSoak, isInvoked, isParam, isObjProperty, NoPrint });
        break;
      };
      case "Function": {
        addSemicolon.pop();
        if (isInvoked) wrap = true;
        output += Value.parse({ that, $such, scope, vars, varExistent, constants, prevLine, isValue, tabs, func, scopedParams, comments, lastNodeLocation, registry, FiresSuper, isInvoked, isParam, isClass, isObject, lineReturns, isLine, metaComments, metaQueue });
        break;
      };
      case "This": {
        output = (that && that[0]) || "this";
        if (registry.sources) {
          output = registry.sources.add(Value.loc) + output;
        }
        return output;
        break;
      };
      case "SUCH": {
        if (!$such || !$such.length) {
          if (func && scopedParams && !scopedParams.generated && !scopedParams.length) {
            $such = [Letter(scope, 'p')];
            scopedParams.push($such[0]);

            return (registry.sources ? registry.sources.add(this.loc, 'such') : '') + $such[0]
          } else if (func && scopedParams && !scopedParams.generated && !!scopedParams.length) {
            $such = [scopedParams[0]];
            return (registry.sources ? registry.sources.add(this.loc, 'such') : '') + $such[0]
          } else {
            return (registry.sources ? registry.sources.add(this.loc, 'such') : '') + ((that && that[0]) || "this");
          }
        } else {
          $such.active = true;
          return (registry.sources ? registry.sources.add(this.loc, 'such') : '') + $such[0];
        }
        break;
      };
      case "New": {
        output += Value[1].setLoc(this.loc).parse({ vars, varExistent, isValue: true, constants, that, $such, scope, prevLine, tabs, func, scopedParams, isInvoked: true, construct: true, comments, lastNodeLocation, registry });
        break;
      }
    }

    if (isValue && wrap) {
      output = '(' + output + ')'
    }

    return output;
  }
};

Nodes.TypeObject = class TypeObject extends Base {
  parse({ registry = {}, tabs = 0 } = {}) {
    let items = [], props = this.contents;

    for (let prop of props) {
      if (typeof prop === "number") {
        continue;
      }

      let [, name, value, opt, options = {}] = prop, isOptional = [];
      if (opt) isOptional.push(1);

      if (name instanceof Nodes.Identifier) {
        name = name.parse({ registry });
      }

      if (options.isDynamicKey) {
        if (!options.keyType) {
          prop[1].throwSyntaxError('Missing type annotation for this name');
        }
        name = `[${name}: ${options.keyType.nodes.parse({ registry })}]`
      }

      if (!value) {
        value = 'any'
      } else {
        value = value.parse({ isOptional, isChildren: true, registry });
      }

      items.push(`${registry.sources ? registry.sources.add(prop.loc) : ''}${name}${isOptional.length ? '?' : ''}: ${value}`);
    }

    return `{ ${items.join(', ')} }`;
  }
}

Nodes.TypeArray = class TypeArray extends Base {
  parse({ registry = {} } = {}) {
    let items = [], props = this.contents;

    for (let prop of props) {
      if (typeof prop !== 'object') continue; // I will add line formatting later.
      let value = prop.parse({ isChildren: true, registry });

      items.push((registry.sources ? registry.sources.add(prop.loc) : '') + value);
    }

    return `[ ${items.join(', ')} ]`;
  }
}

Nodes.InlineType = Nodes.TypeSentence = class TypeSentence extends Base {
  parse({ isOptional = [], isChildren = false, registry = {}, tabs = 0 } = {}) {
    let sentences = this.contents, { tabSize } = registry, items = [], seemsLikeAligned = typeof sentences[0] === "string";

    let lastSentence, i = 0;
    for (let sentence of sentences) {
      i++;
      if (typeof sentence === "string") {
        if (typeof lastSentence !== 'number') {
          items.push(` ${sentence}`);
        } else {
          items.push(sentence);
        }

        lastSentence = sentence;
      } else if (typeof sentence === "number") {
        tabs += sentence;
        if (i > 1) {
          items.push(`\n${tab(registry.tabSize, tabs)}`);
        }
        lastSentence = sentence;
      } else {
        let it;

        if (sentence.rule === "TAG") {
          it = sentence[1].nodes.parse({ isOptional, isChildren, registry });

          if (sentence[1].isArray) {
            it = `Array<${it}>`;
          }

          if (sentence[1].optional) {
            isOptional.push(1);
          }
        } else {
          if (sentence.unwrap.rule === "Regex") {
            this.throwSyntaxError('not a valid type', sentence.loc);
          }

          it = sentence.unwrap.parse ? sentence.unwrap.parse({ registry }) : sentence.parse ? sentence.parse({ registry, isOptional, isChildren }) : sentence.unwrap;
        }

        if (lastSentence !== undefined && typeof lastSentence !== 'number') {
          items.push(` ${it}`);
        } else {
          items.push(it);
        }

        lastSentence = sentence;
      }
    }

    if (isOptional.length && !isChildren && !items.includes('undefined') && !items.includes('any')) {
      items.push('|', 'undefined');
    }

    return items.join('');
  }
}

Nodes.TypeWithArguments = class TypeWithArguments extends Base {
  parse({ isChildren, isOptional = [], registry }) {
    let { isArray, type, arguments: args } = this.unwrap, output = "";

    if (isArray) {
      let value = type instanceof Nodes.TypeSentence ? `(${type.parse({ isChildren, isOptional, registry })})` : new Nodes.TypeSentence(null, type).parse({ isChildren, isOptional, registry });

      return value += "[]";
    } else {
      let value = type.parse(), $args = args.parse({ isChildren, isOptional, registry });

      return `${value}<${$args}>`;
    }
  }
}

Nodes.TypeArguments = class TypeArguments extends Base {
  parse({ registry }) {
    let output = "", args = this.contents;
    output += args.map((arg) => {
      if (arg.rule === "Identifier") {
        return arg.unwrap.parse({ registry });
      }
    }).join(', ');

    return output;
  }
}

Nodes.TypeFunction = class TypeFunction extends Base {
  parse({ registry }) {
    let [params, value, $new] = this.contents;

    let Par = ($new ? 'new ' : '') + "(", ParsedParams = [];
    let Params = params.unwrap instanceof Nodes.ParamList ? params.unwrap.contents : [];

    for (let Parameter of Params) {
      ParsedParams.push(ParseParam(Parameter.unwrap, { registry }));
    }

    Par += ParsedParams.join(', ');

    Par += ") => ";

    return Par + value.parse({ registry });
  }
}

Nodes.TypeWrapped = class TypeWrapped extends Base {
  parse({ registry, isChildren, isOptional }) {
    return `(${this.unwrap.parse({ registry, isChildren, isOptional })})`;
  }
}

Nodes.TypeofKeyof = class TypeofKeyof extends Base {
  parse({ registry, isChildren, isOptional }) {
    let [Value, Keyword] = this.contents;
    return `${Keyword} ` + Value.parse({ registry, isChildren, isOptional });
  }
}

Nodes.TypeAccess = class TypeAccess extends Base {
  parse({ registry, isChildren, isOptional }) {
    let [Value, Access] = this.contents;
    let ParsedAccess = Access instanceof Nodes.String ? `[${Access.parse({ registry })}]` : `[${Access.parse({ registry, isOptional, isChildren })}]`

    return Value.parse({ registry, isChildren, isOptional }) + ParsedAccess;
  }
}

Nodes.TypeValue = class TypeValue extends Base {
  parse({ registry, isChildren, isOptional }) {
    let Value = this;

    return Value.unwrap && Value.unwrap.parse && Value.unwrap.parse({ registry, isChildren, isOptional }) || Value.unwrap;
  }
}

function tab(size = 2, many = 0) {
  return " ".repeat(Math.max(2, size)).repeat(Math.max(0, many));
}

function untab(size, many, chunk, replace) {
  return chunk.replace(new RegExp(`\\n(${" ".repeat(size)}){${many},}`, 'gm'), '\n' + tab(size, replace));
}

function Reference(scope = [], underscore = false, label = "ref") {
  let count = 0, final;
  while (scope.includes((underscore ? "_" : "") + label + (count ? count : ""))) {
    count++;
  }
  return (underscore ? "_" : "") + (count ? label + count : label);
}

function Letter(scope = [], offset = "a") {
  let letters = "abcdefghijklmnopqrstuvwxyz";
  letters += letters.toUpperCase();

  let letter, count = 0;
  letters = letters.slice(letters.indexOf(offset));
  while (true) {
    for (letter of letters.split('')) {
      if (!scope.includes('_' + letter + (count ? count : ''))) {
        return '_' + letter + (count ? count : '');
      }
    }
    count++;
  }
}

function lookupExpression(Exp, Rule, direct) {
  let val = Exp, i = 0;

  while ((val[0] !== Rule)) {
    if ((i == 2) && direct) return false;
    try {
      val = ((val[1].length === 1) && Array.isArray(val[1][0])) ? val[1][0] : val[1];

      if ((val.length === 1) && Array.isArray(val[0])) val = val[0];

      i++;

      if ((val.length === 0) || typeof val[0] !== "string") {
        return false;
      }
    } catch (e) {
      return false;
    }
  }

  return val && val[0] === Rule;
}

function matchComments(a = { first_line: 1, first_column: 1, last_line: 1, last_column: 1 }, comments = [], b = { first_line: 1, first_column: 1, last_line: 1, last_column: 1 }) {
  let releasedComments = [], metaComments = [], matchedComments = [...comments].filter((comment, id) => {
    let bool = 0;
    let c = comment.loc;
    if (c.last_line === b.first_line && c.last_column <= b.first_column) bool++
    else if (c.last_line < b.first_line) bool++;

    if (bool === 1) {
      if (c.first_line > a.last_line) {
        bool++
      } else if (c.first_line === a.last_line && c.first_column >= a.last_column) {
        if (a.last_line !== 1 && a.last_column !== 1) comment.appendToLastLine = true;
        bool++;
      }
    }

    if (!comment.jsdoc && bool === 2) {
      comment._id = id;
    } else {
      releasedComments.push(comment);
      if (comment.jsdoc && (bool === 2 || c.last_line === -1)) metaComments.push(comment);
      return;
    }

    return bool === 2
  }), childComments = releasedComments.filter((comment) => {
    let bool = 0;
    let c = comment.loc;
    // If comment starting location > current node location, increase 1 directly
    if (c.first_line > b.first_line) bool++;
    // else if comment starting location == current node location, check if comment first column > current node first column 
    else if (c.first_line === b.first_line && c.first_column > b.first_column) bool++

    if (bool === 1) {
      if (c.last_line < b.last_line) bool++;
      else if (c.last_line == b.last_line && c.last_column < b.last_column) bool++;
    }

    return bool === 2;
  });

  return { releasedComments, childComments, matchedComments, metaComments };
}

function parseComment(comment, tabs, forceWrap = false, registry) {
  let commentOutput = "";
  if (!forceWrap && comment.inline) commentOutput += "// " + comment[1].trim();
  else commentOutput += "/*" + comment[1].split(/\n/g).map((c, i) => (i ? tab(registry.tabSize, tabs) : "") + c).join("\n") + "*/";
  if (!/\n +\*\/$/.test(commentOutput) && forceWrap) {
    if (!/ \*\/$/.test(commentOutput)) {
      commentOutput = commentOutput.slice(0, -2) + " */"
    }
  }
  let after = forceWrap ? tab(registry.tabSize, tabs) : "";
  commentOutput += comment.addNewlines ? "\n".repeat(comment.addNewlines) + after : forceWrap ? " " : ""
  return commentOutput;
}

function ParseParam(Parameter, { scope, vars, tabs, constants, $such, that, varExistent, Insert, InsertAll, Params = [], comments = [], lastNodeLocation, registry = {}, i, isInside, isObject, isArray, Types, ValueKey, metaComments }) {
  let output = "";
  comments = [];
  let dontAddAnyType = Parameter.dontAddAnyType;
  switch (Parameter[0]) {
    case "ParamArray": {
      Params.push({ symbol: '[' });

      var retval = ParseParamArray(Parameter[1].unwrap, { scope, vars, varExistent, tabs, constants, $such, that, varExistent, Insert, InsertAll, Params, comments, comments, lastNodeLocation, registry, i, isInside, isArray, isObject, Types, metaComments });

      Params.push({ symbol: ']' });
      return retval;
    };
    case "ParamObject": {
      Params.push({ symbol: '{', label: ValueKey, type: Parameter.loc.type && Parameter.loc.type.nodes.parse({ registry }) });

      var retval = ParseParamObject(Parameter[1].unwrap, { scope, vars, varExistent, tabs, constants, $such, that, varExistent, Insert, InsertAll, Params, comments, comments, lastNodeLocation, registry, type: !registry.omitTypeScript && Parameter[1].loc.type, isArray, isObject, Types, Loc: Parameter.loc, metaComments });

      Params.push({ symbol: '}' });

      return retval;
    };
    case "ParamIdentifier": {
      let output = "";
      let Param = Parameter[1].contents;
      let Name = Param[0], // The name for this Param
        This = !!Param[1], // Does this param store directly in 'this' object?
        Defaults = Param[2], // The param default value if none assigned
        isThis = Param[3];


      findMissingType(Parameter, { metaComments, registry, tabs, scope, ID: Name });

      if (This || InsertAll && !isThis) {
        let refName = isObject ? Name : Reference(scope, false, Name);
        // this[thisProperty] = paramName
        Insert.push([Name, refName, Param.loc, Parameter.loc.type, ValueKey]); // [thisProperty, paramName]
        Params.push([refName, Param.loc, Parameter.loc.type, Name, ValueKey]);
        output += refName;
      } else {
        if (isThis && (isInside || i !== 0)) {
          throwSyntaxError({
            message: '\'this\' must be at the start of parameters',
            location: Parameter.loc
          });
        }

        if (!isThis) Params.push([Name, Param.loc, Parameter.loc.type, , ValueKey]);
        output += Name;
      }

      if (Parameter.loc.type && !registry.omitTypeScript) {
        registry.isTypeScript = true;
        if (!isObject) {
          if (isArray) {
            Types.hasNonGenerated = true;
            Types.push((registry.sources ? registry.sources.add(merge(Parameter.loc, Parameter.loc.type.nodes.loc)) : '') + Parameter.loc.type.nodes.parse({ registry }));
          } else {
            output += `${Parameter.loc.type.optional ? '?' : ''}: ` + (registry.sources ? registry.sources.add(merge(Parameter.loc, Parameter.loc.type.nodes.loc)) : '') + Parameter.loc.type.nodes.parse({ registry });
          }
        } else {
          Types.hasNonGenerated = true;
          Types.push((registry.sources ? registry.sources.add(merge(Parameter.loc, Parameter.loc.type.nodes.loc)) : '') + (ValueKey || Name) + `${Parameter.loc.type.optional ? '?' : ''}: ` + (registry.sources ? registry.sources.add(Parameter.loc.type.nodes.loc) : '') + Parameter.loc.type.nodes.parse({ registry }));
        }
      } else if (!registry.omitTypeScript && Types) {
        if (!isObject) {
          if (isArray) {
            Types.push((registry.sources ? registry.sources.add(Parameter.loc) : '') + 'any');
          }
        } else if (!dontAddAnyType) { // flag
          Types.push((registry.sources ? registry.sources.add(Parameter.loc) : '') + (ValueKey || Name) + `: ` + 'any');
        }
      }

      if (typeof Defaults !== "undefined") {
        output += " = " + Defaults.parse({ scope, vars, varExistent, tabs, constants, $such, that, varExistent, comments, lastNodeLocation, registry, isParam: true });
      }

      if (Parameter[1].expansion) output = `...${output}`;
      if (registry.sources) output = registry.sources.add(Parameter.loc) + output;

      return output;
    }
  }

  return output;
}

function ParseParamObject(ParamObject, { scope, vars, varExistent, tabs, constants, $such, that, Insert, InsertAll, Params, comments = [], lastNodeLocation, registry = {}, type, i, isInside, isArray, Types: ParentTypes, Loc, metaComments }) {
  var output = "{",
    Types = [];
  for (var i = 0; i < ParamObject.length; i++) {
    let Entry = ParamObject[i];
    let Key = Entry[0], // let Key: String
      Value = Entry[1], // let Value: String | undefined
      Defaults = Entry[2], // let Defaults: String | undefined
      Expansion = Entry[3],
      Loc = Entry[4] || {};

    output += " " + (registry.sources ? registry.sources.add(Entry.loc || Loc) : '');
    if (Entry instanceof Nodes.ParamIdentifier) {
      output += ParseParam(new Nodes.Param("ParamIdentifier", Entry).setLoc(Entry.loc), { scope, vars, varExistent, tabs, constants, $such, that, varExistent, Insert, Params, comments, i, isInside, isObject: true, Types, registry, metaComments });
    } else {
      if (Expansion) output += "..." + (registry.sources ? registry.sources.add(Loc) : '');
      output += Key;
      if (!Value) {
        findMissingType({ loc: Loc }, { metaComments, registry, tabs, scope, ID: Key });

        Params.push([Key, Loc, Loc.type]);
      }

      if (Loc && Loc.type) {
        if (Loc.type.optional) {
          Loc.type.nodes.push('|', new Nodes.Identifier(null, 'any').setLoc({ ...Loc, last_column: Loc.first_column + 1, last_line: Loc.first_line }))
        }

        Types.push((registry.sources ? registry.sources.add(merge(Loc, Loc.type.nodes.loc)) : '') + Key + ': ' + (registry.sources ? registry.sources.add(Loc.type.nodes.loc) : '') + Loc.type.nodes.parse({ registry }));
        Types.hasNonGenerated = true;
        if (Value) {
          Value.dontAddAnyType = true;
        }
      }

      if (Value) {
        Types.Key = Key;
        Types.KeyLoc = Loc || Value.loc;
        output += ": " + (registry.sources ? registry.sources.add(Value.loc) : '') + ParseParam(Value, { scope, vars, varExistent, tabs, constants, $such, that, varExistent, Insert, InsertAll, Params, comments, isObject: true, ValueKey: Key, Types, registry, metaComments });
        Types.Key = undefined;
        Types.KeyLoc = undefined;
      }

      if (Defaults) output += " = " + Defaults.parse({ scope, vars, varExistent, tabs, constants, $such, that, varExistent, isValue: true, isParam: true, comments, i, isInside });
    }
    output += ","
  }

  if (output.charAt(output.length - 1) === ",") output = output.slice(0, -1);
  output += " }";

  if (!ParentTypes && !Types.hasNonGenerated) {
    Types = [];
  }

  if (!ParentTypes && !registry.omitTypeScript && (type || Types.length)) {
    registry.isTypeScript = true;
    output += `: `;
    var ttp = [];
    if (Types.length) {
      ttp.push(`{ ${Types.join(', ')} }`);
    }

    if (type) {
      ttp.push(type.nodes.parse({ registry }));
    }

    output += ttp.join(' & ');
  } else if (!registry.omitTypeScript && (type || Types.length)) {
    registry.isTypeScript = true;
    var hasNonGenerated = false;
    var ttp = [];
    if (Types.length) {
      hasNonGenerated = Types.hasNonGenerated;
      ttp.push(`{ ${Types.join(', ')} }`);
    }

    if (type) {
      hasNonGenerated = true;
      ttp.push(type.nodes.parse({ registry }));
    }

    ttp = ttp.join(' & ');

    if (ParentTypes.Key) {
      ttp = `${(registry.sources ? registry.sources.add(ParentTypes.KeyLoc) : '')}${ParentTypes.Key}: ${ttp}`;
    }

    ParentTypes.push(ttp);

    if (hasNonGenerated) ParentTypes.hasNonGenerated = true;
  }

  if (ParamObject.defaults) output += " = " + ParamObject.defaults.parse({ scope, vars, varExistent, tabs, constants, $such, that, varExistent, isValue: true, isParam: true, comments });

  if (3 === output.length) output = '{}';
  return output;
}

function ParseParamArray(ParamArray, { scope, vars, varExistent, tabs, constants, $such, that, Insert, InsertAll, Params, comments = [], lastNodeLocation, registry, i, isInside, Types: ParentTypes, metaComments }) {
  var output = "[",
    Types = [];

  for (let Entry of ParamArray) {
    if (Entry) {
      output += ParseParam(Entry, { scope, vars, varExistent, tabs, constants, $such, that, varExistent, Insert, InsertAll, Params, comments, i, isInside, isArray: true, Types, registry, metaComments });
    }

    output += ", ";
  }

  output = output.replace(/, $/, '');
  output += "]";

  if (!Types.hasNonGenerated) {
    Types = [];
  }

  if (Types.length && !registry.omitTypeScript) {
    registry.isTypeScript = true;

    output += `: [${Types.map(t => Array.isArray(t) ? t[0] : t).join(', ')}]`
  }

  if (ParamArray.defaults) output += " = " + ParamArray.defaults.parse({ scope, vars, varExistent, tabs, constants, $such, that, varExistent, isValue: true, isParam: true, comments, comments });

  if (3 === output.length) output = '[]';
  return output;
}

function loadSoaks(res, { tabs, scope, vars, prevLine, Soaks, registry, loc }) {
  let i = 0;
  let ss = "", _refV;
  for (let [soak] of Soaks) {
    ss += `${tab(registry.tabSize, tabs + i)}${registry.sources ? registry.sources.add(loc) : ''}if (${soak}) {\n`;
    i++;
  }

  ss += tab(registry.tabSize, tabs + i);

  _refV = Letter(scope, 's');
  scope.push(_refV);
  vars.push(_refV);
  ss += `${_refV} = ${res};`;

  for (let soak of Soaks) {
    i--;
    ss += `\n${tab(registry.tabSize, tabs + i)}}`;
  }

  prevLine.push(ss);
  return _refV
}

let $$missing = [];
for (let key in Grammar) {
  if (Nodes[key]) continue;
  Nodes[key] = Base;
  $$missing.push(key);
}

function addMetaDataToPrevLine({ typeData, prevLine, metaComments, tabs, registry }) {
  let results = [];

  attachDescriptions(metaComments, typeData, tabs, registry);

  for (let def of typeData) {
    let build = [];
    if (def.description) {
      build.push(def.description.split('\n').map(d => d.trim()).join('\n' + tab(registry.tabSize, tabs) + ' * '));
    }

    if (def.value) {
      build.push(`@type {${def.value}}`);
    }

    if (build.length) results.push(`/**\n${tab(registry.tabSize, tabs)} * ${build.join(`\n${tab(registry.tabSize, tabs)} * `)}\n${tab(registry.tabSize, tabs)} */`);
  }

  prevLine.push(...results);
  return '';
}

function buildFunctionDefinitionWithJSDoc({ ParamData, registry, tabs, loc, prevLine, scope, selectedDescription }) {
  var defs = [], refs = [];

  function $refs(noIndex) {
    return refs.map((r, i, l) => r.chunk + ((r.count !== undefined ? (noIndex && (i === l.length - 1)) ? '' : `[${r.count}]` : ''))).join('');
  }

  function $last(i = 1) {
    return refs[refs.length - i] || {};
  }

  function $isArray() {
    return typeof (refs[refs.length - 1] || {}).count === 'number';
  }

  function $isArrayRoot() {
    return refs.findIndex(r => typeof r.count === 'number') > -1;
  }

  function map(ref) {
    if (ref.isObject) {
      let res = [];
      for (var item of ref.values) {
        if (Array.isArray(item)) {
          let [key, value] = item;
          res.push(`${key}: ${value || 'any'}`)
        } else {
          res.push(item);
        }
      }

      res = '{ ' + res.join(', ') + ' }';
      if (res.length === 4) {
        res = '{ }';
      }

      if (ref.label) {
        res = `${ref.label}: ${res}`
      }

      return res;
    } else {
      return `[${ref.values.join(', ')}]`;
    }
  }

  for (let data of ParamData) {
    if (data.symbol) {
      let opts = data;
      data = data.symbol;

      if (['{', '['].includes(data)) {
        refs.push({ chunk: refs.length === 0 ? Reference(scope, false, 'param') : $isArray() ? '' : '.' + opts.label, isArray: data === '[', isObject: data === '{', count: data === '[' ? 0 : undefined, index: defs.length, values: [], label: opts.label });

        defs.push(` * @param {${data === '[' ? (opts.type || 'Array<any>') : opts.type || 'object'}} ${$refs(true)}${data === '[' ? ' -' : ''}`);
      } else {
        var last = refs.pop();
        if ($isArray()) $last().count++;
        $last().values && $last().values.push(map(last));
        if ($isArrayRoot() && defs[last.index]) {
          delete defs[last.index];
        }
      }

      continue;
    }
    var line = ' * ';

    if (!$isArrayRoot()) {
      line += `@param {${data.value || '*'}} `

      line += `${$refs() ? $refs() + ($isArray() ? '' : '.') : ''}${!$isArray() ? (data.propertyID || data.ID) : ''}`;

      if ((refs[refs.length - 1] || {}).count !== undefined) {
        refs[refs.length - 1].count++;
      }
    } else {
      line += `- \`${data.ID}\`${data.description ? ':' : ''}`;

      defs[$last().index] = defs[$last().index].replace(/@param \{(.+)\} /, function (str, val) {
        $last().values.push($last().isObject ? [data.label || data.ID, data.value || 'any'] : data.value || 'any');

        return `@param {${map($last())}} `;
      });

      $last().count++;
    }

    if (data.description) {
      line += ` ${data.description}`;
    }

    defs.push(line);
  }

  if (selectedDescription) {
    defs.unshift(' * ' + selectedDescription);
  }

  prevLine.push(`/**\n${tab(registry.tabSize, tabs)}${defs.filter(d => d !== undefined).join(`\n${tab(registry.tabSize, tabs)}`)}\n${tab(registry.tabSize, tabs)}*/`)
}

function buildVarDefinitionsWithJSDoc(typeData, tabs, keyword, metaComments, registry) {
  let results = [];

  attachDescriptions(metaComments, typeData, tabs, registry);

  for (let def of typeData) {
    let build = [];
    if (def.description) {
      build.push(def.description);
    }

    if (def.value) {
      build.push(`@type {${def.value}}`);
    }

    if (build.length) {
      results.push(`/**\n${tab(registry.tabSize, tabs)} * ${build.join(`\n${tab(registry.tabSize, tabs)} * `)}\n${tab(registry.tabSize, tabs)} */\n${tab(registry.tabSize, tabs)}${keyword}${def.ID};`);
    }
  }

  return results.length ? tab(registry.tabSize, tabs) + results.join('\n\n' + tab(registry.tabSize, tabs)) + '\n\n' : '';
}

function buildVarDefinitions(typeData, tabs, keyword, metaComments, rewrite, registry = {}) {
  let results = [];

  attachDescriptions(metaComments, typeData, tabs, registry);

  for (let def of typeData) {
    let build = [];
    if (def.description) {
      build.push(def.description);
    }

    if (build.length) {
      results.push(`/**\n${tab(registry.tabSize, tabs)} * ${build.join(`\n${tab(registry.tabSize, tabs)} * `)}\n${tab(registry.tabSize, tabs)} */\n${tab(registry.tabSize, tabs)}${keyword}${registry.sources ? registry.sources.add(def.loc) : ''}${def.ID}${def.value ? `: ${def.value}` : ''};`);
      rewrite.push(def.ID);
    }
  }

  return results.length ? tab(registry.tabSize, tabs) + results.join('\n\n' + tab(registry.tabSize, tabs)) + '\n\n' : '';
}

function attachDescriptions(metaComments = [], typeData, tabs, registry, strict) {
  let scaned = 0;

  metaComments = metaComments.filter(meta => !meta.read);

  for (var n = 0, len = metaComments.length; n < len; n++) {
    let comment = metaComments[n][1];

    let chunks = [], i = 0, sameLine = "";
    consume: while (true) {
      var { first_line: line, first_column: column } = metaComments[n].loc, noUpdateColumn = false;

      column = column + 2;

      if (!comment.charAt(i)) break consume;
      if (comment.charAt(i) === '\n') {
        noUpdateColumn = true;
        column = 0;
        line++;
        sameLine = "";
      }

      let name = /^((?:[^\x00-\x7F]|[a-z$_])(?:[^\x00-\x7F]|[a-z$_\d])*)\s*(:|-*>|[=-]+>?)/i.exec(comment.slice(i)), description;

      if (name && sameLine.trim().length === 0) {
        scaned++;
        i += name[0].length;
        let sideType;

        if (/^\s*\{/.test(comment.slice(i))) {
          let offset = i + /^\s*\{/.exec(comment.slice(i))[0].length, braces = ['{'], char, chunk = "";
          read: while (char = comment.charAt(offset)) {
            if (['{', '(', '[', '<'].includes(char)) {
              braces.push(char);
            } else if (!(char === ">" && ['-', '='].includes(comment.charAt(offset - 1))) && ['}', ')', ']', '>'].includes(char)) {
              var pair = ['{', '(', '[', '<'][['}', ')', ']', '>'].indexOf(char)];

              if (braces.pop() !== pair) {
                var fc = column + name[0].length + offset - i + 1;
                throwSyntaxError({
                  message: 'Unmatched ' + char,
                  code: comment.split('\n')[line - 1],
                  location: {
                    first_line: line,
                    first_column: fc,
                    last_column: fc + 1,
                    last_line: line
                  }
                })
              }
            }

            offset++;
            if (!braces.length) {
              break read;
            } else {
              chunk += char;
            }
          }

          var optional = chunk.endsWith('?');
          if (optional) {
            chunk = chunk.slice(0, -1);
          }

          var fc = column + name[0].length + /^\s*\{/.exec(comment.slice(i))[0].length + 1;

          i = offset;

          let nodes = (() => {
            let retv;

            try {
              retv = Relic.compile(`type PARTIAL = ${chunk}`, {
                cursor: {
                  x: fc - 13,
                  y: line
                },
                nodes: true
              }).nodes;
            } catch (_) { }

            return retv;
          })();

          if (!nodes) {
            throwSyntaxError({
              message: 'Invalid type',
              location: {
                first_column: fc,
                first_line: line,
                last_line: line,
                last_column: fc + chunk.length
              },
              type: 'SyntaxError'
            }, comment.split('\n')[line - 1]);
          }

          sideType = {
            loc: {
              first_line: line,
              first_column: fc,
              last_column: fc + chunk.length,
              last_line: line
            },
            nodes: nodes.visit(1, 1, 0, 1, 1, 1, 2),
            optional,
            value: chunk
          }
        }

        let di = /\n(?!-)/.exec(comment.slice(i));
        description = comment.slice(i, di ? i + di.index : comment.length).trim();

        description = description.split('\n').map(line => line.replace(/^-\s*/, '').trim()).join('\n' + tab(registry.tabSize, tabs) + ' * ');

        chunks.push({
          comment: metaComments[n],
          name: name[1],
          description,
          sideType,
          value: sideType && sideType.nodes.parse({ registry })
        });

        i += description.length;
      } else {
        if (!noUpdateColumn) column++;
        i++;
        sameLine += comment.charAt(i);
      }
    }

    for (let o = 0, chunkNo = chunks.length; o < chunkNo; o++) {
      let ch = chunks[o];
      let tp = typeData.find(def => def.ID === ch.name || def.ID2 === ch.name);
      if (tp) {
        ch.comment.read = true;
        tp.last_comment = ch.comment;
        tp.commentStart = ch.comment.loc.first_line;
        tp.description = ch.description.replace(/^\s*# /, '');
      }
    }
  }

  if (typeData.length === 1 && !typeData[0].description && !strict) {
    let tp = typeData[0];

    let last = metaComments[metaComments.length - 1];

    if (last && !last.read && last.loc.last_line !== -1) {
      last.read = true;
      tp.description = last[1].replace(/^\s*# /, '');
    }

    let i = metaComments.length - 1, com;
    while (com = metaComments[--i]) {
      if (com.read) break;

      if (com.loc.last_line === last.loc.last_line - 1) {
        tp.description = com[1].replace(/^\s*# /, '') + '\n' + tab(registry.tabSize, tabs) + tp.description;
        com.read = true;
        last = com;
      } else {
        break;
      }
    }
  } else if (typeData.length === 1 && typeData[0].description && strict) {
    metaComments = metaComments.slice(metaComments.findIndex(c => c.loc === typeData[0].last_comment.loc)).filter(c => !c.read);

    for (let comment of metaComments) {
      var last_comment = typeData[0].last_comment, noName = !/^\s*((?:[^\x00-\x7F]|[a-z$_])(?:[^\x00-\x7F]|[a-z$_\d])*)\s*(:|-*>|=>?)/i.test(comment[1]);

      if (noName && (comment.loc.first_line === last_comment.loc.last_line + 1)) {
        typeData[0].description += `\n${tab(registry.tabSize, tabs)} * ${comment[1].replace(/^\s*# /, '')}`;
        comment.read = true;
        typeData[0].last_comment = comment;
      } else {
        break;
      }
    }
  }
}

function getDataOfMetaComments({ metaComments = [], ID, ID2, tabs, loc, registry, strict, noUpdate }) {
  let result;
  metaComments = metaComments.filter(c => !c.read);

  for (let n = 0, len = metaComments.length; n < len; n++) {
    let comment = metaComments[n][1];

    let chunks = [], i = 0;
    consume: while (true) {
      var { first_line: line, first_column: column } = metaComments[n].loc, noUpdateColumn = false;

      column = column + 2;

      if (!comment.charAt(i)) break consume;
      if (comment.charAt(i) === '\n') {
        noUpdateColumn = true;
        column = 0;
        line++;
      }

      let name = /^((?:[^\x00-\x7F]|[a-z$_])(?:[^\x00-\x7F]|[a-z$_\d])*)\s*(:|-*>|=>?)/i.exec(comment.slice(i)), description;

      if (name) {
        i += name[0].length;
        let sideType;

        if (/^\s*\{/.test(comment.slice(i))) {
          let offset = i + /^\s*\{/.exec(comment.slice(i))[0].length, braces = ['{'], char, chunk = "";
          read: while (char = comment.charAt(offset)) {
            if (['{', '(', '[', '<'].includes(char)) {
              braces.push(char);
            } else if (['}', ')', ']', '>'].includes(char)) {
              var pair = ['{', '(', '[', '<'][['}', ')', ']', '>'].indexOf(char)];

              if (braces.pop() !== pair) {
                var fc = column + name[0].length + offset - i + 1;
                throwSyntaxError({
                  message: 'Unmatched ' + char,
                  code: comment.split('\n')[line - 1],
                  location: {
                    first_line: line,
                    first_column: fc,
                    last_column: fc + 1,
                    last_line: line
                  }
                })
              }
            }

            offset++;
            if (!braces.length) {
              break read;
            } else {
              chunk += char;
            }
          }

          var optional = chunk.endsWith('?');
          if (optional) {
            chunk = chunk.slice(0, -1);
          }

          var fc = column + name[0].length + /^\s*\{/.exec(comment.slice(i))[0].length + 1;

          i = offset;

          let nodes = (() => {
            let retv;

            try {
              retv = Relic.compile(`type PARTIAL = ${chunk}`, {
                cursor: {
                  x: fc - 13,
                  y: line
                },
                nodes: true
              }).nodes;
            } catch (_) { }

            return retv;
          })();

          if (!nodes) {
            throwSyntaxError({
              message: 'Invalid type',
              location: {
                first_column: fc,
                first_line: line,
                last_line: line,
                last_column: fc + chunk.length
              },
              type: 'SyntaxError'
            }, comment.split('\n')[line - 1]);
          }

          sideType = {
            loc: {
              first_line: line,
              first_column: fc,
              last_column: fc + chunk.length,
              last_line: line
            },
            nodes: nodes.visit(1, 1, 0, 1, 1, 1, 2),
            optional,
            value: chunk
          }
        }

        let di = /\n(?!-)/.exec(comment.slice(i));
        description = comment.slice(i, di ? i + di.index : comment.length).trim();

        description = description.split('\n').map(line => line.replace(/^-\s*/, '').trim()).join('\n' + tab(registry.tabSize, tabs) + ' * ');

        chunks.push({
          comment: metaComments[n],
          name: name[1],
          description,
          sideType,
          value: sideType && sideType.nodes.parse({ registry })
        });

        i += description.length;
      } else {
        if (!noUpdateColumn) column++;
        i++
      };
    }

    for (let o = 0, chunkNo = chunks.length; o < chunkNo; o++) {
      let ch = chunks[o];
      if (ch.name === ID || ch.name === ID2) {
        result = ch;
        if (!noUpdate) ch.comment.read = true;
      }
    }
  }

  if (!result && !strict) {
    let last = metaComments[metaComments.length - 1];

    if (last && !last.read && last.loc.last_line !== -1) {
      if (last.loc.last_line === loc.last_line && last.loc.last_column < loc.last_column || last.loc.last_line < loc.last_line) {
        result = {
          name: ID,
          description: last[1].replace(/^\s*#\s*/, '')
        }
      }
    }
  }

  return result;
}

function findMissingType(node, { metaComments, scope, tabs, registry, ID, loc = node && node.loc }) {
  if (node && node.loc && !node.loc.type) {
    var resType = getDataOfMetaComments({ metaComments, ID, loc, tabs, registry, strict: true, noUpdate: true });

    if (resType && resType.sideType) {
      node.loc.type = resType.sideType;
    }
  }
};

function merge({ first_line, first_column, ...first }, { last_line, last_column } = {}) {
  if (!last_line) ({ last_line } = first);
  if (!last_column) ({ last_column } = first);
  return { first_line, first_column, last_line, last_column, src: first.src, type: first.type };
}

export { Parser, Nodes };

if (typeof module !== "undefined" && typeof require === "function") {
  module.exports = { Parser, Nodes };
}

function print(val) {
  console.log(val);
  return val;
}