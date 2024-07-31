const grammar = {};
let wrapped = {};

let u = function (group, rules) {
    grammar[group] = [];
    for (let [rule, ...actions] of rules) {
        let options;
        grammar[group].push([
            rule,
            "$$ = " + (function () {
                let _len = (rule.length === 0 && group !== "Root") ? 0 : rule.split(" ").length;

                if (typeof actions[actions.length - 1] == "object") {
                    options = actions.pop();
                } else {
                    options = { origin: _len === 1 ? 1 : undefined }
                }

                let soak = (x) => `@${x} && @${x}`

                let actionDefault = _len > 0 ? `new yy["${group}"]("${rule}", ...[$1]).setLocation({ first_line: @1.first_line, first_column: @1.first_column, last_line: @${_len}.last_line, last_column: @${_len}.last_column, src: @1.src, type: @1.type${options.origin ? `, origin: ${soak(options.origin)}.origin` : ''} }).setTokens(${Array.from({ length: _len }).map((_, ind) => {
                    return `["${rule.split(" ")[ind]}", @${ind}]`
                }).join(', ')})` : `undefined`;

                if (!actions.length) {
                    return actions = [actionDefault];
                }

                let { first, last } = options = Object.assign({
                    first: (_len === 0 && group !== "Root") ? 0 : 1,
                    last: _len,
                    typeOf: (_len === 0 && group !== "Root") ? 0 : 1,
                    checkGenerated: false
                }, options);

                let action = actions.pop();

                if (!action) { action = actionDefault; }

                let loc = `{ first_line: ${soak(first)}.first_line, first_column: ${soak(first)}.first_column, last_line: ${soak(last)}.last_line, last_column: ${soak(last)}.last_column, src: ${soak(first)}.src${(options.typeOf === undefined || options.typeOf !== 0) ? `, type: ${soak(options.typeOf)}.type || ${soak(first)}.type` : ''}${options.origin ? `, origin: ${soak(options.origin)}.origin` : ''} }`

                actions.push(
                    typeof action === "function" ?
                        action.toString().replace(/new /g, 'new yy.').replace(/Block\.wrap\(/g, 'yy.Block.wrap(').replace(/function\s*\(\)\s*\{\s*(?:return)?(.*)\s*\}|\(\)\s*=>\s*\{?\s*(?:return)?(.*)\s*\}?/i, "$1").trim()
                        :
                        `Object.assign(new yy["${group}"]("${rule}", ...[${action}]), { rule: "${rule}", loc: ${loc} }, ${options ? JSON.stringify(Object.assign(options)) : "{}"}, { generated: ${options.checkGenerated ? `@${options.checkGenerated}.generated` : `undefined`}${options.indentOf !== undefined ? `, indented: @${options.indentOf}.indented` : ``} }).setTokens(${Array.from({ length: _len }).map((_, ind) => {
                            return `["${rule.split(" ")[ind]}", @${ind + 1}]`
                        }).join(', ')})`
                );
                return actions
            })().join(' && '),
            options || {}
        ]);
    }
}

u(`Root`, [
    [``, `'EMPTY'`],
    [`Body`]
]);

u(`Body`, [
    [`Body NEWLINE Line`, `$1.push($3)`],
    [`Body NEWLINE`],
    [`Line`, `[$1]`]
]);

u(`ClassBody`, [
    [`ClassBody NEWLINE ClassLine`, `$1.push($3)`],
    [`ClassBody NEWLINE`],
    [`ClassLine`, `[$1]`]
]);

// Overriding automatic function because I`m silly
grammar[`Body`][0][1] = grammar[`ClassBody`][0][1] = `($1[1] = [...$1[1], Object.assign($3, { lineCount: $2 })]) && Object.assign($1, { loc: { first_line: @1.first_line, last_line: @3.last_line, first_column: @1.first_column, last_column: @3.last_column } })`;
grammar[`Body`][1][1] = grammar[`ClassBody`][1][1] = `$$ = Object.assign($1[1][$1[1].length - 1], { lineCount: $2 }) && Object.assign($1, { loc: { first_line: @1.first_line, last_line: @2.last_line, first_column: @1.first_column, last_column: @2.last_column } })`;

u(`Line`, [
    [`Statement`],
    [`Expression`]
]);

u(`ClassLine`, [
    [`Statement`],
    [`Expression`],
    [`ClassFunction`]
]);

u(`Expression`, [
    [`While`],
    [`For`],
    [`Switch`],
    [`TryBlock`],
    [`Class`],
    [`Code`],
    [`Label`],
    [`Value`],
    [`JSX`],
    [`If`],
    [`Operation`],
    [`Assign`]
]);

u(`Operation`, [
    [`MathPrefix Expression`, `$1, $2`],
    [`Expression MathPostfix`, `$1, $2`],
    [`Expression Operator Expression`, `$1, $2, $3`],
    [`@ Value`, `$2`],
    [`DO Expression`, `$2`],
    [`WHETHER Expression`, `$2`],
    [`TYPEOF Expression`, `$2`],
    [`AWAIT Expression`, `$2`],
    [`AWAIT INDENT Expression OUTDENT`, `$3`],
    [`VOID Expression`, `$2`],
    [`VOID INDENT Expression OUTDENT`, `$3`],
    [`YIELD Expression`, `$2`],
    [`YIELD INDENT Expression OUTDENT`, `$3`],
    [`Expression EXISTS`, `$1`],
    [`Expression SYMBOL_EXISTS`, `$1`],
    [`Expression Compare Expression`, `$1, $2, $3`],
    [`Expression Logical Expression`, `$1, $2, $3`],
    [`Expression INCLUDES Expression`, `$1, $3`],
    [`Expression MATH_BIN Expression`, `$1, $2, $3`],
    [`Expression Multicheck`, `$1, $2.contents`],
    [`Multicondition`, `null, $1.contents`],
    [`Expression CHAIN Expression`, `$1, $3, /then\\?|\\?>/.test($2.origin || '')`],
    [`Expression CHAIN Block`, `$1, $3, /then\\?|\\?>/.test($2.origin || '')`]
]);

u(`Clause`, [
    [`Clause COMPOUND_AND Compare Expression`, `...$1.contents, [$4, $3]`],
    [`Expression`, `[$1]`],
    [`Compare Expression`, `[$2, $1]`]
]);

u(`MathPrefix`, [
    [`++`],
    [`--`],
    [`+`],
    [`-`],
    [`~`],
    [`~~`],
    [`NOT`],
    [`!`]
]);

u(`MathPostfix`, [
    [`++`],
    [`--`]
]);

u(`Operator`, [
    [`*`],
    [`**`],
    [`+`],
    [`PLUS`],
    [`-`],
    [`DIVISION`],
    [`%`],
    [`<<`],
    [`>>`],
    [`>>>`],
    [`^`]
])

u(`Compare`, [
    [`IS`],
    [`===`],
    [`ISNT`],
    [`!==`],
    [`==`],
    [`!=`],
    [`>=`],
    [`<=`],
    [`>`],
    [`<`],
    [`INSTANCEOF`]
]);

u(`Logical`, [
    [`AND`],
    [`OR`],
    [`||`],
    [`&&`],
    [`|`],
    [`&`],
    [`??`]
])

u(`Multicheck`, [
    [`MulticheckCombinations MulticheckClauses`, `$1.rule, $2`]
])

u(`Multicondition`, [
    [`EITHER MulticheckClauses`, `$1, $2`]
])

u(`MulticheckCombinations`, [
    [`IS EITHER`],
    [`ISNT EITHER`]
]);

u(`MulticheckClauses`, [
    [`MulticheckClauses EITHER_OR Clause`, `...$1.contents, $3`],
    [`Clause`, `$1`]
]);

u(`Block`, [
    [`{{ }}`, `yy.Block.wrap()`],
    [`INDENT OUTDENT`, `yy.Block.wrap()`],
    [`{{ INDENT OUTDENT }}`, `yy.Block.wrap()`],
    [`INDENT Body OUTDENT`, `$2`],
    [`{{ INDENT Body OUTDENT }}`, `$3`],
    [`{ Body }`, `$2`]
]);

u(`Code`, [
    [`FUNC_DIRECTIVE Expression`, `null, $1, $2`],
    [`WITHIN PARAM_START ParamList PARAM_END Block`, `$3, '=>', $5`],
    [`PARAM_START ParamList PARAM_END FUNC_DIRECTIVE Block`, `$2, $4, $5`],
    [`PARAM_START PARAM_END FUNC_DIRECTIVE Block`, `null, $3, $4`],
    [`PARAM_START ParamList PARAM_END FUNC_DIRECTIVE Expression`, `$2, $4, $5`],
    [`PARAM_START PARAM_END FUNC_DIRECTIVE Expression`, `null, $3, $4`],
    [`WITHIN PARAM_START ParamList PARAM_END THEN Block`, `$3, '=>', $5`],
    [`WITHIN PARAM_START ParamList PARAM_END Expression`, `$3, '=>', $5`],
    [`WITHIN PARAM_START ParamList PARAM_END THEN Expression`, `$3, '=>', $6`],
    [`WITHIN PARAM_START PARAM_END Block`, `null, '=>', $4`],
    [`WITHIN PARAM_START PARAM_END THEN Block`, `null, '=>', $5`],
    [`WITHIN PARAM_START PARAM_END Expression`, `null, '=>', $4`],
    [`WITHIN PARAM_START PARAM_END THEN Expression`, `null, '=>', $5`],
    [`WITHIN Block`, `null, '=>', $2`],
    [`ASYNC Code`, `...$2.contents`, { async: true }]
]);

u(`Label`, [
    [`USING Identifier THEN Expression`, `$2, yy.Block.wrap($4)`],
    [`USING Identifier THEN Statement`, `$2, yy.Block.wrap($4)`],
    [`USING Identifier Block`, `$2, $3`]
])

u(`Class`, [
    [`CLASS Identifier ClassConstructor? ClassImplements?`, `$2, false, false, @1.origin === "class*", $3.unwrap, $4.unwrap`, { last: 2 }],
    [`CLASS Identifier ClassConstructor? ClassImplements? ClassBlock`, `$2, false, $5[1], @1.origin === "class*", $3.unwrap, $4.unwrap`],
    [`CLASS Identifier ClassConstructor? ClassImplements? THEN ClassBlock`, `$2, false, $6[1], @1.origin === "class*", $3.unwrap, $4.unwrap`],
    [`CLASS ClassConstructor? ClassImplements? ClassBlock`, `undefined, false, $4[1], @1.origin === "class*", $2.unwrap, $3.unwrap`],
    [`CLASS ClassConstructor? ClassImplements? THEN ClassBlock`, `undefined, false, $5[1], @1.origin === "class*", $2.unwrap, $3.unwrap`],
    [`CLASS Identifier ClassConstructor? EXTENDS Value ClassImplements? ClassBlock`, `$2, $5, $7[1], @1.origin === "class*", $3.unwrap, $6.unwrap`],
    [`CLASS Identifier ClassConstructor? EXTENDS Value ClassImplements? THEN ClassBlock`, `$2, $5, $8[1], @1.origin === "class*", $3.unwrap, $6.unwrap`],
    [`CLASS ClassConstructor? EXTENDS Value ClassImplements? ClassBlock`, `undefined, $4, $6[1], @1.origin === "class*", $2.unwrap, $5.unwrap`],
    [`CLASS Identifier ClassConstructor? EXTENDS Value ClassImplements?`, `$2, $5, false, @1.origin === "class*", $3.unwrap, $6.unwrap`, { last: 5 }],
    [`CLASS ClassConstructor? EXTENDS Value ClassImplements?`, `undefined, $4,false, @1.origin === "class*", $2.unwrap, $5.unwrap`, { last: 4 }],
    [`CLASS ClassConstructor? EXTENDS Value ClassImplements? THEN ClassBlock`, `undefined, $4, $7[1], @1.origin === "class*", $2.unwrap, $5.unwrap`],
    [`CLASS ClassConstructor? ClassImplements?`, `,,,@1.origin === "class*", $2.unwrap, $3.unwrap`, { last: 1 }]
]);

u(`ClassBlock`, [
    [`{{ }}`, `yy.Block.wrap()`],
    [`INDENT OUTDENT`, `yy.Block.wrap()`],
    [`{{ INDENT OUTDENT }}`, `yy.Block.wrap()`],
    [`INDENT ClassBody OUTDENT`, `$2`],
    [`{{ INDENT ClassBody OUTDENT }}`, `$3`],
    [`{ ClassBody }`, `$2`]
]);

u(`ClassConstructor?`, [
    ['', 'undefined'],
    ['<( TypeArguments )>', '{ args: $2 }'],
    ['TypeArguments? WITH Params', '{ args: $1.unwrap, ctor: $3 }', { first: 2 }],
    ['TypeArguments? Params', '{ args: $1.unwrap, ctor: $2 }', { first: 2 }]
]);

u(`ForExpression`, [
    [`JointExpression`],
    [`Declare`]
]);

u(`JointExpression`, [
    [`Expression`],
    [`JointExpression , Expression`, `...$1.contents, $3`]
]);

u(`For`, [
    [`FOR ForExpression ; Expression ; Expression Block`, `[$2, $4, $6], $7`],
    [`FOR ForExpression ; Expression ; Expression THEN Block`, `[$2, $4, $6], $8`],
    [`FOR ForExpression ; Expression ; Expression THEN Expression`, `[$2, $4, $6], yy.Block.wrap($8)`],

    [`FOR ForExpression WHEN Expression WHILST Expression Block`, `[$2, $4, $6], $7`],
    [`FOR ForExpression WHEN Expression WHILST Expression THEN Block`, `[$2, $4, $6], $8`],
    [`FOR ForExpression WHEN Expression WHILST Expression THEN Expression`, `[$2, $4, $6], yy.Block.wrap($8)`],

    [`FOR ForAssignable FOR_OF Expression Block`, `[$2[1], $3, $4], $5, $2[2]`],
    [`FOR ForAssignable FOR_IN Expression Block`, `[$2[1], $3, $4], $5, $2[2]`],

    [`FOR ForAssignable FOR_OF Expression THEN Block`, `[$2[1], $3, $4], $6, $2[2]`],
    [`FOR ForAssignable FOR_IN Expression THEN Block`, `[$2[1], $3, $4], $6, $2[2]`],

    [`FOR ForAssignable FOR_OF Expression THEN Expression`, `[$2[1], $3, $4], yy.Block.wrap($6), $2[2]`],
    [`FOR ForAssignable FOR_IN Expression THEN Expression`, `[$2[1], $3, $4], yy.Block.wrap($6), $2[2]`],

    [`FOR Identifier , Assignable ForAny Expression THEN Expression`, `[[$2, $4], $5, $6], yy.Block.wrap($8)`],
    [`FOR Identifier , Assignable ForAny Expression THEN Block`, `[[$2, $4], $5, $6], $8`],
    [`FOR Identifier , Assignable ForAny Expression Block`, `[[$2, $4], $5, $6], $7`],

    [`FOR DeclarationKeyword Identifier , Assignable ForAny Expression THEN Expression`, `[[$3, $5], $6, $7], yy.Block.wrap($9), $2`],
    [`FOR DeclarationKeyword Identifier , Assignable ForAny Expression THEN Block`, `[[$3, $5], $6, $7], $8, $2`],
    [`FOR DeclarationKeyword Identifier , Assignable ForAny Expression Block`, `[[$3, $5], $6, $7], $8, $2`],

    [`Expression POSTFOR DeclarationKeyword Identifier , Assignable ForAny Expression`, `[[$4, $6], $7, $8], yy.Block.wrap($1), $3`],
    [`Expression POSTFOR ForAssignable FOR_OF Expression`, `[$3[1], $4, $5], yy.Block.wrap($1), $3[2]`],
    [`Expression POSTFOR ForAssignable FOR_IN Expression`, `[$3[1], $4, $5], yy.Block.wrap($1), $3[2]`],
    [`Expression POSTFOR Identifier , Assignable ForAny Expression`, `[[$3, $5], $6, $7], yy.Block.wrap($1)`]
]);

u(`ForAssignable`, [
    [`DeclarationKeyword Assignable`, `$2, $1`],
    [`Assignable`, `$1`]
]);

u(`Switch`, [
    [`SWITCH Expression INDENT Cases OUTDENT`, `$2, $4`],
    [`SWITCH INDENT Cases OUTDENT`, `false, $3`],
    [`SWITCH Expression {{ INDENT Cases OUTDENT }}`, `$2, $5`],
    [`SWITCH {{ INDENT Cases OUTDENT }}`, `false, $4`]
]);

u(`Cases`, [
    [`Case`],
    [`Cases NEWLINE Case`, `...$1.contents, $3`]
]);

u(`Case`, [
    [`Clauses THEN Expression`, `$1, yy.Block.wrap($3)`],
    [`Clauses THEN Block`, `$1, $3.unwrap`],
    [`Clauses Block`, `$1, $2.unwrap`],
    [`Multicondition THEN Expression`, `$1, yy.Block.wrap($3)`],
    [`Multicondition THEN Block`, `$1, $3.unwrap`],
    [`Multicondition Block`, `$1, $2.unwrap`],
    [`DEFAULT Expression`, `false, yy.Block.wrap($2)`],
    [`DEFAULT Block`, `false, $2.unwrap`],
    [`Expression POSTCASE MulticheckClauses`, `$3, yy.Block.wrap($1)`],
    [`BREAK`]
]);

u(`Clauses`, [
    [`When`, `$1.contents`],
    [`Clauses NEWLINE When`, `...$1.contents, $3.contents`],
    [`Clauses COMPOUND_OR When`, `...$1.contents, $3.contents`]
])

u(`When`, [
    [`CASE Clause`, `...$2.contents`],
    [`IF Clause`, `...$2.contents`],
    [`ON Clause`, `...$2.contents`],
    [`WHEN Clause`, `...$2.contents`]
]);

grammar.ForAny = [
    [`FOR_FROM`, `$$ = $1`],
    [`FOR_AT`, `$$ = $1`],
    [`FOR_AS`, `$$ = $1`]
]

u(`If`, [
    [`IfBlock`],
    [`IfBlock Else`, `$1, $2`],
    [`Expression ? BlockExpression : BlockExpression`, `new yy.IfBlock('IfBlock', $1, $3.unwrap), new yy.Else('Else', $5.unwrap)`, { quoteSyntax: true }],
    [`Expression ? BlockExpression`, `new yy.IfBlock('IfBlock', $1, $3.unwrap)`, { quoteSyntax: true }],
    [`Expression ? INDENT BlockExpression : BlockExpression OUTDENT`, `new yy.IfBlock('IfBlock', $1, $4.unwrap), new yy.Else('Else', $6.unwrap)`, { quoteSyntax: true }],
    [`Expression POSTIF Expression`, `$3, $1`, { postfix: true }],
    [`Statement POSTIF Expression`, `$3, $1`, { postfix: true, statement: true }],
    [`Expression POSTUNLESS Expression`, `$3, $1`, { postfix: true, unless: true }],
    [`Statement POSTUNLESS Expression`, `$3, $1`, { postfix: true, statement: true, unless: true }]
]);

u(`BlockExpression`, [
    [`Expression`],
    [`INDENT Expression OUTDENT`, `$2`]
]);

u(`Try`, [
    [`TRY Expression`, `yy.Block.wrap($2)`],
    [`TRY Block`, `$2`]
]);

u(`Catch`, [
    [`CATCH Block`, `null, $2`],
    [`CATCH Expression`, `null, yy.Block.wrap($2)`],
    [`CATCH Identifier Block`, `$2, $3`],
    [`CATCH Identifier THEN Block`, `$2, $4`],
    [`CATCH Identifier THEN Expression`, `$2, yy.Block.wrap($4)`]
])

u(`Finally`, [
    [`FINALLY Block`, `$2`],
    [`FINALLY Expression`, `yy.Block.wrap($2)`]
]);

u(`TryBlock`, [
    [`Try`, `$1, null, null`],
    [`Try Catch`, `$1, $2, null`],
    [`Try Catch Finally`, `$1, $2, $3`]
])

u(`Loop`, [
    [`LOOP Block`, `$2.unwrap`],
    [`LOOP Expression`, `yy.Block.wrap($2).unwrap`]
]);

u(`WhileUntil`, [
    [`WHILE`],
    [`UNTIL`],
    ['POSTWHILE'],
    ['POSTUNTIL']
]);

u(`ElseOtherwise`, [
    [`ELSE`],
    [`OTHERWISE`],
    [`OR`]
]);

u(`While`, [
    [`WhileUntil Expression THEN Block`, `$2, $4.unwrap, $1`],
    [`WhileUntil Expression THEN Expression`, `$2, yy.Block.wrap($4), $1`],
    [`WhileUntil ( Expression ) Expression`, `$3, yy.Block.wrap($5), $1`],
    [`WhileUntil Expression Block`, `$2, $3.unwrap, $1`],
    [`Loop WhileUntil Expression`, `$3, $1.unwrap, $2`],
    [`Loop NEWLINE WhileUntil Expression`, `$4, $1.unwrap, $3`],
    [`Expression WhileUntil Expression`, `$3, yy.Block.wrap($1), $2`]
]);

u(`IfUnless`, [
    [`IF`],
    [`UNLESS`]
]);

u(`Else`, [
    [`ElseOtherwise Block`, `$2`],
    [`ElseOtherwise Expression`, `$2`],
    [`ElseOtherwise Statement`, `$2`],
    [`ElseOtherwise THEN Block`, `$3`]
]);

u(`IfBlock`, [
    [`IfUnless ( Expression ) Expression`, `$3, $5, $1`],
    [`IfUnless ( Expression ) Statement`, `$3, $5, $1`],
    [`IfUnless Expression { Expression }`, `$2, $4, $1`],
    [`IfUnless Expression { Statement }`, `$2, $4, $1`],
    [`IfUnless Expression THEN Expression`, `$2, $4, $1`],
    [`IfUnless Expression THEN Statement`, `$2, $4, $1`],
    [`IfUnless Expression THEN { Expression }`, `$2, $5, $1`],
    [`IfUnless Expression THEN { Statement }`, `$2, $5, $1`],
    [`IfUnless Expression Block`, `$2, $3, $1`],
    [`IfUnless Expression THEN Block`, `$2, $4, $1`]
]);

u(`Value`, [
    [`Assignable`],
    [`Parenthetical`],
    [`Literal`],
    [`Invocation`],
    [`Function`],
    [`New`],
    [`This`],
    [`Super`],
    [`SUCH`]
]);

u(`Invocation`, [
    [`Value FUNC_EXISTS TypeArguments? Arguments`, `$1, $4, $3.unwrap`, { soak: true }],
    [`Value <( TypeArguments )> Arguments`, `$1, $5, $3.setLoc(@2, @4)`], 
    [`Value Arguments`, `$1, $2`], 
    
    [`Value FUNC_EXISTS TypeArguments? String`, `$1, $4, $3.unwrap`, { templ: true, soak: true }],
    [`Value <( TypeArguments )> String`, `$1, $5, $3.setLoc(@2, @4)`, { templ: true }], 
    [`Value String`, `$1, $2`, { templ: true }],

    [`SUPER FUNC_EXISTS Arguments`, `$1, $3`, { soak: true }],
    [`SUPER <( TypeArguments )> Arguments`, `$1, $5, $3.setLoc(@2, @4)`],
    [`SUPER Arguments`, `$1, $2`]
]);

u(`Arguments`, [
    [`CALL_START CALL_END`, `/* */`],
    [`CALL_START ArgList OptComma CALL_END`, `$2`],
    [`CALL_START INDENT ArgList OptComma OUTDENT CALL_END`, `$3`, { indented: true }]
]);

u(`ArgList`, [
    [`Arg`],
    [`ArgList , Arg`, `...$1.contents, $3`],
    [`ArgList OptComma NEWLINE Arg`, `...$1.contents, @3.generated, $4`],
    [`ArgList OptComma INDENT ArgList OptComma OUTDENT`, `...$1.contents, false, ...$4.contents`]
]);

u(`Arg`, [
    [`Expression`],
    [`... Expression`, `$2`, { expansion: true }],
    [`Expression ...`, `$1`, { expansion: true }]
]);

u(`New`, [
    [`NEW Expression`, `$2`]
]);

u(`Super`, [
    [`SUPER . PROPERTY`, `Object.assign([$3], { loc: @3 })`],
    [`SUPER INDEX_START PROPERTY INDEX_END`, `$3`]
]);

u(`This`, [
    [`THIS`]
]);

u(`Parenthetical`, [
    [`( Expression )`, `$2`],
    [`( Body )`, `$2`],
    [`( INDENT Body OUTDENT )`, `$3`]
]);

u(`OptComma`, [
    [``],
    [`,`]
]);

u(`Object`, [
    [`{ }`, `[]`],
    [`{ PropList OptComma }`, `$2`, { indentOf: 1 }],
    [`{ INDENT PropList OUTDENT }`, `$3`, { indented: true }]
]);

grammar.PropList = [
    [`PropObj`, `$$ = [$1]`],
    [`PropList , PropObj`, `$$ = $1.push($3) && $1`],
    [`PropList OptComma NEWLINE PropObj`, `$$ = $1.push(@3.generated, $4) && $1`],
    [`PropList OptComma INDENT PropList OUTDENT`, `$$ = $1.concat(false, ...[$4])`]
];

grammar.ParamPropList = [
    [``, `$$ = []`],
    [`ParamPropObj`, `$$ = [$1]`],
    [`ParamPropList , ParamPropObj`, `$$ = $1.push($3) && $1`],
    [`ParamPropList OptComma NEWLINE ParamPropObj`, `$$ = $1.push($4) && $1`],
    [`ParamPropList OptComma INDENT ParamPropObj OUTDENT`, `$$ = $1.push($4) && $1`]
]

grammar.PropObj = [
    [`Function`, `$$ = $1`],
    [`ClassFunction`, `$$ = $1`],
    [`PROPERTY : Expression`, `$$ = [$1, $3, [@1, @3]]`],
    [`PROPERTY : Block`, `$$ = [$1, yy.Array.from($3), [@1, @3, true]]`],
    [`PROPERTY : INDENT Expression OUTDENT`, `$$ = [$1, $4, [@1, @5, true]]`],
    [`AlphaNum : Expression`, `$$ = [$1, $3, [@1, @3]]`],
    [`AlphaNum : Block`, `$$ = [$1, yy.Array.from($3), [@1, @3, true]]`],
    [`AlphaNum : INDENT Expression OUTDENT`, `$$ = [$1, $4, [@1, @5, true]]`],
    [`[ Expression ] : Expression`, `$$ = [$2, $5, [@1, @5]]`],
    [`[ Expression ] : INDENT Expression OUTDENT`, `$$ = [$2, $6, [@1, @6, true]]`],
    [`[ Expression ] : Block`, `$$ = [$2, yy.Array.from($5), [@1, @5, true]]`],
    [`PROPERTY :`, `$$ = [$1, false, [@1, @2]]`],
    [`... PROPERTY :`, `$$ = [$2, false, [@1, @3], true]`],
    [`PROPERTY : ...`, `$$ = [$1, false, [@1, @3], true]`],
    [`Identifier`, `$$ = [$1[1], false, [@1, @1]]`],
    [`Assignment`, `$$ = $1`],
    [`... Value`, `$$ = $2`],
    [`Value ...`, `$$ = $1`]
];

grammar.ParamPropObj = [
    [`PROPERTY : ParamAssignable`, `$$ = [$1,$3,,,@1]`],
    [`PROPERTY :`, `$$ = [$1,,,,@1]`],
    [`PROPERTY : Defaults Expression`, `$$ = [$1,,$4,,@1]`],
    [`ParamIdentifier`, `$$ = $1`],
    [`ParamIdentifier :`, `$$ = $1`],
    [`ParamIdentifier Defaults Expression`, `$$ = [$1,,$3]`],
    [`... PROPERTY :`, `$$ = [$2,,,true,@2]`],
    [`PROPERTY : ...`, `$$ = [$1,,,true,@1]`]
]

u(`Literal`, [
    [`AlphaNum`],
    [`Regex`],
    [`UNDEFINED`],
    [`INFINITY`],
    [`BOOL`],
    [`NULL`],
    [`NAN`]
]);

u(`AlphaNum`, [
    [`String`],
    [`NUMBER`]
]);

u(`String`, [
    [`STRING`],
    [`StringWithInterpolations`]
]);

u(`JSX`, [
    [`JSX_START Interpolations JSX_END`, `$2, $1`]
])

u(`StringWithInterpolations`, [
    [`STRING_START Interpolations STRING_END`, `$2, $1`]
]);

u(`Interpolations`, [
    [`Interpolation`, `$1`],
    [`Interpolations Interpolation`, `...$1.contents, $2`],
    [`Interpolations INDENT Interpolations OUTDENT`, `...$1.contents, 1, ...$3.contents, -1`]
])

u(`Interpolation`, [
    [`INTERPOLATION_START Expression INTERPOLATION_END`, `$2`],
    [`String`]
]);

u(`Regex`, [
    [`REGEX`],
    [`RegexWithInterpolations`]
]);

u(`RegexWithInterpolations`, [
    [`REGEX_START RegexInterpolations REGEX_END`, `$2, $3`]
]);

u(`RegexInterpolations`, [
    [`RegexInterpolation`, `$1`],
    [`RegexInterpolations RegexInterpolation`, `...$1.contents, $2`]
])

u(`RegexInterpolation`, [
    [`INTERPOLATION_START Expression INTERPOLATION_END`, `$2`],
    [`Regex`]
]);

u(`ClassFunctionPrelude`, [
    [`ClassFunctionTag`],
    [`ClassFunctionPrelude ClassFunctionTag`, `...$1.addTag($2)`]
]);

// you can declare a function in any order now
// with this we solve the error of many "function" tags that are not supposed to be there
// but the lexer itself can add them
// anyway, they will be checked by the collector, if there is a `get` and it collects later a `set`, it will pop an error. 
u(`ClassFunctionTag`, [
    [`FUNCTION`, `$1, @1`],
    [`STATIC`, `$1, @1`],
    [`GET`, `$1, @1`],
    [`SET`, `$1, @1`],
    [`ASYNC`, `$1, @1`]
]);

u(`FunctionPrelude`, [
    [`FunctionTag`],
    [`FunctionPrelude FunctionTag`, `...$1.addTag($2)`]
]);

// you can declare a function in any order now
// with this we solve the error of many "function" tags that are not supposed to be there
// but the lexer itself can add them
// anyway, they will be checked by the collector, if there is a `get` and it collects later a `set`, it will pop an error. 
u(`FunctionTag`, [
    [`FUNCTION`, `$1, @1`],
    [`ASYNC`, `$1, @1`]
]);

// Name and parameters to take in consideration
u(`FunctionInterlude`, [
    [`<( TypeArguments )>`, `{ generics: $2.setLoc(@1, @2) }`],
    [`IDENTIFIER TypeArguments?`, `{ id: $1, generics: $2.unwrap }`, { last: 1 }],
    [`IDENTIFIER TypeArguments? Params`, `{ id: $1, params: $3, generics: $2.unwrap }`],
    [`IDENTIFIER TypeArguments? WITH`, `{ id: $1, generics: $2.unwrap }`],
    [`IDENTIFIER TypeArguments? WITH Params`, `{ id: $1, generics: $2.unwrap, params: $4 }`],
    [`TypeArguments? Params`, `{ generics: $1.unwrap, params: $2 }`, { first: 2 }],
    [`TypeArguments? WITH`, `{ generics: $1.unwrap }`, { first: 2 }],
    [`TypeArguments? WITH Params`, `{ generics: $1.unwrap, params: $3 }`, { first: 2 }]
])

// Order of executions
u(`FunctionPostlude`, [
    [`Expression`, `yy.Block.wrap($1).setLoc(@1)`],
    [`Statement`, `yy.Block.wrap($1).setLoc(@1)`],
    [`Block`, `$1.unwrap.setLoc(@1)`, { typeOf: 0 }],
    [`THEN Block`, `$2.unwrap.setLoc(@1, @2)`, { typeOf: 1 }],
    [`THEN Expression`, `yy.Block.wrap($2).setLoc(@2)`, { typeOf: 1 }],
    [`THEN Statement`, `yy.Block.wrap($2).setLoc(@2)`, { typeOf: 1 }]
]);

u(`Function`, [
    [`FunctionPrelude FunctionInterlude? FUNC_DIRECTIVE? FunctionPostlude?`,
        `$1, $2.unwrap || {}, $4.unwrap, $3.unwrap`, { last: 1 }]
]);

u(`FunctionInterlude?`, [
    [``, `undefined`],
    [`FunctionInterlude`]
]);

u(`FunctionPostlude?`, [
    [``, `undefined`],
    [`FunctionPostlude`]
]);

u(`FUNC_DIRECTIVE?`, [
    [``, `undefined`],
    [`FUNC_DIRECTIVE`]
]);

u(`ClassFunction`, [
    [`ClassFunctionPrelude FunctionInterlude`, `$1, $2, yy.Block.wrap()`],
    [`ClassFunctionPrelude FunctionInterlude FunctionPostlude`, `$1, $2, $3`],
    [`FunctionInterlude`, `new yy.ClassFunctionPrelude(null), $1, yy.Block.wrap()`],
    [`FunctionInterlude FunctionPostlude`, `new yy.ClassFunctionPrelude(null), $1, $2`]
]);

u('TypeArguments?', [
    ['', 'undefined'],
    ['<( TypeArguments )>', '$2'],
    ['<( INDENT TypeArguments OUTDENT )>', '$3']
]);

u(`Params`, [
    [`PARAM_START PARAM_END`, `[]`, { typeOf: 2 }],
    [`PARAM_START ParamList PARAM_END`, `$2.setLoc(@1, @3)`, { typeOf: 3 }]
]);

u(`ParamList`, [
    [`Param`, `$1`],
    [`ParamList , Param`, `...$1.addParam($3)`],
    [`ParamList OptComma NEWLINE Param`, `...$1.addParam($4)`],
    [`ParamList OptComma INDENT ParamList OptComma OUTDENT`, `...$1.addParams($4.contents)`]
]);

u(`Param`, [
    [`ParamAssignable`]
]);

u(`Assign`, [
    [`Assignment`, `$1`]
]);

u(`Assignment`, [
    [`Assignable AssignKeyword Expression`, `$1, $3, $2`],
    [`Assignable AssignKeyword INDENT Expression OUTDENT`, `$1, $4, $2`],
    [`Assignable AssignKeyword NEWLINE Expression`, `$1, $4, $2`],
    [`Assignable AssignKeyword Block`, `$1, yy.Array.from($3), $2`]
]);

u(`AssignKeyword`, [
    [`AS`, `@1.origin`],
    [`AT`],
    [`FROM`]
])

u(`Assignable`, [
    [`Identifier`],
    [`Object`],
    [`Array`],
    [`Value Access`, `$1, $2`, { typeOf: 2 }],
    ['Expression IN Expression', `$3, $1`]
]);

u('Defaults', [
    ['AS'],
    ['DEFAULTS']
]);

u(`ParamAssignable`, [
    [`ParamIdentifier`],
    [`ParamObject`],
    [`ParamObject Defaults Expression`],
    [`ParamArray`],
    [`ParamArray Defaults Expression`]
])

u(`ParamObject`, [
    [`{ ParamPropList }`, `$2`, { typeOf: 3 }],
    ['{ }', '[]', { typeOf: 0 }]
])

grammar.ParamAssignable[2][1] = `$$ = new yy.ParamAssignable('ParamObject', $1.defaults($3)).setLocation(@1, @3)`;
grammar.ParamAssignable[4][1] = `$$ = new yy.ParamAssignable('ParamArray', $1.defaults($3)).setLocation(@1, @3)`;

u(`Identifier`, [
    [`IDENTIFIER`]
]);

u(`ParamIdentifier`, [
    [`IDENTIFIER`, `$1`],
    [`... IDENTIFIER`, `$2`, { expansion: true, typeOf: 2 }],
    [`IDENTIFIER ...`, `$1`, { expansion: true }],
    [`IDENTIFIER Defaults Expression`, `$1,,$3`],
    [`THIS . PROPERTY`, `$3, true`, { typeOf: 3 }],
    [`THIS . PROPERTY Defaults Expression`, `$3,true,$5`, { typeOf: 3 }],
    [`THIS . PROPERTY ...`, `$3, true`, { expansion: true, typeOf: 3 }],
    [`... THIS . PROPERTY`, `$4, true`, { expansion: true, typeOf: 4 }],
    [`THIS`, `$1,,,true`]
]);

u(`Access`, [
    [`. PROPERTY`, `Object.assign([$2], { loc: @2 }), @1.origin === '?.'`, { typeOf: 2 }],
    [`INDEX_START Expression INDEX_END`, `$2`, { typeOf: 3 }]
]);

u(`ParamArray`, [
    [`[ ]`, `/* */`, { typeOf: 0 }],
    [`[ ParamArrayList OptVoids ]`, `$2`, { typeOf: 4 }],
    [`[ ParamArrayList OptVoids ]`, `$2`, { typeOf: 4 }]
])

u(`Array`, [
    [`[ ]`, `/* */`, { checkGenerated: 1 }],
    [`[ ArrayList OptVoids ]`, `...$2`, { checkGenerated: 1 }],
    [`[ INDENT ArrayList OptVoids OUTDENT ]`, `...$3`, { indented: true, checkGenerated: 1 }]
]);

grammar.ParamArrayList = [
    [`ParamArrayArg`, `$$ = [...$1]`],
    [`ParamArrayList , ParamArrayArg`, `$$ = $1.concat($3)`],
    [`ParamArrayList OptComma NEWLINE ParamArrayArg`, `$$ = $1.concat($4)`]
]

grammar.ArrayList = [
    [`ArrayArg`, `$$ = [...$1]`],
    [`ArrayList , ArrayArg`, `$$ = $1.concat($3)`],
    [`ArrayList OptComma INDENT ArrayList OptVoids OUTDENT`, `$$ = $1.concat(false, $4)`],
    [`ArrayList OptComma NEWLINE ArrayArg`, `$$ = $1.concat(@3.generated, $4)`]
];

grammar.ParamArrayArg = [
    [`ParamAssignable`, `$$ = [$1]`],
    [`Voids ParamAssignable`, `$$ = [...$1, $2]`]
]

grammar.ArrayArg = [
    [`... Expression`, `$$ = [Object.assign($2, { expansion: true })]`],
    [`Expression ...`, `$$ = [Object.assign($1, { expansion: true })]`],
    [`Expression`, `$$ = [$1]`],
    [`Voids Expression`, `$$ = [...$1, $2]`]
];

grammar.OptVoids = [
    [``, `$$ = undefined`],
    [`Voids`, `$$ = $1`]
];

grammar.Voids = [
    [`,`, `$$ = [null]`],
    [`, Voids`, `$$ = [null, ...$1]`],
    [`, NEWLINE Voids`, `$$ = [null, ...$2]`]
]

u(`Statement`, [
    [`Return`],
    [`BREAK Identifier`, `$2`],
    [`BREAK`],
    [`CONTINUE Identifier`, `$2`],
    [`CONTINUE`],
    [`Import`],
    [`Export`],
    [`Declare`],
    [`THROW Expression`, `$2`],
    [`THROW INDENT Expression OUTDENT`, `$3`],
    [`DELETE Expression`, `$2`],
    [`Type`],
    [`Interface`]
]);

u(`Interface`, [
    ['INTERFACE Identifier TypeArguments? IntExtends? InterfaceBody', '$2, $3, $5, $4.unwrap'],
    ['INTERFACE Identifier TypeArguments? IntExtends? INDENT InterfaceBody OUTDENT', '$2, $3, $6, $4.unwrap']
]);

u('IntExtends?', [
    ['', 'undefined'],
    ['EXTENDS ExtendsNames', '$2']
]);

u('ClassImplements?', [
    ['', 'undefined'],
    ['IMPLEMENTS ExtendsNames', '$2']
]);

u('ExtendsNames', [
    ['ExtendsNames , ExtendsName', '...$1.contents, $3'],
    ['ExtendsNames OptComma NEWLINE ExtendsName', '...$1.contents, $4'],
    ['ExtendsName']
]);

u('ExtendsName', [
    ['Identifier TypeArguments?', '$1, $2.unwrap', { last: 1 }]
]);

u(`InterfaceBody`, [
    ['', '[]'],
    ['{ }', '[]'],
    ['InterfaceBody OptComma NEWLINE InterfaceBody', '[...$1.unwrap, ...$4.unwrap]'],
    ['{ InterfaceProperties }', '$2.contents'],
    ['{ INDENT InterfaceProperties OUTDENT }', '$3.contents'],
    ['InterfaceProperties', '$1.contents'],
    ['INDENT InterfaceProperties OUTDENT', '$2.contents']
]);

u(`InterfaceProperties`, [
    ['InterfaceProperty'],
    ['InterfaceProperties , InterfaceProperty', '...$1.contents, $3'],
    ['InterfaceProperties OptComma NEWLINE InterfaceProperty', '...$1.contents, $4'],
    ['InterfaceProperties OptComma INDENT InterfaceProperties OUTDENT', '...$1.contents, ...$4.contents'],
    ['InterfaceProperties , { InterfaceProperties }', '...$1.contents, ...$4.contents'],
    ['InterfaceProperties OptComma NEWLINE { InterfaceProperties }', '...$1.contents, ...$5.contents'],
    ['InterfaceProperties OptComma INDENT { InterfaceProperties } OUTDENT', '...$1.contents, ...$5.contents'],
    ['InterfaceProperties OptComma INDENT { INDENT InterfaceProperties OUTDENT } OUTDENT', '...$1.contents, ...$6.contents']
]);

u('InterfaceProperty', [
    // READONLY
    ['READONLY Identifier IntTypeSentence?', '$2, $3.unwrap || @2.type, { readonly: true }', { last: 2 }],
    ['READONLY PROPERTY : InlineType', 'new yy.Identifier(null, $2).setLoc(@2), $4, { readonly: true }'],
    ['READONLY [ Identifier ] IntTypeSentence?', '$3, $5.unwrap || @4.type, { readonly: true, indexed: true }', { last: 4 }],
    ['READONLY [ { PROPERTY : TypeSentence } ] IntTypeSentence?', 'new yy.Identifier(null, $4).setLoc({ ...@4, type: { nodes: $6, loc: @6 } }), $9.unwrap || @8.type, { readonly: true, indexed: true }', { last: 8 }],
    // NEW
    ['NEW TypeArguments? Params IntTypeSentence?', 'null, $4.unwrap || @3.type, { news: true, params: $3, args: $2.unwrap }', { last: 3 }],

    // Methods
    ['IntTypeSpecifiers Identifier TypeArguments? Params IntTypeSentence?', '$2, $5.unwrap || @4.type, { ...$1.unwrap, params: $4, args: $3 }', { first: 2, last: 4 }],
    ['Identifier TypeArguments? Params IntTypeSentence?', '$1, $4.unwrap || @3.type, { params: $3, args: $2 }', { last: 3 }],

    // Raw properties
    ['Identifier IntTypeSentence?', '$1, $2.unwrap || @1.type, {}', { last: 1 }],
    ['PROPERTY : InlineType', 'new yy.Identifier(null, $1).setLoc(@1), Object.assign($3, { optional: @2.origin === "?:" })'],
    ['[ Identifier ] IntTypeSentence?', '$2, $4.unwrap || @3.type, { indexed: true }', { last: 3 }],
    ['[ { PROPERTY : TypeSentence } ] IntTypeSentence?', 'Object.assign(new yy.Identifier(null, $3).setLoc({ ...@3, type: { nodes: $5, loc: @5 } }), { optional: @4.origin === "?:" }), $8.unwrap || @7.type, { indexed: true }', { last: 7 }]
]);

// Most of properties from an interface don't need a type annotation so we keep them optional
u('IntTypeSentence?', [
    ['', 'undefined'],
    [': InlineType', 'Object.assign($2, { optional: @1.origin === "?:" })'],
    [': INDENT TypeSentence OUTDENT', 'Object.assign($3, { optional: @1.origin === "?:" })'],
    [': NEWLINE InlineType', 'Object.assign($3, { optional: @1.origin === "?:" })']
]);

u(`IntTypeSpecifiers`, [
    [`GET`, `{ getter: true }`],
    [`SET`, `{ setter: true }`]
]);

u(`Type`, [
    [`TYPE TypeDeclaration`, `$2`],
    [`TYPE INDENT TypeDeclaration OUTDENT`, `$3`],
    [`TYPE NEWLINE TypeDeclaration`, `$3`]
])

u(`TypeDeclaration`, [
    [`Identifier TypeArguments? AS InlineType`, `$1, $4, $2.unwrap`],
    [`Identifier TypeArguments? AS INDENT TypeSentence OUTDENT`, `$1, $5, $2.unwrap`],
    [`Identifier TypeArguments? AS NEWLINE TypeSentence`, `$1, $5, $2.unwrap`]
])

u(`TypeSentence`, [
    [`TypeValue`],
    [`TYPE_JOIN`],
    [`TypeSentence TypeValue`, `...$1.contents, $2`],
    [`TypeSentence TYPE_JOIN`, `...$1.contents, $2`],
    [`TypeSentence INDENT TypeSentence OUTDENT`, `...$1.contents, 1, ...$3.contents, -1`],
    [`TypeSentence NEWLINE TypeValue`, `...$1.contents, 0, $3`],
    [`TypeSentence NEWLINE TYPE_JOIN`, `...$1.contents, 0, $3`]
]);

u(`TypeValue`, [
    [`TypeArray`],
    [`TypeObject`],
    [`Literal`],
    [`Identifier`],
    [`VOID`],
    [`TAG`],
    ['TypeWithArguments'],
    [`TypeAccess`],
    [`TypeFunction`],
    [`TypeofKeyof`],
    [`TypeWrapped`]
]);

u(`TypeofKeyof`, [
    [`KEYOF TypeValue`, `$2, $1`],
    [`TYPEOF TypeValue`, `$2, $1`]
])

u(`TypeWrapped`, [
    [`( TypeSentence )`, '$2'],
    [`( INDENT TypeSentence OUTDENT )`, '$3', { indented: true }]
]);

u(`TypeAccess`, [
    [`TypeValue INDEX_START TypeSentence INDEX_END`, `$1, $3`],
    [`TypeValue INDEX_START INDENT TypeSentence OUTDENT INDEX_END`, `$1, $3`, { indented: true }],
    [`TypeValue . PROPERTY`, `$1, new yy.String('STRING', "'" + $3 + "'").setLoc(@3)`],
    [`TypeValue IN TypeValue`, `$3, new yy.TypeSentence('TypeValue', $1).setLoc(@1)`]
]);

u(`TypeFunction`, [
    [`Params FUNC_DIRECTIVE InlineType`, `$1, $3`],
    [`FUNC_DIRECTIVE InlineType`, `new yy.Params(null, []), $2`],
    [`NEW Params FUNC_DIRECTIVE InlineType`, `$2, $4, $1`],
    [`NEW FUNC_DIRECTIVE InlineType`, `new yy.Params(null, []), $3, $1`]
]);

u('TypeWithArguments', [
    ['TypeValue INDEX_START INDEX_END', '{ isArray: true, type: $1 }'],
    ['Identifier <( TypeArguments )>', '{ type: $1, arguments: $3 }'],
    ['Identifier <( INDENT TypeArguments OUTDENT )>', '{ type: $1, arguments: $4 }']
])

u('TypeArguments', [
    ['TypeArgument'],
    ['TypeArguments , TypeArgument', '...$1.contents, $3'],
    ['TypeArguments OptComma NEWLINE TypeArgument', '...$1.contents, $4'],
    ['TypeArguments OptComma INDENT TypeArgument OUTDENT', '...$1.contents, $4']
])

u('TypeArgument', [
    ['Identifier', '$1'],
    ['Identifier EXTENDS Identifier', '$1, $3'],
    ['TypeWithArguments']
])

u(`InlineType`, [
    [`TypeValue`],
    [`TYPE_JOIN`],
    [`InlineType TypeValue`, `...$1.contents, $2`],
    [`InlineType TYPE_JOIN`, `...$1.contents, $2`],
    [`InlineType INDENT TypeSentence OUTDENT`, `...$1.contents, 1, ...$3.contents, -1`]
]);

u(`TypeObject`, [
    [`{ }`, '/* */'],
    [`{ TypeObjProps }`, `...$2.contents`],
    [`{ INDENT TypeObjProps OUTDENT }`, `...$3.contents`, { indented: true }],
]);

u(`TypeObjProps`, [
    [`TypeObjProp`],
    [`TypeObjProps , TypeObjProp`, `...$1.contents, $3`],
    [`TypeObjProps OptComma NEWLINE TypeObjProp`, `...$1.contents, @3.generated && 1 || 0, $4`],
    [`TypeObjProps OptComma INDENT TypeObjProps OUTDENT`, `...$1.contents, 2, ...$4.contents`]
])

u(`TypeObjProp`, [
    [`Identifier`, `$1`],
    [`PROPERTY : InlineType`, `$1, $3, @2.origin === '?:'`],
    [`PROPERTY : NEWLINE InlineType`, `$1, $4, @2.origin === '?:'`],
    [`PROPERTY : INDENT TypeSentence OUTDENT`, `$1, $4, @2.origin === '?:'`],
    [`PROPERTY :`, `$1, , @2.origin === '?:'`],
    [`[ PROPERTY : TypeSentence ] : InlineType`, `$2, $7, , { isDynamicKey: true, keyType: $4 }`],
    [`[ PROPERTY : TypeSentence ] : NEWLINE InlineType`, `$2, $8, , { isDynamicKey: true, keyType: $4 }`],
    [`[ PROPERTY : TypeSentence ] : INDENT TypeSentence OUTDENT`, `$2, $8, , { isDynamicKey: true, keyType: $4 }`],
    [`[ Identifier ] : InlineType`, `$2, $5, , { isDynamicKey: true, keyType: @2.type }`],
    [`[ Identifier ] : NEWLINE InlineType`, `$2, $6, , { isDynamicKey: true, keyType: @2.type }`],
    [`[ Identifier ] : INDENT TypeSentence OUTDENT`, `$2, $6, , { isDynamicKey: true, keyType: @2.type }`]
]);

u(`TypeArray`, [
    [`[ TypeArrayItems ]`, `...$2.contents`],
    [`[ INDENT TypeArrayItems OUTDENT ]`, `...$3.contents`, { indented: true }]
])

u(`TypeArrayItems`, [
    ['InlineType'],
    [`TypeArrayItems OptComma NEWLINE InlineType`, `...$1.contents, @3.generated && 1 || 0, $4`],
    [`TypeArrayItems OptComma INDENT TypeSentence OUTDENT`, `...$1.contents, 2, $4`],
    [`TypeArrayItems , InlineType`, `...$1.contents, $3`]
]);

u(`Declare`, [
    [`DeclarationKeyword Declarations`, `{ keyword: $1, statements: $2 }, [@1, @2]`],
    [`DeclarationKeyword INDENT Declarations OUTDENT`, `{ keyword: $1, statements: $3, indented: true }, [@1, @3]`]
]);

u(`DeclarationKeyword`, [
    [`VAR`],
    [`LET`],
    [`CONST`]
]);

u(`Declarations`, [
    [`Declaration`, `$1.unwrap`],
    [`Declarations , Declaration`, `...$1.contents, $3.unwrap`],
    [`Declarations OptComma NEWLINE Declaration`, `...$1.contents, @3.generated, $4.unwrap`],
    [`Declarations OptComma INDENT Declarations OUTDENT`, `...$1.contents, false, ...$4.contents`]
]);

u(`Declaration`, [
    ['Assignable'],
    [`Assignable AssignKeyword Expression`, `new yy.Assignment('Assignable AssignKeyword Expression', $1, $3, $2).setLoc(@1, @3)`],
    [`Assignable AssignKeyword INDENT Expression OUTDENT`, `new yy.Assignment('Assignable AssignKeyword INDENT Expression OUTDENT', $1, $4, $2).setLoc(@1, @5)`],
    [`Assignable AssignKeyword Block`, `new yy.Assignment('Assignable AssignKeyword Block', $1, yy.Array.from($3), $2).setLoc(@1, @3)`]
]);

u(`Return`, [
    [`RETURN`, `undefined`],
    [`RETURN Expression`, `$2`],
    [`RETURN INDENT Expression OUTDENT`, `$3`],
    [`RETURN INDENT Body OUTDENT`, `$3`]
]);

u(`Import`, [
    [`IMPORT ImportList FROM STRING`, `{ _imports: $2, _from: $4 }`],
    [`IMPORT Identifier FROM STRING`, `{ _default: $2, _from: $4 }`],
    [`IMPORT Identifier OptSeparator ImportList FROM STRING`, `{ _default: $2, _imports: $4, _from: $6 }`]
]);

u(`OptSeparator`, [
    [``, `undefined`],
    [`,`, `undefined`],
    [`OptComma NEWLINE`, `1`]
]);

u(`Export`, [
    [`EXPORT ExportList`, `{ list: $2 }`],
    [`EXPORT INDENT ExportList OUTDENT`, `{ list: $3 }`],
    [`EXPORT DEFAULT Expression`, `{ defaults: $3 }`],
    [`EXPORT INDENT DEFAULT Expression OUTDENT`, `{ defaults: $4 }`],
    [`EXPORT Declare`, `{ declarations: $2 }`],
    [`EXPORT INDENT Declare OUTDENT`, `{ declarations: $3 }`],
    [`EXPORT Exportable`, `{ exportable: $2.unwrap }`],
    [`EXPORT INDENT Exportable OUTDENT`, `{ exportable: $3.unwrap }`]
]);

u(`ImportList`, [
    [`Identifier`],
    [`* AS Identifier`, `$3`, { _isAll: true }],
    [`{ ImportNames OptComma }`, `$2`],
    [`{{ INDENT ImportNames OptComma OUTDENT }}`, `$3`]
]);

u(`ExportList`, [
    [`{ ExportNames }`, `$2`],
    [`{{ INDENT ExportNames OUTDENT }}`, `$3`]
]);

u(`ExportNames`, [
    [`ExportName`, `$1.contents`],
    [`ExportNames , ExportName`, `...$1.contents, $3.contents`],
    [`ExportNames OptComma NEWLINE ExportName`, `...$1.contents, $4.contents`]
]);

u(`ExportName`, [
    [`PROPERTY :`, `new yy.Identifier(0, $1).setLoc(@1)`],
    [`PROPERTY : Identifier`, `new yy.Identifier(0, $1).setLoc(@1), $3`],
    [`PROPERTY : AS Identifier`, `new yy.Identifier(0, $1).setLoc(@1), $4`],
    [`Identifier`],
    [`Identifier AS DEFAULT`, `$1,,true`],
    [`Identifier AS Identifier`, `$1,$3`]
]);

u(`Exportable`, [
    [`Class`],
    [`Function`]
])

u(`ImportNames`, [
    [`ImportName`, `$1.contents`],
    [`ImportNames , ImportName`, `...$1.contents, $3.contents`],
    [`ImportNames OptComma NEWLINE ImportName`, `...$1.contents, $4.contents`],
]);

u(`ImportName`, [
    [`PROPERTY :`, `new yy.Identifier(0, $1).setLoc(@1), , [@1, @2]`],
    [`PROPERTY : Identifier`, `new yy.Identifier(0, $1).setLoc(@1), $3`],
    [`PROPERTY : AS Identifier`, `new yy.Identifier(0, $1).setLoc(@1), $4`],
    [`Identifier AS Identifier`, `$1, $3`],
    [`DEFAULT AS Identifier`, `(new yy.Identifier(null, 'default')).setLoc(@1), $3`],
    [`Identifier`]
]);

function wrap(source) {
    let [from, to] = source.split(' ');

    wrapped[`${from}(${to})`] = { from, to };
    grammar[`${from}(${to})`] = [
        [to, '$$ = $1']
    ];
}

export default grammar;