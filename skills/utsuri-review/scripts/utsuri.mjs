#!/usr/bin/env node
import { createRequire as __utsuriCreateRequire } from "node:module";
const require = __utsuriCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/codegen/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
    var _CodeOrName = class {
    };
    exports._CodeOrName = _CodeOrName;
    exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var Name = class extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    };
    exports.Name = Name;
    var _Code = class extends _CodeOrName {
      constructor(code) {
        super();
        this._items = typeof code === "string" ? [code] : code;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
          if (c instanceof Name)
            names[c.str] = (names[c.str] || 0) + 1;
          return names;
        }, {});
      }
    };
    exports._Code = _Code;
    exports.nil = new _Code("");
    function _(strs, ...args) {
      const code = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code, args[i]);
        code.push(strs[++i]);
      }
      return new _Code(code);
    }
    exports._ = _;
    var plus = new _Code("+");
    function str(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports.str = str;
    function addCodeArg(code, arg) {
      if (arg instanceof _Code)
        code.push(...arg._items);
      else if (arg instanceof Name)
        code.push(arg);
      else
        code.push(interpolate(arg));
    }
    exports.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
    }
    exports.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports.regexpCode = regexpCode;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/codegen/scope.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
    var code_1 = require_code();
    var ValueError = class extends Error {
      constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
      }
    };
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
    exports.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    var Scope = class {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    };
    exports.Scope = Scope;
    var ValueScopeName = class extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    };
    exports.ValueScopeName = ValueScopeName;
    var line = (0, code_1._)`\n`;
    var ValueScope = class extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value) {
        var _a;
        if (value.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name.setValue(value, { property: prefix, itemIndex });
        return name;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
          if (name.scopePath === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return (0, code_1._)`${scopeName}${name.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
          if (name.value === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return name.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name) => {
            if (nameSet.has(name))
              return;
            nameSet.set(name, UsedValueState.Started);
            let c = valueCode(name);
            if (c) {
              const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
              code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
              code = (0, code_1._)`${code}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name);
            }
            nameSet.set(name, UsedValueState.Completed);
          });
        }
        return code;
      }
    };
    exports.ValueScope = ValueScope;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/codegen/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
    var code_1 = require_code();
    var scope_1 = require_scope();
    var code_2 = require_code();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = require_scope();
    Object.defineProperty(exports, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    var Node = class {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    };
    var Def = class extends Node {
      constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names, constants4) {
        if (!names[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names, constants4);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    };
    var Assign = class extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names, constants4) {
        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names, constants4);
        return this;
      }
      get names() {
        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names, this.rhs);
      }
    };
    var AssignOp = class extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    };
    var Label = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    };
    var Break = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    };
    var Throw = class extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    };
    var AnyCode = class extends Node {
      constructor(code) {
        super();
        this.code = code;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names, constants4) {
        this.code = optimizeExpr(this.code, names, constants4);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    };
    var ParentNode = class extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code, n) => code + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names, constants4) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names, constants4))
            continue;
          subtractNames(names, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
      }
    };
    var BlockNode = class extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    };
    var Root = class extends ParentNode {
    };
    var Else = class extends BlockNode {
    };
    Else.kind = "else";
    var If = class _If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code += "else " + this.else.render(opts);
        return code;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof _If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new _If(not(cond), e instanceof _If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names, constants4) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants4);
        if (!(super.optimizeNames(names, constants4) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names, constants4);
        return this;
      }
      get names() {
        const names = super.names;
        addExprNames(names, this.condition);
        if (this.else)
          addNames(names, this.else.names);
        return names;
      }
    };
    If.kind = "if";
    var For = class extends BlockNode {
    };
    For.kind = "for";
    var ForLoop = class extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names, constants4) {
        if (!super.optimizeNames(names, constants4))
          return;
        this.iteration = optimizeExpr(this.iteration, names, constants4);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    };
    var ForRange = class extends For {
      constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
      }
      get names() {
        const names = addExprNames(super.names, this.from);
        return addExprNames(names, this.to);
      }
    };
    var ForIter = class extends For {
      constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names, constants4) {
        if (!super.optimizeNames(names, constants4))
          return;
        this.iterable = optimizeExpr(this.iterable, names, constants4);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    };
    var Func = class extends BlockNode {
      constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    };
    Func.kind = "func";
    var Return = class extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    };
    Return.kind = "return";
    var Try = class extends BlockNode {
      render(opts) {
        let code = "try" + super.render(opts);
        if (this.catch)
          code += this.catch.render(opts);
        if (this.finally)
          code += this.finally.render(opts);
        return code;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names, constants4) {
        var _a, _b;
        super.optimizeNames(names, constants4);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants4);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants4);
        return this;
      }
      get names() {
        const names = super.names;
        if (this.catch)
          addNames(names, this.catch.names);
        if (this.finally)
          addNames(names, this.finally.names);
        return names;
      }
    };
    var Catch = class extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    };
    Catch.kind = "catch";
    var Finally = class extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    };
    Finally.kind = "finally";
    var CodeGen = class {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value) {
        const name = this._extScope.value(prefixOrName, value);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
        vs.add(name);
        return name;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code = ["{"];
        for (const [key, value] of keyValues) {
          if (code.length > 1)
            code.push(",");
          code.push(key);
          if (key !== value || this.opts.es5) {
            code.push(":");
            (0, code_1.addCodeArg)(code, value);
          }
        }
        code.push("}");
        return new code_1._Code(code);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
            this.var(name, (0, code_1._)`${arr}[${i}]`);
            forBody(name);
          });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    };
    exports.CodeGen = CodeGen;
    function addNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) + (from[n] || 0);
      return names;
    }
    function addExprNames(names, from) {
      return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
    }
    function optimizeExpr(expr, names, constants4) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items.push(...c._items);
        else
          items.push(c);
        return items;
      }, []));
      function replaceName(n) {
        const c = constants4[n.str];
        if (c === void 0 || names[n.str] !== 1)
          return n;
        delete names[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants4[c.str] !== void 0);
      }
    }
    function subtractNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) - (from[n] || 0);
    }
    function not(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports.not = not;
    var andCode = mappend(exports.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports.and = and;
    var orCode = mappend(exports.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/util.js
var require_util = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/util.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
    var codegen_1 = require_codegen();
    var code_1 = require_code();
    function toHash(arr) {
      const hash = {};
      for (const item of arr)
        hash[item] = true;
      return hash;
    }
    exports.toHash = toHash;
    function alwaysValidSchema(it, schema) {
      if (typeof schema == "boolean")
        return schema;
      if (Object.keys(schema).length === 0)
        return true;
      checkUnknownRules(it, schema);
      return !schemaHasRules(schema, it.self.RULES.all);
    }
    exports.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema = it.schema) {
      const { opts, self } = it;
      if (!opts.strictSchema)
        return;
      if (typeof schema === "boolean")
        return;
      const rules = self.RULES.keywords;
      for (const key in schema) {
        if (!rules[key])
          checkStrictMode(it, `unknown keyword: "${key}"`);
      }
    }
    exports.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema, rules) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (rules[key])
          return true;
      return false;
    }
    exports.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema, RULES) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
      if (!$data) {
        if (typeof schema == "number" || typeof schema == "boolean")
          return schema;
        if (typeof schema == "string")
          return (0, codegen_1._)`${schema}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str) {
      return unescapeJsonPointer(decodeURIComponent(str));
    }
    exports.unescapeFragment = unescapeFragment;
    function escapeFragment(str) {
      return encodeURIComponent(escapeJsonPointer(str));
    }
    exports.escapeFragment = escapeFragment;
    function escapeJsonPointer(str) {
      if (typeof str == "number")
        return `${str}`;
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str) {
      return str.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
      if (Array.isArray(xs)) {
        for (const x of xs)
          f(x);
      } else {
        f(xs);
      }
    }
    exports.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
      return (gen, from, to, toName) => {
        const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
      };
    }
    exports.mergeEvaluated = {
      props: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
          gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
        }),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
          if (from === true) {
            gen.assign(to, true);
          } else {
            gen.assign(to, (0, codegen_1._)`${to} || {}`);
            setEvaluated(gen, to, from);
          }
        }),
        mergeValues: (from, to) => from === true ? true : { ...from, ...to },
        resultToName: evaluatedPropsToName
      }),
      items: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
        mergeValues: (from, to) => from === true ? true : Math.max(from, to),
        resultToName: (gen, items) => gen.var("items", items)
      })
    };
    function evaluatedPropsToName(gen, ps) {
      if (ps === true)
        return gen.var("props", true);
      const props = gen.var("props", (0, codegen_1._)`{}`);
      if (ps !== void 0)
        setEvaluated(gen, props, ps);
      return props;
    }
    exports.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
      Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
    }
    exports.setEvaluated = setEvaluated;
    var snippets = {};
    function useFunc(gen, f) {
      return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
      });
    }
    exports.useFunc = useFunc;
    var Type;
    (function(Type2) {
      Type2[Type2["Num"] = 0] = "Num";
      Type2[Type2["Str"] = 1] = "Str";
    })(Type || (exports.Type = Type = {}));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
      if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
      if (!mode)
        return;
      msg = `strict mode: ${msg}`;
      if (mode === true)
        throw new Error(msg);
      it.self.logger.warn(msg);
    }
    exports.checkStrictMode = checkStrictMode;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/names.js
var require_names = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/names.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var names = {
      // validation function arguments
      data: new codegen_1.Name("data"),
      // data passed to validation function
      // args passed from referencing schema
      valCxt: new codegen_1.Name("valCxt"),
      // validation/data context - should not be used directly, it is destructured to the names below
      instancePath: new codegen_1.Name("instancePath"),
      parentData: new codegen_1.Name("parentData"),
      parentDataProperty: new codegen_1.Name("parentDataProperty"),
      rootData: new codegen_1.Name("rootData"),
      // root data - same as the data passed to the first/top validation function
      dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
      // used to support recursiveRef and dynamicRef
      // function scoped variables
      vErrors: new codegen_1.Name("vErrors"),
      // null or array of validation errors
      errors: new codegen_1.Name("errors"),
      // counter of validation errors
      this: new codegen_1.Name("this"),
      // "globals"
      self: new codegen_1.Name("self"),
      scope: new codegen_1.Name("scope"),
      // JTD serialize/parse name for JSON string and position
      json: new codegen_1.Name("json"),
      jsonPos: new codegen_1.Name("jsonPos"),
      jsonLen: new codegen_1.Name("jsonLen"),
      jsonPart: new codegen_1.Name("jsonPart")
    };
    exports.default = names;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    exports.keywordError = {
      message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
    };
    exports.keyword$DataError = {
      message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports.reportError = reportError;
    function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    var E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
      if (schemaPath) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message }, keyValues) {
      const { keyword, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath } = it;
      keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/boolSchema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var boolError = {
      message: "boolean schema is false"
    };
    function topBoolOrEmptySchema(it) {
      const { gen, schema, validateName } = it;
      if (schema === false) {
        falseSchemaError(it, false);
      } else if (typeof schema == "object" && schema.$async === true) {
        gen.return(names_1.default.data);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, null);
        gen.return(true);
      }
    }
    exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema } = it;
      if (schema === false) {
        gen.var(valid, false);
        falseSchemaError(it);
      } else {
        gen.var(valid, true);
      }
    }
    exports.boolOrEmptySchema = boolOrEmptySchema;
    function falseSchemaError(it, overrideAllErrors) {
      const { gen, data } = it;
      const cxt = {
        gen,
        keyword: "false schema",
        data,
        schema: false,
        schemaCode: false,
        schemaValue: false,
        params: {},
        it
      };
      (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
    }
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/rules.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getRules = exports.isJSONType = void 0;
    var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
    var jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
      return typeof x == "string" && jsonTypes.has(x);
    }
    exports.isJSONType = isJSONType;
    function getRules() {
      const groups = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] }
      };
      return {
        types: { ...groups, integer: true, boolean: true, null: true },
        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
        post: { rules: [] },
        all: {},
        keywords: {}
      };
    }
    exports.getRules = getRules;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/applicability.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema, self }, type) {
      const group = self.RULES.types[type];
      return group && group !== true && shouldUseGroup(schema, group);
    }
    exports.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema, group) {
      return group.rules.some((rule) => shouldUseRule(schema, rule));
    }
    exports.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema, rule) {
      var _a;
      return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
    }
    exports.shouldUseRule = shouldUseRule;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/dataType.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
    var rules_1 = require_rules();
    var applicability_1 = require_applicability();
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var DataType;
    (function(DataType2) {
      DataType2[DataType2["Correct"] = 0] = "Correct";
      DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType || (exports.DataType = DataType = {}));
    function getSchemaTypes(schema) {
      const types = getJSONTypes(schema.type);
      const hasNull = types.includes("null");
      if (hasNull) {
        if (schema.nullable === false)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!types.length && schema.nullable !== void 0) {
          throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema.nullable === true)
          types.push("null");
      }
      return types;
    }
    exports.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
      const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
      if (types.every(rules_1.isJSONType))
        return types;
      throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
    }
    exports.getJSONTypes = getJSONTypes;
    function coerceAndCheckDataType(it, types) {
      const { gen, data, opts } = it;
      const coerceTo = coerceToTypes(types, opts.coerceTypes);
      const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
      if (checkTypes) {
        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
        gen.if(wrongType, () => {
          if (coerceTo.length)
            coerceData(it, types, coerceTo);
          else
            reportTypeError(it);
        });
      }
      return checkTypes;
    }
    exports.coerceAndCheckDataType = coerceAndCheckDataType;
    var COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
    function coerceToTypes(types, coerceTypes) {
      return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
    }
    function coerceData(it, types, coerceTo) {
      const { gen, data, opts } = it;
      const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
      const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
      if (opts.coerceTypes === "array") {
        gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
      }
      gen.if((0, codegen_1._)`${coerced} !== undefined`);
      for (const t of coerceTo) {
        if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
          coerceSpecificType(t);
        }
      }
      gen.else();
      reportTypeError(it);
      gen.endIf();
      gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
        gen.assign(data, coerced);
        assignParentData(it, coerced);
      });
      function coerceSpecificType(t) {
        switch (t) {
          case "string":
            gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
            return;
          case "number":
            gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "integer":
            gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "boolean":
            gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
            return;
          case "null":
            gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
            gen.assign(coerced, null);
            return;
          case "array":
            gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
        }
      }
    }
    function assignParentData({ gen, parentData, parentDataProperty }, expr) {
      gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
    }
    function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
      const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
      let cond;
      switch (dataType) {
        case "null":
          return (0, codegen_1._)`${data} ${EQ} null`;
        case "array":
          cond = (0, codegen_1._)`Array.isArray(${data})`;
          break;
        case "object":
          cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
          break;
        case "integer":
          cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
          break;
        case "number":
          cond = numCond();
          break;
        default:
          return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
      }
      return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
      function numCond(_cond = codegen_1.nil) {
        return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
      }
    }
    exports.checkDataType = checkDataType;
    function checkDataTypes(dataTypes, data, strictNums, correct) {
      if (dataTypes.length === 1) {
        return checkDataType(dataTypes[0], data, strictNums, correct);
      }
      let cond;
      const types = (0, util_1.toHash)(dataTypes);
      if (types.array && types.object) {
        const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
        cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
        delete types.null;
        delete types.array;
        delete types.object;
      } else {
        cond = codegen_1.nil;
      }
      if (types.number)
        delete types.integer;
      for (const t in types)
        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
      return cond;
    }
    exports.checkDataTypes = checkDataTypes;
    var typeError = {
      message: ({ schema }) => `must be ${schema}`,
      params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
      const { gen, data, schema } = it;
      const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
      return {
        gen,
        keyword: "type",
        data,
        schema: schema.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema,
        params: {},
        it
      };
    }
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/defaults.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.assignDefaults = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function assignDefaults(it, ty) {
      const { properties, items } = it.schema;
      if (ty === "object" && properties) {
        for (const key in properties) {
          assignDefault(it, key, properties[key].default);
        }
      } else if (ty === "array" && Array.isArray(items)) {
        items.forEach((sch, i) => assignDefault(it, i, sch.default));
      }
    }
    exports.assignDefaults = assignDefaults;
    function assignDefault(it, prop, defaultValue) {
      const { gen, compositeRule, data, opts } = it;
      if (defaultValue === void 0)
        return;
      const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
      if (compositeRule) {
        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
        return;
      }
      let condition = (0, codegen_1._)`${childData} === undefined`;
      if (opts.useDefaults === "empty") {
        condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
      }
      gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
    }
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var util_2 = require_util();
    function checkReportMissingProp(cxt, prop) {
      const { gen, data, it } = cxt;
      gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
        cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
        cxt.error();
      });
    }
    exports.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
      return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
    }
    exports.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
      cxt.setParams({ missingProperty: missing }, true);
      cxt.error();
    }
    exports.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
      return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
      });
    }
    exports.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
      return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
      return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
      return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
    }
    exports.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap2) {
      return schemaMap2 ? Object.keys(schemaMap2).filter((p) => p !== "__proto__") : [];
    }
    exports.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap2) {
      return allSchemaProperties(schemaMap2).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap2[p]));
    }
    exports.schemaProperties = schemaProperties;
    function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
      const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
      const valCxt = [
        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
        [names_1.default.parentData, it.parentData],
        [names_1.default.parentDataProperty, it.parentDataProperty],
        [names_1.default.rootData, names_1.default.rootData]
      ];
      if (it.opts.dynamicRef)
        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
      const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
      return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
    }
    exports.callValidateCode = callValidateCode;
    var newRegExp = (0, codegen_1._)`new RegExp`;
    function usePattern({ gen, it: { opts } }, pattern) {
      const u = opts.unicodeRegExp ? "u" : "";
      const { regExp } = opts.code;
      const rx = regExp(pattern, u);
      return gen.scopeValue("pattern", {
        key: rx.toString(),
        ref: rx,
        code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
      });
    }
    exports.usePattern = usePattern;
    function validateArray(cxt) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      if (it.allErrors) {
        const validArr = gen.let("valid", true);
        validateItems(() => gen.assign(validArr, false));
        return validArr;
      }
      gen.var(valid, true);
      validateItems(() => gen.break());
      return valid;
      function validateItems(notValid) {
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword,
            dataProp: i,
            dataPropType: util_1.Type.Num
          }, valid);
          gen.if((0, codegen_1.not)(valid), notValid);
        });
      }
    }
    exports.validateArray = validateArray;
    function validateUnion(cxt) {
      const { gen, schema, keyword, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
      if (alwaysValid && !it.opts.unevaluated)
        return;
      const valid = gen.let("valid", false);
      const schValid = gen.name("_valid");
      gen.block(() => schema.forEach((_sch, i) => {
        const schCxt = cxt.subschema({
          keyword,
          schemaProp: i,
          compositeRule: true
        }, schValid);
        gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
        if (!merged)
          gen.if((0, codegen_1.not)(valid));
      }));
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
    }
    exports.validateUnion = validateUnion;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/keyword.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var code_1 = require_code2();
    var errors_1 = require_errors();
    function macroKeywordCode(cxt, def) {
      const { gen, keyword, schema, parentSchema, it } = cxt;
      const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
      const schemaRef = useKeyword(gen, keyword, macroSchema);
      if (it.opts.validateSchema !== false)
        it.self.validateSchema(macroSchema, true);
      const valid = gen.name("valid");
      cxt.subschema({
        schema: macroSchema,
        schemaPath: codegen_1.nil,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
        topSchemaRef: schemaRef,
        compositeRule: true
      }, valid);
      cxt.pass(valid, () => cxt.error(true));
    }
    exports.macroKeywordCode = macroKeywordCode;
    function funcKeywordCode(cxt, def) {
      var _a;
      const { gen, keyword, schema, parentSchema, $data, it } = cxt;
      checkAsyncKeyword(it, def);
      const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
      const validateRef = useKeyword(gen, keyword, validate);
      const valid = gen.let("valid");
      cxt.block$data(valid, validateKeyword);
      cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
      function validateKeyword() {
        if (def.errors === false) {
          assignValid();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => cxt.error());
        } else {
          const ruleErrs = def.async ? validateAsync() : validateSync();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => addErrs(cxt, ruleErrs));
        }
      }
      function validateAsync() {
        const ruleErrs = gen.let("ruleErrs", null);
        gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
        return ruleErrs;
      }
      function validateSync() {
        const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
        gen.assign(validateErrs, null);
        assignValid(codegen_1.nil);
        return validateErrs;
      }
      function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
        const passSchema = !("compile" in def && !$data || def.schema === false);
        gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
      }
      function reportErrs(errors) {
        var _a2;
        gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors);
      }
    }
    exports.funcKeywordCode = funcKeywordCode;
    function modifyData(cxt) {
      const { gen, data, it } = cxt;
      gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
    }
    function addErrs(cxt, errs) {
      const { gen } = cxt;
      gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
        (0, errors_1.extendErrors)(cxt);
      }, () => cxt.error());
    }
    function checkAsyncKeyword({ schemaEnv }, def) {
      if (def.async && !schemaEnv.$async)
        throw new Error("async keyword in sync schema");
    }
    function useKeyword(gen, keyword, result2) {
      if (result2 === void 0)
        throw new Error(`keyword "${keyword}" failed to compile`);
      return gen.scopeValue("keyword", typeof result2 == "function" ? { ref: result2 } : { ref: result2, code: (0, codegen_1.stringify)(result2) });
    }
    function validSchemaType(schema, schemaType, allowUndefined = false) {
      return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
    }
    exports.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
      if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
      }
      const deps = def.dependencies;
      if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
      }
      if (def.validateSchema) {
        const valid = def.validateSchema(schema[keyword]);
        if (!valid) {
          const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
          if (opts.validateSchema === "log")
            self.logger.error(msg);
          else
            throw new Error(msg);
        }
      }
    }
    exports.validateKeywordUsage = validateKeywordUsage;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/subschema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
      if (keyword !== void 0 && schema !== void 0) {
        throw new Error('both "keyword" and "schema" passed, only one allowed');
      }
      if (keyword !== void 0) {
        const sch = it.schema[keyword];
        return schemaProp === void 0 ? {
          schema: sch,
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}`
        } : {
          schema: sch[schemaProp],
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
        };
      }
      if (schema !== void 0) {
        if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
          throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
          schema,
          schemaPath,
          topSchemaRef,
          errSchemaPath
        };
      }
      throw new Error('either "keyword" or "schema" must be passed');
    }
    exports.getSubschema = getSubschema;
    function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
      if (data !== void 0 && dataProp !== void 0) {
        throw new Error('both "data" and "dataProp" passed, only one allowed');
      }
      const { gen } = it;
      if (dataProp !== void 0) {
        const { errorPath, dataPathArr, opts } = it;
        const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
        dataContextProps(nextData);
        subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
        subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
      }
      if (data !== void 0) {
        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
        dataContextProps(nextData);
        if (propertyName !== void 0)
          subschema.propertyName = propertyName;
      }
      if (dataTypes)
        subschema.dataTypes = dataTypes;
      function dataContextProps(_nextData) {
        subschema.data = _nextData;
        subschema.dataLevel = it.dataLevel + 1;
        subschema.dataTypes = [];
        it.definedProperties = /* @__PURE__ */ new Set();
        subschema.parentData = it.data;
        subschema.dataNames = [...it.dataNames, _nextData];
      }
    }
    exports.extendSubschemaData = extendSubschemaData;
    function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
      if (compositeRule !== void 0)
        subschema.compositeRule = compositeRule;
      if (createErrors !== void 0)
        subschema.createErrors = createErrors;
      if (allErrors !== void 0)
        subschema.allErrors = allErrors;
      subschema.jtdDiscriminator = jtdDiscriminator;
      subschema.jtdMetadata = jtdMetadata;
    }
    exports.extendSubschemaMode = extendSubschemaMode;
  }
});

// node_modules/.bun/fast-deep-equal@3.1.3/node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/.bun/fast-deep-equal@3.1.3/node_modules/fast-deep-equal/index.js"(exports, module) {
    "use strict";
    module.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// node_modules/.bun/json-schema-traverse@1.0.0/node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS({
  "node_modules/.bun/json-schema-traverse@1.0.0/node_modules/json-schema-traverse/index.js"(exports, module) {
    "use strict";
    var traverse = module.exports = function(schema, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema, "", schema);
    };
    traverse.keywords = {
      additionalItems: true,
      items: true,
      contains: true,
      additionalProperties: true,
      propertyNames: true,
      not: true,
      if: true,
      then: true,
      else: true
    };
    traverse.arrayKeywords = {
      items: true,
      allOf: true,
      anyOf: true,
      oneOf: true
    };
    traverse.propsKeywords = {
      $defs: true,
      definitions: true,
      properties: true,
      patternProperties: true,
      dependencies: true
    };
    traverse.skipKeywords = {
      default: true,
      enum: true,
      const: true,
      required: true,
      maximum: true,
      minimum: true,
      exclusiveMaximum: true,
      exclusiveMinimum: true,
      multipleOf: true,
      maxLength: true,
      minLength: true,
      pattern: true,
      format: true,
      maxItems: true,
      minItems: true,
      uniqueItems: true,
      maxProperties: true,
      minProperties: true
    };
    function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema && typeof schema == "object" && !Array.isArray(schema)) {
        pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema) {
          var sch = schema[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
          }
        }
        post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str) {
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/resolve.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
    var util_1 = require_util();
    var equal = require_fast_deep_equal();
    var traverse = require_json_schema_traverse();
    var SIMPLE_INLINED = /* @__PURE__ */ new Set([
      "type",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "maxProperties",
      "minProperties",
      "maxItems",
      "minItems",
      "maximum",
      "minimum",
      "uniqueItems",
      "multipleOf",
      "required",
      "enum",
      "const"
    ]);
    function inlineRef(schema, limit = true) {
      if (typeof schema == "boolean")
        return true;
      if (limit === true)
        return !hasRef(schema);
      if (!limit)
        return false;
      return countKeys(schema) <= limit;
    }
    exports.inlineRef = inlineRef;
    var REF_KEYWORDS = /* @__PURE__ */ new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor"
    ]);
    function hasRef(schema) {
      for (const key in schema) {
        if (REF_KEYWORDS.has(key))
          return true;
        const sch = schema[key];
        if (Array.isArray(sch) && sch.some(hasRef))
          return true;
        if (typeof sch == "object" && hasRef(sch))
          return true;
      }
      return false;
    }
    function countKeys(schema) {
      let count = 0;
      for (const key in schema) {
        if (key === "$ref")
          return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
          continue;
        if (typeof schema[key] == "object") {
          (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
        }
        if (count === Infinity)
          return Infinity;
      }
      return count;
    }
    function getFullPath(resolver, id = "", normalize2) {
      if (normalize2 !== false)
        id = normalizeId(id);
      const p = resolver.parse(id);
      return _getFullPath(resolver, p);
    }
    exports.getFullPath = getFullPath;
    function _getFullPath(resolver, p) {
      const serialized = resolver.serialize(p);
      return serialized.split("#")[0] + "#";
    }
    exports._getFullPath = _getFullPath;
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports.normalizeId = normalizeId;
    function resolveUrl(resolver, baseId, id) {
      id = normalizeId(id);
      return resolver.resolve(baseId, id);
    }
    exports.resolveUrl = resolveUrl;
    var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
    function getSchemaRefs(schema, baseId) {
      if (typeof schema == "boolean")
        return {};
      const { schemaId, uriResolver } = this.opts;
      const schId = normalizeId(schema[schemaId] || baseId);
      const baseIds = { "": schId };
      const pathPrefix = getFullPath(uriResolver, schId, false);
      const localRefs = {};
      const schemaRefs = /* @__PURE__ */ new Set();
      traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
        if (parentJsonPtr === void 0)
          return;
        const fullPath = pathPrefix + jsonPtr;
        let innerBaseId = baseIds[parentJsonPtr];
        if (typeof sch[schemaId] == "string")
          innerBaseId = addRef.call(this, sch[schemaId]);
        addAnchor.call(this, sch.$anchor);
        addAnchor.call(this, sch.$dynamicAnchor);
        baseIds[jsonPtr] = innerBaseId;
        function addRef(ref) {
          const _resolve = this.opts.uriResolver.resolve;
          ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
          if (schemaRefs.has(ref))
            throw ambiguos(ref);
          schemaRefs.add(ref);
          let schOrRef = this.refs[ref];
          if (typeof schOrRef == "string")
            schOrRef = this.refs[schOrRef];
          if (typeof schOrRef == "object") {
            checkAmbiguosRef(sch, schOrRef.schema, ref);
          } else if (ref !== normalizeId(fullPath)) {
            if (ref[0] === "#") {
              checkAmbiguosRef(sch, localRefs[ref], ref);
              localRefs[ref] = sch;
            } else {
              this.refs[ref] = fullPath;
            }
          }
          return ref;
        }
        function addAnchor(anchor) {
          if (typeof anchor == "string") {
            if (!ANCHOR.test(anchor))
              throw new Error(`invalid anchor "${anchor}"`);
            addRef.call(this, `#${anchor}`);
          }
        }
      });
      return localRefs;
      function checkAmbiguosRef(sch1, sch2, ref) {
        if (sch2 !== void 0 && !equal(sch1, sch2))
          throw ambiguos(ref);
      }
      function ambiguos(ref) {
        return new Error(`reference "${ref}" resolves to more than one schema`);
      }
    }
    exports.getSchemaRefs = getSchemaRefs;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/validate/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
    var boolSchema_1 = require_boolSchema();
    var dataType_1 = require_dataType();
    var applicability_1 = require_applicability();
    var dataType_2 = require_dataType();
    var defaults_1 = require_defaults();
    var keyword_1 = require_keyword();
    var subschema_1 = require_subschema();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var errors_1 = require_errors();
    function validateFunctionCode(it) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          topSchemaObjCode(it);
          return;
        }
      }
      validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
    }
    exports.validateFunctionCode = validateFunctionCode;
    function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
      if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
          gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
          destructureValCxtES5(gen, opts);
          gen.code(body);
        });
      } else {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
      }
    }
    function destructureValCxt(opts) {
      return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
    }
    function destructureValCxtES5(gen, opts) {
      gen.if(names_1.default.valCxt, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
        gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
      }, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.rootData, names_1.default.data);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
      });
    }
    function topSchemaObjCode(it) {
      const { schema, opts, gen } = it;
      validateFunction(it, () => {
        if (opts.$comment && schema.$comment)
          commentKeyword(it);
        checkNoDefault(it);
        gen.let(names_1.default.vErrors, null);
        gen.let(names_1.default.errors, 0);
        if (opts.unevaluated)
          resetEvaluated(it);
        typeAndKeywords(it);
        returnResults(it);
      });
      return;
    }
    function resetEvaluated(it) {
      const { gen, validateName } = it;
      it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
    }
    function funcSourceUrl(schema, opts) {
      const schId = typeof schema == "object" && schema[opts.schemaId];
      return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
    }
    function subschemaCode(it, valid) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          subSchemaObjCode(it, valid);
          return;
        }
      }
      (0, boolSchema_1.boolOrEmptySchema)(it, valid);
    }
    function schemaCxtHasRules({ schema, self }) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (self.RULES.all[key])
          return true;
      return false;
    }
    function isSchemaObj(it) {
      return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
      const { schema, gen, opts } = it;
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      updateContext(it);
      checkAsyncSchema(it);
      const errsCount = gen.const("_errs", names_1.default.errors);
      typeAndKeywords(it, errsCount);
      gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
    }
    function checkKeywords(it) {
      (0, util_1.checkUnknownRules)(it);
      checkRefsAndKeywords(it);
    }
    function typeAndKeywords(it, errsCount) {
      if (it.opts.jtd)
        return schemaKeywords(it, [], false, errsCount);
      const types = (0, dataType_1.getSchemaTypes)(it.schema);
      const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
      schemaKeywords(it, types, !checkedTypes, errsCount);
    }
    function checkRefsAndKeywords(it) {
      const { schema, errSchemaPath, opts, self } = it;
      if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
      }
    }
    function checkNoDefault(it) {
      const { schema, opts } = it;
      if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
      }
    }
    function updateContext(it) {
      const schId = it.schema[it.opts.schemaId];
      if (schId)
        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
    }
    function checkAsyncSchema(it) {
      if (it.schema.$async && !it.schemaEnv.$async)
        throw new Error("async schema in sync schema");
    }
    function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
      const msg = schema.$comment;
      if (opts.$comment === true) {
        gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
      } else if (typeof opts.$comment == "function") {
        const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
        gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
      }
    }
    function returnResults(it) {
      const { gen, schemaEnv, validateName, ValidationError, opts } = it;
      if (schemaEnv.$async) {
        gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
        if (opts.unevaluated)
          assignEvaluated(it);
        gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
      }
    }
    function assignEvaluated({ gen, evaluated, props, items }) {
      if (props instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.props`, props);
      if (items instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.items`, items);
    }
    function schemaKeywords(it, types, typeErrors, errsCount) {
      const { gen, schema, data, allErrors, opts, self } = it;
      const { RULES } = self;
      if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
        return;
      }
      if (!opts.jtd)
        checkStrictTypes(it, types);
      gen.block(() => {
        for (const group of RULES.rules)
          groupKeywords(group);
        groupKeywords(RULES.post);
      });
      function groupKeywords(group) {
        if (!(0, applicability_1.shouldUseGroup)(schema, group))
          return;
        if (group.type) {
          gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
          iterateKeywords(it, group);
          if (types.length === 1 && types[0] === group.type && typeErrors) {
            gen.else();
            (0, dataType_2.reportTypeError)(it);
          }
          gen.endIf();
        } else {
          iterateKeywords(it, group);
        }
        if (!allErrors)
          gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
      }
    }
    function iterateKeywords(it, group) {
      const { gen, schema, opts: { useDefaults } } = it;
      if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
      gen.block(() => {
        for (const rule of group.rules) {
          if ((0, applicability_1.shouldUseRule)(schema, rule)) {
            keywordCode(it, rule.keyword, rule.definition, group.type);
          }
        }
      });
    }
    function checkStrictTypes(it, types) {
      if (it.schemaEnv.meta || !it.opts.strictTypes)
        return;
      checkContextTypes(it, types);
      if (!it.opts.allowUnionTypes)
        checkMultipleTypes(it, types);
      checkKeywordTypes(it, it.dataTypes);
    }
    function checkContextTypes(it, types) {
      if (!types.length)
        return;
      if (!it.dataTypes.length) {
        it.dataTypes = types;
        return;
      }
      types.forEach((t) => {
        if (!includesType(it.dataTypes, t)) {
          strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
        }
      });
      narrowSchemaTypes(it, types);
    }
    function checkMultipleTypes(it, ts) {
      if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
      }
    }
    function checkKeywordTypes(it, ts) {
      const rules = it.self.RULES.all;
      for (const keyword in rules) {
        const rule = rules[keyword];
        if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
          const { type } = rule.definition;
          if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
            strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
          }
        }
      }
    }
    function hasApplicableType(schTs, kwdT) {
      return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
    }
    function includesType(ts, t) {
      return ts.includes(t) || t === "integer" && ts.includes("number");
    }
    function narrowSchemaTypes(it, withTypes) {
      const ts = [];
      for (const t of it.dataTypes) {
        if (includesType(withTypes, t))
          ts.push(t);
        else if (withTypes.includes("integer") && t === "number")
          ts.push("integer");
      }
      it.dataTypes = ts;
    }
    function strictTypesError(it, msg) {
      const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
      msg += ` at "${schemaPath}" (strictTypes)`;
      (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
    }
    var KeywordCxt = class {
      constructor(it, def, keyword) {
        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
        this.gen = it.gen;
        this.allErrors = it.allErrors;
        this.keyword = keyword;
        this.data = it.data;
        this.schema = it.schema[keyword];
        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
        this.schemaType = def.schemaType;
        this.parentSchema = it.schema;
        this.params = {};
        this.it = it;
        this.def = def;
        if (this.$data) {
          this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
        } else {
          this.schemaCode = this.schemaValue;
          if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
            throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
          }
        }
        if ("code" in def ? def.trackErrors : def.errors !== false) {
          this.errsCount = it.gen.const("_errs", names_1.default.errors);
        }
      }
      result(condition, successAction, failAction) {
        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
      }
      failResult(condition, successAction, failAction) {
        this.gen.if(condition);
        if (failAction)
          failAction();
        else
          this.error();
        if (successAction) {
          this.gen.else();
          successAction();
          if (this.allErrors)
            this.gen.endIf();
        } else {
          if (this.allErrors)
            this.gen.endIf();
          else
            this.gen.else();
        }
      }
      pass(condition, failAction) {
        this.failResult((0, codegen_1.not)(condition), void 0, failAction);
      }
      fail(condition) {
        if (condition === void 0) {
          this.error();
          if (!this.allErrors)
            this.gen.if(false);
          return;
        }
        this.gen.if(condition);
        this.error();
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
      fail$data(condition) {
        if (!this.$data)
          return this.fail(condition);
        const { schemaCode } = this;
        this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
      }
      error(append, errorParams, errorPaths) {
        if (errorParams) {
          this.setParams(errorParams);
          this._error(append, errorPaths);
          this.setParams({});
          return;
        }
        this._error(append, errorPaths);
      }
      _error(append, errorPaths) {
        ;
        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
      }
      $dataError() {
        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
      }
      reset() {
        if (this.errsCount === void 0)
          throw new Error('add "trackErrors" to keyword definition');
        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
      }
      ok(cond) {
        if (!this.allErrors)
          this.gen.if(cond);
      }
      setParams(obj, assign) {
        if (assign)
          Object.assign(this.params, obj);
        else
          this.params = obj;
      }
      block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
        this.gen.block(() => {
          this.check$data(valid, $dataValid);
          codeBlock();
        });
      }
      check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
        if (!this.$data)
          return;
        const { gen, schemaCode, schemaType, def } = this;
        gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
        if (valid !== codegen_1.nil)
          gen.assign(valid, true);
        if (schemaType.length || def.validateSchema) {
          gen.elseIf(this.invalid$data());
          this.$dataError();
          if (valid !== codegen_1.nil)
            gen.assign(valid, false);
        }
        gen.else();
      }
      invalid$data() {
        const { gen, schemaCode, schemaType, def, it } = this;
        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
        function wrong$DataType() {
          if (schemaType.length) {
            if (!(schemaCode instanceof codegen_1.Name))
              throw new Error("ajv implementation error");
            const st = Array.isArray(schemaType) ? schemaType : [schemaType];
            return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
          }
          return codegen_1.nil;
        }
        function invalid$DataSchema() {
          if (def.validateSchema) {
            const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
            return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
          }
          return codegen_1.nil;
        }
      }
      subschema(appl, valid) {
        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
        (0, subschema_1.extendSubschemaMode)(subschema, appl);
        const nextContext = { ...this.it, ...subschema, items: void 0, props: void 0 };
        subschemaCode(nextContext, valid);
        return nextContext;
      }
      mergeEvaluated(schemaCxt, toName) {
        const { it, gen } = this;
        if (!it.opts.unevaluated)
          return;
        if (it.props !== true && schemaCxt.props !== void 0) {
          it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
        }
        if (it.items !== true && schemaCxt.items !== void 0) {
          it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
        }
      }
      mergeValidEvaluated(schemaCxt, valid) {
        const { it, gen } = this;
        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
          gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
          return true;
        }
      }
    };
    exports.KeywordCxt = KeywordCxt;
    function keywordCode(it, keyword, def, ruleType) {
      const cxt = new KeywordCxt(it, def, keyword);
      if ("code" in def) {
        def.code(cxt, ruleType);
      } else if (cxt.$data && def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      } else if ("macro" in def) {
        (0, keyword_1.macroKeywordCode)(cxt, def);
      } else if (def.compile || def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      }
    }
    var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, { dataLevel, dataNames, dataPathArr }) {
      let jsonPointer;
      let data;
      if ($data === "")
        return names_1.default.rootData;
      if ($data[0] === "/") {
        if (!JSON_POINTER.test($data))
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        jsonPointer = $data;
        data = names_1.default.rootData;
      } else {
        const matches = RELATIVE_JSON_POINTER.exec($data);
        if (!matches)
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        const up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer === "#") {
          if (up >= dataLevel)
            throw new Error(errorMsg("property/index", up));
          return dataPathArr[dataLevel - up];
        }
        if (up > dataLevel)
          throw new Error(errorMsg("data", up));
        data = dataNames[dataLevel - up];
        if (!jsonPointer)
          return data;
      }
      let expr = data;
      const segments = jsonPointer.split("/");
      for (const segment of segments) {
        if (segment) {
          data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
          expr = (0, codegen_1._)`${expr} && ${data}`;
        }
      }
      return expr;
      function errorMsg(pointerType, up) {
        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
      }
    }
    exports.getData = getData;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/runtime/validation_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ValidationError = class extends Error {
      constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
      }
    };
    exports.default = ValidationError;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/ref_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var resolve_1 = require_resolve();
    var MissingRefError = class extends Error {
      constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
      }
    };
    exports.default = MissingRefError;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/compile/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
    var codegen_1 = require_codegen();
    var validation_error_1 = require_validation_error();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var validate_1 = require_validate();
    var SchemaEnv = class {
      constructor(env) {
        var _a;
        this.refs = {};
        this.dynamicAnchors = {};
        let schema;
        if (typeof env.schema == "object")
          schema = env.schema;
        this.schema = env.schema;
        this.schemaId = env.schemaId;
        this.root = env.root || this;
        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
        this.schemaPath = env.schemaPath;
        this.localRefs = env.localRefs;
        this.meta = env.meta;
        this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
        this.refs = {};
      }
    };
    exports.SchemaEnv = SchemaEnv;
    function compileSchema(sch) {
      const _sch = getCompilingSchema.call(this, sch);
      if (_sch)
        return _sch;
      const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
      const { es5, lines } = this.opts.code;
      const { ownProperties } = this.opts;
      const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
      let _ValidationError;
      if (sch.$async) {
        _ValidationError = gen.scopeValue("Error", {
          ref: validation_error_1.default,
          code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
        });
      }
      const validateName = gen.scopeName("validate");
      sch.validateName = validateName;
      const schemaCxt = {
        gen,
        allErrors: this.opts.allErrors,
        data: names_1.default.data,
        parentData: names_1.default.parentData,
        parentDataProperty: names_1.default.parentDataProperty,
        dataNames: [names_1.default.data],
        dataPathArr: [codegen_1.nil],
        // TODO can its length be used as dataLevel if nil is removed?
        dataLevel: 0,
        dataTypes: [],
        definedProperties: /* @__PURE__ */ new Set(),
        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
        validateName,
        ValidationError: _ValidationError,
        schema: sch.schema,
        schemaEnv: sch,
        rootId,
        baseId: sch.baseId || rootId,
        schemaPath: codegen_1.nil,
        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, codegen_1._)`""`,
        opts: this.opts,
        self: this
      };
      let sourceCode;
      try {
        this._compilations.add(sch);
        (0, validate_1.validateFunctionCode)(schemaCxt);
        gen.optimize(this.opts.code.optimize);
        const validateCode = gen.toString();
        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
        if (this.opts.code.process)
          sourceCode = this.opts.code.process(sourceCode, sch);
        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
        const validate = makeValidate(this, this.scope.get());
        this.scope.value(validateName, { ref: validate });
        validate.errors = null;
        validate.schema = sch.schema;
        validate.schemaEnv = sch;
        if (sch.$async)
          validate.$async = true;
        if (this.opts.code.source === true) {
          validate.source = { validateName, validateCode, scopeValues: gen._values };
        }
        if (this.opts.unevaluated) {
          const { props, items } = schemaCxt;
          validate.evaluated = {
            props: props instanceof codegen_1.Name ? void 0 : props,
            items: items instanceof codegen_1.Name ? void 0 : items,
            dynamicProps: props instanceof codegen_1.Name,
            dynamicItems: items instanceof codegen_1.Name
          };
          if (validate.source)
            validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
        }
        sch.validate = validate;
        return sch;
      } catch (e) {
        delete sch.validate;
        delete sch.validateName;
        if (sourceCode)
          this.logger.error("Error compiling schema, function code:", sourceCode);
        throw e;
      } finally {
        this._compilations.delete(sch);
      }
    }
    exports.compileSchema = compileSchema;
    function resolveRef(root, baseId, ref) {
      var _a;
      ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
      const schOrFunc = root.refs[ref];
      if (schOrFunc)
        return schOrFunc;
      let _sch = resolve.call(this, root, ref);
      if (_sch === void 0) {
        const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
        const { schemaId } = this.opts;
        if (schema)
          _sch = new SchemaEnv({ schema, schemaId, root, baseId });
      }
      if (_sch === void 0)
        return;
      return root.refs[ref] = inlineOrCompile.call(this, _sch);
    }
    exports.resolveRef = resolveRef;
    function inlineOrCompile(sch) {
      if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
        return sch.schema;
      return sch.validate ? sch : compileSchema.call(this, sch);
    }
    function getCompilingSchema(schEnv) {
      for (const sch of this._compilations) {
        if (sameSchemaEnv(sch, schEnv))
          return sch;
      }
    }
    exports.getCompilingSchema = getCompilingSchema;
    function sameSchemaEnv(s1, s2) {
      return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
    }
    function resolve(root, ref) {
      let sch;
      while (typeof (sch = this.refs[ref]) == "string")
        ref = sch;
      return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
    }
    function resolveSchema(root, ref) {
      const p = this.opts.uriResolver.parse(ref);
      const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
      let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
      if (Object.keys(root.schema).length > 0 && refPath === baseId) {
        return getJsonPointer.call(this, p, root);
      }
      const id = (0, resolve_1.normalizeId)(refPath);
      const schOrRef = this.refs[id] || this.schemas[id];
      if (typeof schOrRef == "string") {
        const sch = resolveSchema.call(this, root, schOrRef);
        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
          return;
        return getJsonPointer.call(this, p, sch);
      }
      if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
        return;
      if (!schOrRef.validate)
        compileSchema.call(this, schOrRef);
      if (id === (0, resolve_1.normalizeId)(ref)) {
        const { schema } = schOrRef;
        const { schemaId } = this.opts;
        const schId = schema[schemaId];
        if (schId)
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema, schemaId, root, baseId });
      }
      return getJsonPointer.call(this, p, schOrRef);
    }
    exports.resolveSchema = resolveSchema;
    var PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
      "properties",
      "patternProperties",
      "enum",
      "dependencies",
      "definitions"
    ]);
    function getJsonPointer(parsedRef, { baseId, schema, root }) {
      var _a;
      if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
      for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema === "boolean")
          return;
        const partSchema = schema[(0, util_1.unescapeFragment)(part)];
        if (partSchema === void 0)
          return;
        schema = partSchema;
        const schId = typeof schema === "object" && schema[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
      }
      let env;
      if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
        env = resolveSchema.call(this, root, $ref);
      }
      const { schemaId } = this.opts;
      env = env || new SchemaEnv({ schema, schemaId, root, baseId });
      if (env.schema !== env.root.schema)
        return env;
      return void 0;
    }
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/refs/data.json
var require_data = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/refs/data.json"(exports, module) {
    module.exports = {
      $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
      description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
      type: "object",
      required: ["$data"],
      properties: {
        $data: {
          type: "string",
          anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
        }
      },
      additionalProperties: false
    };
  }
});

// node_modules/.bun/fast-uri@3.1.5/node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS({
  "node_modules/.bun/fast-uri@3.1.5/node_modules/fast-uri/lib/utils.js"(exports, module) {
    "use strict";
    var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
    var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
    var isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
    var isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
    var isPathCharacter = RegExp.prototype.test.bind(/^[\da-z\-._~!$&'()*+,;=:@/]$/iu);
    function stringArrayToHexStripped(input) {
      let acc = "";
      let code = 0;
      let i = 0;
      for (i = 0; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (code === 48) {
          continue;
        }
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
        break;
      }
      for (i += 1; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
      }
      return acc;
    }
    var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
    function consumeIsZone(buffer) {
      buffer.length = 0;
      return true;
    }
    function consumeHextets(buffer, address, output) {
      if (buffer.length) {
        const hex = stringArrayToHexStripped(buffer);
        if (hex !== "") {
          address.push(hex);
        } else {
          output.error = true;
          return false;
        }
        buffer.length = 0;
      }
      return true;
    }
    function getIPV6(input) {
      let tokenCount = 0;
      const output = { error: false, address: "", zone: "" };
      const address = [];
      const buffer = [];
      let endipv6Encountered = false;
      let endIpv6 = false;
      let consume = consumeHextets;
      for (let i = 0; i < input.length; i++) {
        const cursor = input[i];
        if (cursor === "[" || cursor === "]") {
          continue;
        }
        if (cursor === ":") {
          if (endipv6Encountered === true) {
            endIpv6 = true;
          }
          if (!consume(buffer, address, output)) {
            break;
          }
          if (++tokenCount > 7) {
            output.error = true;
            break;
          }
          if (i > 0 && input[i - 1] === ":") {
            endipv6Encountered = true;
          }
          address.push(":");
          continue;
        } else if (cursor === "%") {
          if (!consume(buffer, address, output)) {
            break;
          }
          consume = consumeIsZone;
        } else {
          buffer.push(cursor);
          continue;
        }
      }
      if (buffer.length) {
        if (consume === consumeIsZone) {
          output.zone = buffer.join("");
        } else if (endIpv6) {
          address.push(buffer.join(""));
        } else {
          address.push(stringArrayToHexStripped(buffer));
        }
      }
      output.address = address.join("");
      return output;
    }
    function normalizeIPv6(host) {
      if (findToken(host, ":") < 2) {
        return { host, isIPV6: false };
      }
      const ipv6 = getIPV6(host);
      if (!ipv6.error) {
        let newHost = ipv6.address;
        let escapedHost = ipv6.address;
        if (ipv6.zone) {
          newHost += "%" + ipv6.zone;
          escapedHost += "%25" + ipv6.zone;
        }
        return { host: newHost, isIPV6: true, escapedHost };
      } else {
        return { host, isIPV6: false };
      }
    }
    function findToken(str, token) {
      let ind = 0;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === token) ind++;
      }
      return ind;
    }
    function removeDotSegments(path12) {
      let input = path12;
      const output = [];
      let nextSlash = -1;
      let len = 0;
      while (len = input.length) {
        if (len === 1) {
          if (input === ".") {
            break;
          } else if (input === "/") {
            output.push("/");
            break;
          } else {
            output.push(input);
            break;
          }
        } else if (len === 2) {
          if (input[0] === ".") {
            if (input[1] === ".") {
              break;
            } else if (input[1] === "/") {
              input = input.slice(2);
              continue;
            }
          } else if (input[0] === "/") {
            if (input[1] === "." || input[1] === "/") {
              output.push("/");
              break;
            }
          }
        } else if (len === 3) {
          if (input === "/..") {
            if (output.length !== 0) {
              output.pop();
            }
            output.push("/");
            break;
          }
        }
        if (input[0] === ".") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(3);
              continue;
            }
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(2);
              continue;
            } else if (input[2] === ".") {
              if (input[3] === "/") {
                input = input.slice(3);
                if (output.length !== 0) {
                  output.pop();
                }
                continue;
              }
            }
          }
        }
        if ((nextSlash = input.indexOf("/", 1)) === -1) {
          output.push(input);
          break;
        } else {
          output.push(input.slice(0, nextSlash));
          input = input.slice(nextSlash);
        }
      }
      return output.join("");
    }
    var HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
    var HOST_DELIM_RE = /[@/?#:]/g;
    var HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
    function reescapeHostDelimiters(host, isIP) {
      const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
      re.lastIndex = 0;
      return host.replace(re, (ch) => HOST_DELIMS[ch]);
    }
    function normalizePercentEncoding(input, decodeUnreserved = false) {
      if (input.indexOf("%") === -1) {
        return input;
      }
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decodeUnreserved && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        output += input[i];
      }
      return output;
    }
    function normalizePathEncoding(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decoded !== "." && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isPathCharacter(input[i])) {
          output += input[i];
        } else {
          output += escape(input[i]);
        }
      }
      return output;
    }
    function escapePreservingEscapes(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        output += escape(input[i]);
      }
      return output;
    }
    function recomposeAuthority(component) {
      const uriTokens = [];
      if (component.userinfo !== void 0) {
        uriTokens.push(component.userinfo);
        uriTokens.push("@");
      }
      if (component.host !== void 0) {
        let host = unescape(component.host);
        if (!isIPv4(host)) {
          const ipV6res = normalizeIPv6(host);
          if (ipV6res.isIPV6 === true) {
            host = `[${ipV6res.escapedHost}]`;
          } else {
            host = reescapeHostDelimiters(host, false);
          }
        }
        uriTokens.push(host);
      }
      if (typeof component.port === "number" || typeof component.port === "string") {
        uriTokens.push(":");
        uriTokens.push(String(component.port));
      }
      return uriTokens.length ? uriTokens.join("") : void 0;
    }
    module.exports = {
      nonSimpleDomain,
      recomposeAuthority,
      reescapeHostDelimiters,
      normalizePercentEncoding,
      normalizePathEncoding,
      escapePreservingEscapes,
      removeDotSegments,
      isIPv4,
      isUUID,
      normalizeIPv6,
      stringArrayToHexStripped
    };
  }
});

// node_modules/.bun/fast-uri@3.1.5/node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS({
  "node_modules/.bun/fast-uri@3.1.5/node_modules/fast-uri/lib/schemes.js"(exports, module) {
    "use strict";
    var { isUUID } = require_utils();
    var URN_REG = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu;
    var supportedSchemeNames = (
      /** @type {const} */
      [
        "http",
        "https",
        "ws",
        "wss",
        "urn",
        "urn:uuid"
      ]
    );
    function isValidSchemeName(name) {
      return supportedSchemeNames.indexOf(
        /** @type {*} */
        name
      ) !== -1;
    }
    function wsIsSecure(wsComponent) {
      if (wsComponent.secure === true) {
        return true;
      } else if (wsComponent.secure === false) {
        return false;
      } else if (wsComponent.scheme) {
        return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
      } else {
        return false;
      }
    }
    function httpParse(component) {
      if (!component.host) {
        component.error = component.error || "HTTP URIs must have a host.";
      }
      return component;
    }
    function httpSerialize(component) {
      const secure = String(component.scheme).toLowerCase() === "https";
      if (component.port === (secure ? 443 : 80) || component.port === "") {
        component.port = void 0;
      }
      if (!component.path) {
        component.path = "/";
      }
      return component;
    }
    function wsParse(wsComponent) {
      wsComponent.secure = wsIsSecure(wsComponent);
      wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
      wsComponent.path = void 0;
      wsComponent.query = void 0;
      return wsComponent;
    }
    function wsSerialize(wsComponent) {
      if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
        wsComponent.port = void 0;
      }
      if (typeof wsComponent.secure === "boolean") {
        wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
        wsComponent.secure = void 0;
      }
      if (wsComponent.resourceName) {
        const [path12, query] = wsComponent.resourceName.split("?");
        wsComponent.path = path12 && path12 !== "/" ? path12 : void 0;
        wsComponent.query = query;
        wsComponent.resourceName = void 0;
      }
      wsComponent.fragment = void 0;
      return wsComponent;
    }
    function urnParse(urnComponent, options) {
      if (!urnComponent.path) {
        urnComponent.error = "URN can not be parsed";
        return urnComponent;
      }
      const matches = urnComponent.path.match(URN_REG);
      if (matches) {
        const scheme = options.scheme || urnComponent.scheme || "urn";
        urnComponent.nid = matches[1].toLowerCase();
        urnComponent.nss = matches[2];
        const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
        const schemeHandler = getSchemeHandler(urnScheme);
        urnComponent.path = void 0;
        if (schemeHandler) {
          urnComponent = schemeHandler.parse(urnComponent, options);
        }
      } else {
        urnComponent.error = urnComponent.error || "URN can not be parsed.";
      }
      return urnComponent;
    }
    function urnSerialize(urnComponent, options) {
      if (urnComponent.nid === void 0) {
        throw new Error("URN without nid cannot be serialized");
      }
      const scheme = options.scheme || urnComponent.scheme || "urn";
      const nid = urnComponent.nid.toLowerCase();
      const urnScheme = `${scheme}:${options.nid || nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      if (schemeHandler) {
        urnComponent = schemeHandler.serialize(urnComponent, options);
      }
      const uriComponent = urnComponent;
      const nss = urnComponent.nss;
      uriComponent.path = `${nid || options.nid}:${nss}`;
      options.skipEscape = true;
      return uriComponent;
    }
    function urnuuidParse(urnComponent, options) {
      const uuidComponent = urnComponent;
      uuidComponent.uuid = uuidComponent.nss;
      uuidComponent.nss = void 0;
      if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
        uuidComponent.error = uuidComponent.error || "UUID is not valid.";
      }
      return uuidComponent;
    }
    function urnuuidSerialize(uuidComponent) {
      const urnComponent = uuidComponent;
      urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
      return urnComponent;
    }
    var http = (
      /** @type {SchemeHandler} */
      {
        scheme: "http",
        domainHost: true,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var https = (
      /** @type {SchemeHandler} */
      {
        scheme: "https",
        domainHost: http.domainHost,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var ws = (
      /** @type {SchemeHandler} */
      {
        scheme: "ws",
        domainHost: true,
        parse: wsParse,
        serialize: wsSerialize
      }
    );
    var wss = (
      /** @type {SchemeHandler} */
      {
        scheme: "wss",
        domainHost: ws.domainHost,
        parse: ws.parse,
        serialize: ws.serialize
      }
    );
    var urn = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn",
        parse: urnParse,
        serialize: urnSerialize,
        skipNormalize: true
      }
    );
    var urnuuid = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn:uuid",
        parse: urnuuidParse,
        serialize: urnuuidSerialize,
        skipNormalize: true
      }
    );
    var SCHEMES = (
      /** @type {Record<SchemeName, SchemeHandler>} */
      {
        http,
        https,
        ws,
        wss,
        urn,
        "urn:uuid": urnuuid
      }
    );
    Object.setPrototypeOf(SCHEMES, null);
    function getSchemeHandler(scheme) {
      return scheme && (SCHEMES[
        /** @type {SchemeName} */
        scheme
      ] || SCHEMES[
        /** @type {SchemeName} */
        scheme.toLowerCase()
      ]) || void 0;
    }
    module.exports = {
      wsIsSecure,
      SCHEMES,
      isValidSchemeName,
      getSchemeHandler
    };
  }
});

// node_modules/.bun/fast-uri@3.1.5/node_modules/fast-uri/index.js
var require_fast_uri = __commonJS({
  "node_modules/.bun/fast-uri@3.1.5/node_modules/fast-uri/index.js"(exports, module) {
    "use strict";
    var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, escapePreservingEscapes, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
    var { SCHEMES, getSchemeHandler } = require_schemes();
    function normalize2(uri, options) {
      if (typeof uri === "string") {
        uri = /** @type {T} */
        normalizeString(uri, options);
      } else if (typeof uri === "object") {
        uri = /** @type {T} */
        parse2(serialize(uri, options), options);
      }
      return uri;
    }
    function resolve(baseURI, relativeURI, options) {
      const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
      const { parsed: baseParsed, malformedAuthorityOrPort: baseMalformed } = parseWithStatus(baseURI, schemelessOptions);
      const { parsed: relativeParsed, malformedAuthorityOrPort: relativeMalformed } = parseWithStatus(relativeURI, schemelessOptions);
      if (baseMalformed || relativeMalformed) {
        throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
      }
      const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
      schemelessOptions.skipEscape = true;
      return serialize(resolved, schemelessOptions);
    }
    function resolveComponent(base, relative, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse2(serialize(base, options), options);
        relative = parse2(serialize(relative, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative.scheme) {
        target.scheme = relative.scheme;
        target.userinfo = relative.userinfo;
        target.host = relative.host;
        target.port = relative.port;
        target.path = removeDotSegments(relative.path || "");
        target.query = relative.query;
      } else {
        if (relative.userinfo !== void 0 || relative.host !== void 0 || relative.port !== void 0) {
          target.userinfo = relative.userinfo;
          target.host = relative.host;
          target.port = relative.port;
          target.path = removeDotSegments(relative.path || "");
          target.query = relative.query;
        } else {
          if (!relative.path) {
            target.path = base.path;
            if (relative.query !== void 0) {
              target.query = relative.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative.path[0] === "/") {
              target.path = removeDotSegments(relative.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative.path;
              } else if (!base.path) {
                target.path = relative.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative.fragment;
      return target;
    }
    function equal(uriA, uriB, options) {
      const normalizedA = normalizeComparableURI(uriA, options);
      const normalizedB = normalizeComparableURI(uriB, options);
      return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA.toLowerCase() === normalizedB.toLowerCase();
    }
    function serialize(cmpts, opts) {
      const component = {
        host: cmpts.host,
        scheme: cmpts.scheme,
        userinfo: cmpts.userinfo,
        port: cmpts.port,
        path: cmpts.path,
        query: cmpts.query,
        nid: cmpts.nid,
        nss: cmpts.nss,
        uuid: cmpts.uuid,
        fragment: cmpts.fragment,
        reference: cmpts.reference,
        resourceName: cmpts.resourceName,
        secure: cmpts.secure,
        error: ""
      };
      const options = Object.assign({}, opts);
      const uriTokens = [];
      const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
      if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
      if (component.path !== void 0) {
        if (!options.skipEscape) {
          component.path = escapePreservingEscapes(component.path);
          if (component.scheme !== void 0) {
            component.path = component.path.split("%3A").join(":");
          }
        } else {
          component.path = normalizePercentEncoding(component.path);
        }
      }
      if (options.reference !== "suffix" && component.scheme) {
        uriTokens.push(component.scheme, ":");
      }
      const authority = recomposeAuthority(component);
      if (authority !== void 0) {
        if (options.reference !== "suffix") {
          uriTokens.push("//");
        }
        uriTokens.push(authority);
        if (component.path && component.path[0] !== "/") {
          uriTokens.push("/");
        }
      }
      if (component.path !== void 0) {
        let s = component.path;
        if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
          s = removeDotSegments(s);
        }
        if (authority === void 0 && s[0] === "/" && s[1] === "/") {
          s = "/%2F" + s.slice(2);
        }
        uriTokens.push(s);
      }
      if (component.query !== void 0) {
        uriTokens.push("?", component.query);
      }
      if (component.fragment !== void 0) {
        uriTokens.push("#", component.fragment);
      }
      return uriTokens.join("");
    }
    var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
    var AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
    var AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
    function getParseError(parsed, matches) {
      if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") {
        return 'URI path must start with "/" when authority is present.';
      }
      if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
        return "URI port is malformed.";
      }
      return void 0;
    }
    function parseWithStatus(uri, opts) {
      const options = Object.assign({}, opts);
      const parsed = {
        scheme: void 0,
        userinfo: void 0,
        host: "",
        port: void 0,
        path: "",
        query: void 0,
        fragment: void 0
      };
      let malformedAuthorityOrPort = false;
      let isIP = false;
      if (options.reference === "suffix") {
        if (options.scheme) {
          uri = options.scheme + ":" + uri;
        } else {
          uri = "//" + uri;
        }
      }
      const authorityMatch = uri.match(AUTHORITY_PREFIX);
      if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
        parsed.error = "URI authority must not contain a literal backslash.";
        malformedAuthorityOrPort = true;
      }
      const introducerMatch = uri.match(AUTHORITY_INTRODUCER_REGION);
      if (introducerMatch !== null) {
        const region = introducerMatch[1];
        const normalizedRegion = region.replace(/[\t\n\r]/g, "");
        if (normalizedRegion.length >= 2) {
          if (normalizedRegion.slice(0, 2) !== "//") {
            parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
            malformedAuthorityOrPort = true;
          } else if (region.length !== normalizedRegion.length) {
            parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
            malformedAuthorityOrPort = true;
          }
        }
      }
      const matches = uri.match(URI_PARSE);
      if (matches) {
        parsed.scheme = matches[1];
        parsed.userinfo = matches[3];
        parsed.host = matches[4];
        parsed.port = parseInt(matches[5], 10);
        parsed.path = matches[6] || "";
        parsed.query = matches[7];
        parsed.fragment = matches[8];
        if (isNaN(parsed.port)) {
          parsed.port = matches[5];
        }
        const parseError = getParseError(parsed, matches);
        if (parseError !== void 0) {
          parsed.error = parsed.error || parseError;
          malformedAuthorityOrPort = true;
        }
        if (parsed.host) {
          const ipv4result = isIPv4(parsed.host);
          if (ipv4result === false) {
            const ipv6result = normalizeIPv6(parsed.host);
            parsed.host = ipv6result.host.toLowerCase();
            isIP = ipv6result.isIPV6;
          } else {
            isIP = true;
          }
        }
        if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
          parsed.reference = "same-document";
        } else if (parsed.scheme === void 0) {
          parsed.reference = "relative";
        } else if (parsed.fragment === void 0) {
          parsed.reference = "absolute";
        } else {
          parsed.reference = "uri";
        }
        if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
          parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
        }
        const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
        if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
          if (parsed.host && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
            try {
              parsed.host = new URL("http://" + parsed.host).hostname;
            } catch (e) {
              parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
            }
          }
        }
        if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
          if (uri.indexOf("%") !== -1) {
            if (parsed.scheme !== void 0) {
              parsed.scheme = unescape(parsed.scheme);
            }
            if (parsed.host !== void 0) {
              parsed.host = reescapeHostDelimiters(unescape(parsed.host), isIP);
            }
          }
          if (parsed.path) {
            parsed.path = normalizePathEncoding(parsed.path);
          }
          if (parsed.fragment) {
            try {
              parsed.fragment = encodeURI(decodeURIComponent(parsed.fragment));
            } catch {
              parsed.error = parsed.error || "URI malformed";
            }
          }
        }
        if (schemeHandler && schemeHandler.parse) {
          schemeHandler.parse(parsed, options);
        }
      } else {
        parsed.error = parsed.error || "URI can not be parsed.";
      }
      return { parsed, malformedAuthorityOrPort };
    }
    function parse2(uri, opts) {
      return parseWithStatus(uri, opts).parsed;
    }
    function normalizeString(uri, opts) {
      return normalizeStringWithStatus(uri, opts).normalized;
    }
    function normalizeStringWithStatus(uri, opts) {
      const { parsed, malformedAuthorityOrPort } = parseWithStatus(uri, opts);
      return {
        normalized: malformedAuthorityOrPort ? uri : serialize(parsed, opts),
        malformedAuthorityOrPort
      };
    }
    function normalizeComparableURI(uri, opts) {
      if (typeof uri === "string") {
        const { normalized, malformedAuthorityOrPort } = normalizeStringWithStatus(uri, opts);
        return malformedAuthorityOrPort ? void 0 : normalized;
      }
      if (typeof uri === "object") {
        return serialize(uri, opts);
      }
    }
    var fastUri = {
      SCHEMES,
      normalize: normalize2,
      resolve,
      resolveComponent,
      equal,
      serialize,
      parse: parse2
    };
    module.exports = fastUri;
    module.exports.default = fastUri;
    module.exports.fastUri = fastUri;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/runtime/uri.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var uri = require_fast_uri();
    uri.code = 'require("ajv/dist/runtime/uri").default';
    exports.default = uri;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/core.js
var require_core = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/core.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    var ref_error_1 = require_ref_error();
    var rules_1 = require_rules();
    var compile_1 = require_compile();
    var codegen_2 = require_codegen();
    var resolve_1 = require_resolve();
    var dataType_1 = require_dataType();
    var util_1 = require_util();
    var $dataRefSchema = require_data();
    var uri_1 = require_uri();
    var defaultRegExp = (str, flags) => new RegExp(str, flags);
    defaultRegExp.code = "new RegExp";
    var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    var EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    var removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    var deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    var MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    var Ajv2 = class {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = {};
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
      }
      defaultMeta() {
        const { meta, schemaId } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid;
      }
      compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref, missingRef }) {
          if (this.refs[ref]) {
            throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref) {
          const _schema = await _loadSchema.call(this, ref);
          if (!this.refs[ref])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref])
            this.addSchema(_schema, ref, meta);
        }
        async function _loadSchema(ref) {
          const p = this._loading[ref];
          if (p)
            return p;
          try {
            return await (this._loading[ref] = loadSchema(ref));
          } finally {
            delete this._loading[ref];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema)) {
          for (const sch of schema)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id;
        if (typeof schema === "object") {
          const { schemaId } = this.opts;
          id = schema[schemaId];
          if (id !== void 0 && typeof id != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
          return true;
        let $schema;
        $schema = schema.$schema;
        if ($schema !== void 0 && typeof $schema != "string") {
          throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema, schema);
        if (!valid && throwOrLogError) {
          const message = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message);
          else
            throw new Error(message);
        }
        return valid;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId } = this.opts;
          const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id = schemaKeyRef[this.opts.schemaId];
            if (id) {
              id = (0, resolve_1.normalizeId)(id);
              delete this.schemas[id];
              delete this.refs[id];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions) {
        for (const def of definitions)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword;
        if (typeof kwdOrDef == "string") {
          keyword = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword = def.keyword;
          if (Array.isArray(keyword) && !keyword.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword, def);
        if (!def) {
          (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword) {
        const rule = this.RULES.all[keyword];
        return typeof rule == "object" ? rule.definition : !!rule;
      }
      // Remove keyword
      removeKeyword(keyword) {
        const { RULES } = this;
        delete RULES.keywords[keyword];
        delete RULES.all[keyword];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule) => rule.keyword === keyword);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name, format) {
        if (typeof format == "string")
          format = new RegExp(format);
        this.formats[name] = format;
        return this;
      }
      errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors || errors.length === 0)
          return "No errors";
        return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules) {
            const rule = rules[key];
            if (typeof rule != "object")
              continue;
            const { $data } = rule.definition;
            const schema = keywords[key];
            if ($data && schema)
              keywords[key] = schemaOrData(schema);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId } = this.opts;
        if (typeof schema == "object") {
          id = schema[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema, true);
        return sch;
      }
      _checkUnique(id) {
        if (this.schemas[id] || this.refs[id]) {
          throw new Error(`schema with key or id "${id}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    };
    Ajv2.ValidationError = validation_error_1.default;
    Ajv2.MissingRefError = ref_error_1.default;
    exports.default = Ajv2;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name in this.opts.formats) {
        const format = this.opts.formats[name];
        if (format)
          this.addFormat(name, format);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword in defs) {
        const def = defs[keyword];
        if (!def.keyword)
          def.keyword = keyword;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    var noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword, definition, dataType) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
      if (!ruleGroup) {
        ruleGroup = { type: dataType, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword] = true;
      if (!definition)
        return;
      const rule = {
        keyword,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
      else
        ruleGroup.rules.push(rule);
      RULES.all[keyword] = rule;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
      } else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    var $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
      return { anyOf: [schema, $dataRef] };
    }
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/core/id.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var def = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/core/ref.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.callRef = exports.getValidate = void 0;
    var ref_error_1 = require_ref_error();
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var util_1 = require_util();
    var def = {
      keyword: "$ref",
      schemaType: "string",
      code(cxt) {
        const { gen, schema: $ref, it } = cxt;
        const { baseId, schemaEnv: env, validateName, opts, self } = it;
        const { root } = env;
        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
          return callRootRef();
        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
        if (schOrEnv === void 0)
          throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
        if (schOrEnv instanceof compile_1.SchemaEnv)
          return callValidate(schOrEnv);
        return inlineRefSchema(schOrEnv);
        function callRootRef() {
          if (env === root)
            return callRef(cxt, validateName, env, env.$async);
          const rootName = gen.scopeValue("root", { ref: root });
          return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
        }
        function callValidate(sch) {
          const v = getValidate(cxt, sch);
          callRef(cxt, v, sch, sch.$async);
        }
        function inlineRefSchema(sch) {
          const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
          const valid = gen.name("valid");
          const schCxt = cxt.subschema({
            schema: sch,
            dataTypes: [],
            schemaPath: codegen_1.nil,
            topSchemaRef: schName,
            errSchemaPath: $ref
          }, valid);
          cxt.mergeEvaluated(schCxt);
          cxt.ok(valid);
        }
      }
    };
    function getValidate(cxt, sch) {
      const { gen } = cxt;
      return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
    }
    exports.getValidate = getValidate;
    function callRef(cxt, v, sch, $async) {
      const { gen, it } = cxt;
      const { allErrors, schemaEnv: env, opts } = it;
      const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
      if ($async)
        callAsyncRef();
      else
        callSyncRef();
      function callAsyncRef() {
        if (!env.$async)
          throw new Error("async schema referenced by sync schema");
        const valid = gen.let("valid");
        gen.try(() => {
          gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
          addEvaluatedFrom(v);
          if (!allErrors)
            gen.assign(valid, true);
        }, (e) => {
          gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
          addErrorsFrom(e);
          if (!allErrors)
            gen.assign(valid, false);
        });
        cxt.ok(valid);
      }
      function callSyncRef() {
        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
      }
      function addErrorsFrom(source) {
        const errs = (0, codegen_1._)`${source}.errors`;
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
        gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      }
      function addEvaluatedFrom(source) {
        var _a;
        if (!it.opts.unevaluated)
          return;
        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
        if (it.props !== true) {
          if (schEvaluated && !schEvaluated.dynamicProps) {
            if (schEvaluated.props !== void 0) {
              it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
            }
          } else {
            const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
            it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
          }
        }
        if (it.items !== true) {
          if (schEvaluated && !schEvaluated.dynamicItems) {
            if (schEvaluated.items !== void 0) {
              it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
            }
          } else {
            const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
            it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
          }
        }
      }
    }
    exports.callRef = callRef;
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/core/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var id_1 = require_id();
    var ref_1 = require_ref();
    var core = [
      "$schema",
      "$id",
      "$defs",
      "$vocabulary",
      { keyword: "$comment" },
      "definitions",
      id_1.default,
      ref_1.default
    ];
    exports.default = core;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitNumber.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    var def = {
      keyword: Object.keys(KWDs),
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/multipleOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
      params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
    };
    var def = {
      keyword: "multipleOf",
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, it } = cxt;
        const prec = it.opts.multipleOfPrecision;
        const res = gen.let("res");
        const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
        cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitLength.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var ucs2length_1 = require_ucs2length();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxLength" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxLength", "minLength"],
      type: "string",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode, it } = cxt;
        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
        const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
        cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/pattern.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
    };
    var def = {
      keyword: "pattern",
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { data, $data, schema, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        const regExp = $data ? (0, codegen_1._)`(new RegExp(${schemaCode}, ${u}))` : (0, code_1.usePattern)(cxt, schema);
        cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxProperties" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxProperties", "minProperties"],
      type: "object",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/required.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
      params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
    };
    var def = {
      keyword: "required",
      type: "object",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, schema, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema.length === 0)
          return;
        const useLoop = schema.length >= opts.loopRequired;
        if (it.allErrors)
          allErrorsMode();
        else
          exitOnErrorMode();
        if (opts.strictRequired) {
          const props = cxt.parentSchema.properties;
          const { definedProperties } = cxt.it;
          for (const requiredKey of schema) {
            if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
              const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
              const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
              (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
            }
          }
        }
        function allErrorsMode() {
          if (useLoop || $data) {
            cxt.block$data(codegen_1.nil, loopAllRequired);
          } else {
            for (const prop of schema) {
              (0, code_1.checkReportMissingProp)(cxt, prop);
            }
          }
        }
        function exitOnErrorMode() {
          const missing = gen.let("missing");
          if (useLoop || $data) {
            const valid = gen.let("valid", true);
            cxt.block$data(valid, () => loopUntilMissing(missing, valid));
            cxt.ok(valid);
          } else {
            gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
            (0, code_1.reportMissingProp)(cxt, missing);
            gen.else();
          }
        }
        function loopAllRequired() {
          gen.forOf("prop", schemaCode, (prop) => {
            cxt.setParams({ missingProperty: prop });
            gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
          });
        }
        function loopUntilMissing(missing, valid) {
          cxt.setParams({ missingProperty: missing });
          gen.forOf(missing, schemaCode, () => {
            gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.error();
              gen.break();
            });
          }, codegen_1.nil);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxItems" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxItems", "minItems"],
      type: "array",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/runtime/equal.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports.default = equal;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/uniqueItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dataType_1 = require_dataType();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
      params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
    };
    var def = {
      keyword: "uniqueItems",
      type: "array",
      schemaType: "boolean",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema)
          return;
        const valid = gen.let("valid");
        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
        cxt.ok(valid);
        function validateUniqueItems() {
          const i = gen.let("i", (0, codegen_1._)`${data}.length`);
          const j = gen.let("j");
          cxt.setParams({ i, j });
          gen.assign(valid, true);
          gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
        }
        function canOptimize() {
          return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
        }
        function loopN(i, j) {
          const item = gen.name("item");
          const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
          const indices = gen.const("indices", (0, codegen_1._)`{}`);
          gen.for((0, codegen_1._)`;${i}--;`, () => {
            gen.let(item, (0, codegen_1._)`${data}[${i}]`);
            gen.if(wrongType, (0, codegen_1._)`continue`);
            if (itemTypes.length > 1)
              gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
            gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
              gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
              cxt.error();
              gen.assign(valid, false).break();
            }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
          });
        }
        function loopN2(i, j) {
          const eql = (0, util_1.useFunc)(gen, equal_1.default);
          const outer = gen.name("outer");
          gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
            cxt.error();
            gen.assign(valid, false).break(outer);
          })));
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/const.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to constant",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
    };
    var def = {
      keyword: "const",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schemaCode, schema } = cxt;
        if ($data || schema && typeof schema == "object") {
          cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        } else {
          cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/enum.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to one of the allowed values",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
    };
    var def = {
      keyword: "enum",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        if (!$data && schema.length === 0)
          throw new Error("enum must have non-empty array");
        const useLoop = schema.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
        let valid;
        if (useLoop || $data) {
          valid = gen.let("valid");
          cxt.block$data(valid, loopEnum);
        } else {
          if (!Array.isArray(schema))
            throw new Error("ajv implementation error");
          const vSchema = gen.const("vSchema", schemaCode);
          valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
          gen.assign(valid, false);
          gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
          const sch = schema[i];
          return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var limitNumber_1 = require_limitNumber();
    var multipleOf_1 = require_multipleOf();
    var limitLength_1 = require_limitLength();
    var pattern_1 = require_pattern();
    var limitProperties_1 = require_limitProperties();
    var required_1 = require_required();
    var limitItems_1 = require_limitItems();
    var uniqueItems_1 = require_uniqueItems();
    var const_1 = require_const();
    var enum_1 = require_enum();
    var validation = [
      // number
      limitNumber_1.default,
      multipleOf_1.default,
      // string
      limitLength_1.default,
      pattern_1.default,
      // object
      limitProperties_1.default,
      required_1.default,
      // array
      limitItems_1.default,
      uniqueItems_1.default,
      // any
      { keyword: "type", schemaType: ["string", "array"] },
      { keyword: "nullable", schemaType: "boolean" },
      const_1.default,
      enum_1.default
    ];
    exports.default = validation;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/additionalItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateAdditionalItems = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "additionalItems",
      type: "array",
      schemaType: ["boolean", "object"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { parentSchema, it } = cxt;
        const { items } = parentSchema;
        if (!Array.isArray(items)) {
          (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
          return;
        }
        validateAdditionalItems(cxt, items);
      }
    };
    function validateAdditionalItems(cxt, items) {
      const { gen, schema, data, keyword, it } = cxt;
      it.items = true;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
        cxt.ok(valid);
      }
      function validateItems(valid) {
        gen.forRange("i", items.length, len, (i) => {
          cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
    exports.validateAdditionalItems = validateAdditionalItems;
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/items.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateTuple = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "array", "boolean"],
      before: "uniqueItems",
      code(cxt) {
        const { schema, it } = cxt;
        if (Array.isArray(schema))
          return validateTuple(cxt, "additionalItems", schema);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    function validateTuple(cxt, extraItems, schArr = cxt.schema) {
      const { gen, parentSchema, data, keyword, it } = cxt;
      checkStrictTuple(parentSchema);
      if (it.opts.unevaluated && schArr.length && it.items !== true) {
        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
      }
      const valid = gen.name("valid");
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      schArr.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
          keyword,
          schemaProp: i,
          dataProp: i
        }, valid));
        cxt.ok(valid);
      });
      function checkStrictTuple(sch) {
        const { opts, errSchemaPath } = it;
        const l = schArr.length;
        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
        if (opts.strictTuples && !fullTuple) {
          const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
          (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
        }
      }
    }
    exports.validateTuple = validateTuple;
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/prefixItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var items_1 = require_items();
    var def = {
      keyword: "prefixItems",
      type: "array",
      schemaType: ["array"],
      before: "uniqueItems",
      code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/items2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var additionalItems_1 = require_additionalItems();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { schema, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        if (prefixItems)
          (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
        else
          cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/contains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
      params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
    };
    var def = {
      keyword: "contains",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        let min;
        let max;
        const { minContains, maxContains } = parentSchema;
        if (it.opts.next) {
          min = minContains === void 0 ? 1 : minContains;
          max = maxContains;
        } else {
          min = 1;
        }
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        cxt.setParams({ min, max });
        if (max === void 0 && min === 0) {
          (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
          return;
        }
        if (max !== void 0 && min > max) {
          (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
          cxt.fail();
          return;
        }
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          let cond = (0, codegen_1._)`${len} >= ${min}`;
          if (max !== void 0)
            cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
          cxt.pass(cond);
          return;
        }
        it.items = true;
        const valid = gen.name("valid");
        if (max === void 0 && min === 1) {
          validateItems(valid, () => gen.if(valid, () => gen.break()));
        } else if (min === 0) {
          gen.let(valid, true);
          if (max !== void 0)
            gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
        } else {
          gen.let(valid, false);
          validateItemsWithCount();
        }
        cxt.result(valid, () => cxt.reset());
        function validateItemsWithCount() {
          const schValid = gen.name("_valid");
          const count = gen.let("count", 0);
          validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
        }
        function validateItems(_valid, block) {
          gen.forRange("i", 0, len, (i) => {
            cxt.subschema({
              keyword: "contains",
              dataProp: i,
              dataPropType: util_1.Type.Num,
              compositeRule: true
            }, _valid);
            block();
          });
        }
        function checkLimits(count) {
          gen.code((0, codegen_1._)`${count}++`);
          if (max === void 0) {
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
          } else {
            gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
            if (min === 1)
              gen.assign(valid, true);
            else
              gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/dependencies.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    exports.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    var def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
          },
          () => gen.var(valid, true)
          // TODO var
        );
        cxt.ok(valid);
      }
    }
    exports.validateSchemaDeps = validateSchemaDeps;
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/propertyNames.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "property name must be valid",
      params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
    };
    var def = {
      keyword: "propertyNames",
      type: "object",
      schemaType: ["object", "boolean"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        const valid = gen.name("valid");
        gen.forIn("key", data, (key) => {
          cxt.setParams({ propertyName: key });
          cxt.subschema({
            keyword: "propertyNames",
            data: key,
            dataTypes: ["string"],
            propertyName: key,
            compositeRule: true
          }, valid);
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error(true);
            if (!it.allErrors)
              gen.break();
          });
        });
        cxt.ok(valid);
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var util_1 = require_util();
    var error = {
      message: "must NOT have additional properties",
      params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
    };
    var def = {
      keyword: "additionalProperties",
      type: ["object"],
      schemaType: ["boolean", "object"],
      allowUndefined: true,
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
          return;
        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
        checkAdditionalProperties();
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function checkAdditionalProperties() {
          gen.forIn("key", data, (key) => {
            if (!props.length && !patProps.length)
              additionalPropertyCode(key);
            else
              gen.if(isAdditional(key), () => additionalPropertyCode(key));
          });
        }
        function isAdditional(key) {
          let definedProp;
          if (props.length > 8) {
            const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
            definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
          } else if (props.length) {
            definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
          } else {
            definedProp = codegen_1.nil;
          }
          if (patProps.length) {
            definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
          }
          return (0, codegen_1.not)(definedProp);
        }
        function deleteAdditional(key) {
          gen.code((0, codegen_1._)`delete ${data}[${key}]`);
        }
        function additionalPropertyCode(key) {
          if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
            deleteAdditional(key);
            return;
          }
          if (schema === false) {
            cxt.setParams({ additionalProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            if (opts.removeAdditional === "failing") {
              applyAdditionalSchema(key, valid, false);
              gen.if((0, codegen_1.not)(valid), () => {
                cxt.reset();
                deleteAdditional(key);
              });
            } else {
              applyAdditionalSchema(key, valid);
              if (!allErrors)
                gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          }
        }
        function applyAdditionalSchema(key, valid, errors) {
          const subschema = {
            keyword: "additionalProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          };
          if (errors === false) {
            Object.assign(subschema, {
              compositeRule: true,
              createErrors: false,
              allErrors: false
            });
          }
          cxt.subschema(subschema, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/properties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var validate_1 = require_validate();
    var code_1 = require_code2();
    var util_1 = require_util();
    var additionalProperties_1 = require_additionalProperties();
    var def = {
      keyword: "properties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
          additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema);
        for (const prop of allProps) {
          it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
          it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
        if (properties.length === 0)
          return;
        const valid = gen.name("valid");
        for (const prop of properties) {
          if (hasDefault(prop)) {
            applyPropertySchema(prop);
          } else {
            gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
            applyPropertySchema(prop);
            if (!it.allErrors)
              gen.else().var(valid, true);
            gen.endIf();
          }
          cxt.it.definedProperties.add(prop);
          cxt.ok(valid);
        }
        function hasDefault(prop) {
          return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
        }
        function applyPropertySchema(prop) {
          cxt.subschema({
            keyword: "properties",
            schemaProp: prop,
            dataProp: prop
          }, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/patternProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var util_2 = require_util();
    var def = {
      keyword: "patternProperties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
        if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
          return;
        }
        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
        const valid = gen.name("valid");
        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
          it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
        }
        const { props } = it;
        validatePatternProperties();
        function validatePatternProperties() {
          for (const pat of patterns) {
            if (checkProperties)
              checkMatchingProperties(pat);
            if (it.allErrors) {
              validateProperties(pat);
            } else {
              gen.var(valid, true);
              validateProperties(pat);
              gen.if(valid);
            }
          }
        }
        function checkMatchingProperties(pat) {
          for (const prop in checkProperties) {
            if (new RegExp(pat).test(prop)) {
              (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
            }
          }
        }
        function validateProperties(pat) {
          gen.forIn("key", data, (key) => {
            gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
              const alwaysValid = alwaysValidPatterns.includes(pat);
              if (!alwaysValid) {
                cxt.subschema({
                  keyword: "patternProperties",
                  schemaProp: pat,
                  dataProp: key,
                  dataPropType: util_2.Type.Str
                }, valid);
              }
              if (it.opts.unevaluated && props !== true) {
                gen.assign((0, codegen_1._)`${props}[${key}]`, true);
              } else if (!alwaysValid && !it.allErrors) {
                gen.if((0, codegen_1.not)(valid), () => gen.break());
              }
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/not.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "not",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      code(cxt) {
        const { gen, schema, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          cxt.fail();
          return;
        }
        const valid = gen.name("valid");
        cxt.subschema({
          keyword: "not",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, valid);
        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
      },
      error: { message: "must NOT be valid" }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/anyOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var def = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: true,
      code: code_1.validateUnion,
      error: { message: "must match a schema in anyOf" }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/oneOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "must match exactly one schema in oneOf",
      params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
    };
    var def = {
      keyword: "oneOf",
      schemaType: "array",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
          return;
        const schArr = schema;
        const valid = gen.let("valid", false);
        const passing = gen.let("passing", null);
        const schValid = gen.name("_valid");
        cxt.setParams({ passing });
        gen.block(validateOneOf);
        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
        function validateOneOf() {
          schArr.forEach((sch, i) => {
            let schCxt;
            if ((0, util_1.alwaysValidSchema)(it, sch)) {
              gen.var(schValid, true);
            } else {
              schCxt = cxt.subschema({
                keyword: "oneOf",
                schemaProp: i,
                compositeRule: true
              }, schValid);
            }
            if (i > 0) {
              gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
            }
            gen.if(schValid, () => {
              gen.assign(valid, true);
              gen.assign(passing, i);
              if (schCxt)
                cxt.mergeEvaluated(schCxt, codegen_1.Name);
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/allOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "allOf",
      schemaType: "array",
      code(cxt) {
        const { gen, schema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema.forEach((sch, i) => {
          if ((0, util_1.alwaysValidSchema)(it, sch))
            return;
          const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
          cxt.ok(valid);
          cxt.mergeEvaluated(schCxt);
        });
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/if.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
      params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
    };
    var def = {
      keyword: "if",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, parentSchema, it } = cxt;
        if (parentSchema.then === void 0 && parentSchema.else === void 0) {
          (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
        }
        const hasThen = hasSchema(it, "then");
        const hasElse = hasSchema(it, "else");
        if (!hasThen && !hasElse)
          return;
        const valid = gen.let("valid", true);
        const schValid = gen.name("_valid");
        validateIf();
        cxt.reset();
        if (hasThen && hasElse) {
          const ifClause = gen.let("ifClause");
          cxt.setParams({ ifClause });
          gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
        } else if (hasThen) {
          gen.if(schValid, validateClause("then"));
        } else {
          gen.if((0, codegen_1.not)(schValid), validateClause("else"));
        }
        cxt.pass(valid, () => cxt.error(true));
        function validateIf() {
          const schCxt = cxt.subschema({
            keyword: "if",
            compositeRule: true,
            createErrors: false,
            allErrors: false
          }, schValid);
          cxt.mergeEvaluated(schCxt);
        }
        function validateClause(keyword, ifClause) {
          return () => {
            const schCxt = cxt.subschema({ keyword }, schValid);
            gen.assign(valid, schValid);
            cxt.mergeValidEvaluated(schCxt, valid);
            if (ifClause)
              gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
            else
              cxt.setParams({ ifClause: keyword });
          };
        }
      }
    };
    function hasSchema(it, keyword) {
      const schema = it.schema[keyword];
      return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
    }
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/thenElse.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["then", "else"],
      schemaType: ["object", "boolean"],
      code({ keyword, parentSchema, it }) {
        if (parentSchema.if === void 0)
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var additionalItems_1 = require_additionalItems();
    var prefixItems_1 = require_prefixItems();
    var items_1 = require_items();
    var items2020_1 = require_items2020();
    var contains_1 = require_contains();
    var dependencies_1 = require_dependencies();
    var propertyNames_1 = require_propertyNames();
    var additionalProperties_1 = require_additionalProperties();
    var properties_1 = require_properties();
    var patternProperties_1 = require_patternProperties();
    var not_1 = require_not();
    var anyOf_1 = require_anyOf();
    var oneOf_1 = require_oneOf();
    var allOf_1 = require_allOf();
    var if_1 = require_if();
    var thenElse_1 = require_thenElse();
    function getApplicator(draft2020 = false) {
      const applicator = [
        // any
        not_1.default,
        anyOf_1.default,
        oneOf_1.default,
        allOf_1.default,
        if_1.default,
        thenElse_1.default,
        // object
        propertyNames_1.default,
        additionalProperties_1.default,
        dependencies_1.default,
        properties_1.default,
        patternProperties_1.default
      ];
      if (draft2020)
        applicator.push(prefixItems_1.default, items2020_1.default);
      else
        applicator.push(additionalItems_1.default, items_1.default);
      applicator.push(contains_1.default);
      return applicator;
    }
    exports.default = getApplicator;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/format/format.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
    };
    var def = {
      keyword: "format",
      type: ["number", "string"],
      schemaType: "string",
      $data: true,
      error,
      code(cxt, ruleType) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const { opts, errSchemaPath, schemaEnv, self } = it;
        if (!opts.validateFormats)
          return;
        if ($data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
          const fType = gen.let("fType");
          const format = gen.let("format");
          gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
          cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
          function unknownFmt() {
            if (opts.strictSchema === false)
              return codegen_1.nil;
            return (0, codegen_1._)`${schemaCode} && !${format}`;
          }
          function invalidFmt() {
            const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
            const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
            return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
          }
        }
        function validateFormat() {
          const formatDef = self.formats[schema];
          if (!formatDef) {
            unknownFormat();
            return;
          }
          if (formatDef === true)
            return;
          const [fmtType, format, fmtRef] = getFormat(formatDef);
          if (fmtType === ruleType)
            cxt.pass(validCondition());
          function unknownFormat() {
            if (opts.strictSchema === false) {
              self.logger.warn(unknownMsg());
              return;
            }
            throw new Error(unknownMsg());
            function unknownMsg() {
              return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
            }
          }
          function getFormat(fmtDef) {
            const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
            const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
            if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
              return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
            }
            return ["string", fmtDef, fmt];
          }
          function validCondition() {
            if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
              if (!schemaEnv.$async)
                throw new Error("async format in sync schema");
              return (0, codegen_1._)`await ${fmtRef}(${data})`;
            }
            return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/format/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var format_1 = require_format();
    var format = [format_1.default];
    exports.default = format;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/metadata.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.contentVocabulary = exports.metadataVocabulary = void 0;
    exports.metadataVocabulary = [
      "title",
      "description",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples"
    ];
    exports.contentVocabulary = [
      "contentMediaType",
      "contentEncoding",
      "contentSchema"
    ];
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/draft7.js
var require_draft7 = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/draft7.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation();
    var applicator_1 = require_applicator();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft7Vocabularies = [
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary
    ];
    exports.default = draft7Vocabularies;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/discriminator/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DiscrError = void 0;
    var DiscrError;
    (function(DiscrError2) {
      DiscrError2["Tag"] = "tag";
      DiscrError2["Mapping"] = "mapping";
    })(DiscrError || (exports.DiscrError = DiscrError = {}));
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/vocabularies/discriminator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var types_1 = require_types();
    var compile_1 = require_compile();
    var ref_error_1 = require_ref_error();
    var util_1 = require_util();
    var error = {
      message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
      params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
    };
    var def = {
      keyword: "discriminator",
      type: "object",
      schemaType: "object",
      error,
      code(cxt) {
        const { gen, data, schema, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
          throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema.propertyName;
        if (typeof tagName != "string")
          throw new Error("discriminator: requires propertyName");
        if (schema.mapping)
          throw new Error("discriminator: mapping is not supported");
        if (!oneOf)
          throw new Error("discriminator: requires oneOf keyword");
        const valid = gen.let("valid", false);
        const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
        gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
        cxt.ok(valid);
        function validateMapping() {
          const mapping = getMapping();
          gen.if(false);
          for (const tagValue in mapping) {
            gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
            gen.assign(valid, applyTagSchema(mapping[tagValue]));
          }
          gen.else();
          cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
          gen.endIf();
        }
        function applyTagSchema(schemaProp) {
          const _valid = gen.name("valid");
          const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
          cxt.mergeEvaluated(schCxt, codegen_1.Name);
          return _valid;
        }
        function getMapping() {
          var _a;
          const oneOfMapping = {};
          const topRequired = hasRequired(parentSchema);
          let tagRequired = true;
          for (let i = 0; i < oneOf.length; i++) {
            let sch = oneOf[i];
            if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
              const ref = sch.$ref;
              sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
              if (sch instanceof compile_1.SchemaEnv)
                sch = sch.schema;
              if (sch === void 0)
                throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
            }
            const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
            if (typeof propSch != "object") {
              throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
            }
            tagRequired = tagRequired && (topRequired || hasRequired(sch));
            addMappings(propSch, i);
          }
          if (!tagRequired)
            throw new Error(`discriminator: "${tagName}" must be required`);
          return oneOfMapping;
          function hasRequired({ required }) {
            return Array.isArray(required) && required.includes(tagName);
          }
          function addMappings(sch, i) {
            if (sch.const) {
              addMapping(sch.const, i);
            } else if (sch.enum) {
              for (const tagValue of sch.enum) {
                addMapping(tagValue, i);
              }
            } else {
              throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
            }
          }
          function addMapping(tagValue, i) {
            if (typeof tagValue != "string" || tagValue in oneOfMapping) {
              throw new Error(`discriminator: "${tagName}" values must be unique strings`);
            }
            oneOfMapping[tagValue] = i;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-draft-07.json
var require_json_schema_draft_07 = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-draft-07.json"(exports, module) {
    module.exports = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: "http://json-schema.org/draft-07/schema#",
      title: "Core schema meta-schema",
      definitions: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $ref: "#" }
        },
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          allOf: [{ $ref: "#/definitions/nonNegativeInteger" }, { default: 0 }]
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      },
      type: ["object", "boolean"],
      properties: {
        $id: {
          type: "string",
          format: "uri-reference"
        },
        $schema: {
          type: "string",
          format: "uri"
        },
        $ref: {
          type: "string",
          format: "uri-reference"
        },
        $comment: {
          type: "string"
        },
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        readOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/definitions/nonNegativeInteger" },
        minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        additionalItems: { $ref: "#" },
        items: {
          anyOf: [{ $ref: "#" }, { $ref: "#/definitions/schemaArray" }],
          default: true
        },
        maxItems: { $ref: "#/definitions/nonNegativeInteger" },
        minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        contains: { $ref: "#" },
        maxProperties: { $ref: "#/definitions/nonNegativeInteger" },
        minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        required: { $ref: "#/definitions/stringArray" },
        additionalProperties: { $ref: "#" },
        definitions: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        properties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependencies: {
          type: "object",
          additionalProperties: {
            anyOf: [{ $ref: "#" }, { $ref: "#/definitions/stringArray" }]
          }
        },
        propertyNames: { $ref: "#" },
        const: true,
        enum: {
          type: "array",
          items: true,
          minItems: 1,
          uniqueItems: true
        },
        type: {
          anyOf: [
            { $ref: "#/definitions/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/definitions/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        format: { type: "string" },
        contentMediaType: { type: "string" },
        contentEncoding: { type: "string" },
        if: { $ref: "#" },
        then: { $ref: "#" },
        else: { $ref: "#" },
        allOf: { $ref: "#/definitions/schemaArray" },
        anyOf: { $ref: "#/definitions/schemaArray" },
        oneOf: { $ref: "#/definitions/schemaArray" },
        not: { $ref: "#" }
      },
      default: true
    };
  }
});

// node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/ajv.js
var require_ajv = __commonJS({
  "node_modules/.bun/ajv@8.17.1/node_modules/ajv/dist/ajv.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv = void 0;
    var core_1 = require_core();
    var draft7_1 = require_draft7();
    var discriminator_1 = require_discriminator();
    var draft7MetaSchema = require_json_schema_draft_07();
    var META_SUPPORT_DATA = ["/properties"];
    var META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
    var Ajv2 = class extends core_1.default {
      _addVocabularies() {
        super._addVocabularies();
        draft7_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        if (!this.opts.meta)
          return;
        const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
        this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports.Ajv = Ajv2;
    module.exports = exports = Ajv2;
    module.exports.Ajv = Ajv2;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv2;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// node_modules/.bun/ajv-formats@3.0.1/node_modules/ajv-formats/dist/formats.js
var require_formats = __commonJS({
  "node_modules/.bun/ajv-formats@3.0.1/node_modules/ajv-formats/dist/formats.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.formatNames = exports.fastFormats = exports.fullFormats = void 0;
    function fmtDef(validate, compare) {
      return { validate, compare };
    }
    exports.fullFormats = {
      // date: http://tools.ietf.org/html/rfc3339#section-5.6
      date: fmtDef(date, compareDate),
      // date-time: http://tools.ietf.org/html/rfc3339#section-5.6
      time: fmtDef(getTime(true), compareTime),
      "date-time": fmtDef(getDateTime(true), compareDateTime),
      "iso-time": fmtDef(getTime(), compareIsoTime),
      "iso-date-time": fmtDef(getDateTime(), compareIsoDateTime),
      // duration: https://tools.ietf.org/html/rfc3339#appendix-A
      duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
      uri,
      "uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
      // uri-template: https://tools.ietf.org/html/rfc6570
      "uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
      // For the source: https://gist.github.com/dperini/729294
      // For test cases: https://mathiasbynens.be/demo/url-regex
      url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
      email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
      hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
      // optimized https://www.safaribooksonline.com/library/view/regular-expressions-cookbook/9780596802837/ch07s16.html
      ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
      ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
      regex,
      // uuid: http://tools.ietf.org/html/rfc4122
      uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
      // JSON-pointer: https://tools.ietf.org/html/rfc6901
      // uri fragment: https://tools.ietf.org/html/rfc3986#appendix-A
      "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
      "json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
      // relative JSON-pointer: http://tools.ietf.org/html/draft-luff-relative-json-pointer-00
      "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
      // the following formats are used by the openapi specification: https://spec.openapis.org/oas/v3.0.0#data-types
      // byte: https://github.com/miguelmota/is-base64
      byte,
      // signed 32 bit integer
      int32: { type: "number", validate: validateInt32 },
      // signed 64 bit integer
      int64: { type: "number", validate: validateInt64 },
      // C-type float
      float: { type: "number", validate: validateNumber },
      // C-type double
      double: { type: "number", validate: validateNumber },
      // hint to the UI to hide input strings
      password: true,
      // unchecked string payload
      binary: true
    };
    exports.fastFormats = {
      ...exports.fullFormats,
      date: fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, compareDate),
      time: fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareTime),
      "date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareDateTime),
      "iso-time": fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoTime),
      "iso-date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoDateTime),
      // uri: https://github.com/mafintosh/is-my-json-valid/blob/master/formats.js
      uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
      "uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
      // email (sources from jsen validator):
      // http://stackoverflow.com/questions/201323/using-a-regular-expression-to-validate-an-email-address#answer-8829363
      // http://www.w3.org/TR/html5/forms.html#valid-e-mail-address (search for 'wilful violation')
      email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
    };
    exports.formatNames = Object.keys(exports.fullFormats);
    function isLeapYear(year) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }
    var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
    var DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    function date(str) {
      const matches = DATE.exec(str);
      if (!matches)
        return false;
      const year = +matches[1];
      const month = +matches[2];
      const day = +matches[3];
      return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
    }
    function compareDate(d1, d2) {
      if (!(d1 && d2))
        return void 0;
      if (d1 > d2)
        return 1;
      if (d1 < d2)
        return -1;
      return 0;
    }
    var TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
    function getTime(strictTimeZone) {
      return function time(str) {
        const matches = TIME.exec(str);
        if (!matches)
          return false;
        const hr = +matches[1];
        const min = +matches[2];
        const sec = +matches[3];
        const tz = matches[4];
        const tzSign = matches[5] === "-" ? -1 : 1;
        const tzH = +(matches[6] || 0);
        const tzM = +(matches[7] || 0);
        if (tzH > 23 || tzM > 59 || strictTimeZone && !tz)
          return false;
        if (hr <= 23 && min <= 59 && sec < 60)
          return true;
        const utcMin = min - tzM * tzSign;
        const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
        return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
      };
    }
    function compareTime(s1, s2) {
      if (!(s1 && s2))
        return void 0;
      const t1 = (/* @__PURE__ */ new Date("2020-01-01T" + s1)).valueOf();
      const t2 = (/* @__PURE__ */ new Date("2020-01-01T" + s2)).valueOf();
      if (!(t1 && t2))
        return void 0;
      return t1 - t2;
    }
    function compareIsoTime(t1, t2) {
      if (!(t1 && t2))
        return void 0;
      const a1 = TIME.exec(t1);
      const a2 = TIME.exec(t2);
      if (!(a1 && a2))
        return void 0;
      t1 = a1[1] + a1[2] + a1[3];
      t2 = a2[1] + a2[2] + a2[3];
      if (t1 > t2)
        return 1;
      if (t1 < t2)
        return -1;
      return 0;
    }
    var DATE_TIME_SEPARATOR = /t|\s/i;
    function getDateTime(strictTimeZone) {
      const time = getTime(strictTimeZone);
      return function date_time(str) {
        const dateTime = str.split(DATE_TIME_SEPARATOR);
        return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1]);
      };
    }
    function compareDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const d1 = new Date(dt1).valueOf();
      const d2 = new Date(dt2).valueOf();
      if (!(d1 && d2))
        return void 0;
      return d1 - d2;
    }
    function compareIsoDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const [d1, t1] = dt1.split(DATE_TIME_SEPARATOR);
      const [d2, t2] = dt2.split(DATE_TIME_SEPARATOR);
      const res = compareDate(d1, d2);
      if (res === void 0)
        return void 0;
      return res || compareTime(t1, t2);
    }
    var NOT_URI_FRAGMENT = /\/|:/;
    var URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
    function uri(str) {
      return NOT_URI_FRAGMENT.test(str) && URI.test(str);
    }
    var BYTE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
    function byte(str) {
      BYTE.lastIndex = 0;
      return BYTE.test(str);
    }
    var MIN_INT32 = -(2 ** 31);
    var MAX_INT32 = 2 ** 31 - 1;
    function validateInt32(value) {
      return Number.isInteger(value) && value <= MAX_INT32 && value >= MIN_INT32;
    }
    function validateInt64(value) {
      return Number.isInteger(value);
    }
    function validateNumber() {
      return true;
    }
    var Z_ANCHOR = /[^\\]\\Z/;
    function regex(str) {
      if (Z_ANCHOR.test(str))
        return false;
      try {
        new RegExp(str);
        return true;
      } catch (e) {
        return false;
      }
    }
  }
});

// node_modules/.bun/ajv-formats@3.0.1/node_modules/ajv-formats/dist/limit.js
var require_limit = __commonJS({
  "node_modules/.bun/ajv-formats@3.0.1/node_modules/ajv-formats/dist/limit.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.formatLimitDefinition = void 0;
    var ajv_1 = require_ajv();
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      formatMaximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      formatMinimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      formatExclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      formatExclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`should be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    exports.formatLimitDefinition = {
      keyword: Object.keys(KWDs),
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, keyword, it } = cxt;
        const { opts, self } = it;
        if (!opts.validateFormats)
          return;
        const fCxt = new ajv_1.KeywordCxt(it, self.RULES.all.format.definition, "format");
        if (fCxt.$data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fmt = gen.const("fmt", (0, codegen_1._)`${fmts}[${fCxt.schemaCode}]`);
          cxt.fail$data((0, codegen_1.or)((0, codegen_1._)`typeof ${fmt} != "object"`, (0, codegen_1._)`${fmt} instanceof RegExp`, (0, codegen_1._)`typeof ${fmt}.compare != "function"`, compareCode(fmt)));
        }
        function validateFormat() {
          const format = fCxt.schema;
          const fmtDef = self.formats[format];
          if (!fmtDef || fmtDef === true)
            return;
          if (typeof fmtDef != "object" || fmtDef instanceof RegExp || typeof fmtDef.compare != "function") {
            throw new Error(`"${keyword}": format "${format}" does not define "compare" function`);
          }
          const fmt = gen.scopeValue("formats", {
            key: format,
            ref: fmtDef,
            code: opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(format)}` : void 0
          });
          cxt.fail$data(compareCode(fmt));
        }
        function compareCode(fmt) {
          return (0, codegen_1._)`${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword].fail} 0`;
        }
      },
      dependencies: ["format"]
    };
    var formatLimitPlugin = (ajv2) => {
      ajv2.addKeyword(exports.formatLimitDefinition);
      return ajv2;
    };
    exports.default = formatLimitPlugin;
  }
});

// node_modules/.bun/ajv-formats@3.0.1/node_modules/ajv-formats/dist/index.js
var require_dist = __commonJS({
  "node_modules/.bun/ajv-formats@3.0.1/node_modules/ajv-formats/dist/index.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var formats_1 = require_formats();
    var limit_1 = require_limit();
    var codegen_1 = require_codegen();
    var fullName = new codegen_1.Name("fullFormats");
    var fastName = new codegen_1.Name("fastFormats");
    var formatsPlugin = (ajv2, opts = { keywords: true }) => {
      if (Array.isArray(opts)) {
        addFormats2(ajv2, opts, formats_1.fullFormats, fullName);
        return ajv2;
      }
      const [formats, exportName] = opts.mode === "fast" ? [formats_1.fastFormats, fastName] : [formats_1.fullFormats, fullName];
      const list = opts.formats || formats_1.formatNames;
      addFormats2(ajv2, list, formats, exportName);
      if (opts.keywords)
        (0, limit_1.default)(ajv2);
      return ajv2;
    };
    formatsPlugin.get = (name, mode = "full") => {
      const formats = mode === "fast" ? formats_1.fastFormats : formats_1.fullFormats;
      const f = formats[name];
      if (!f)
        throw new Error(`Unknown format "${name}"`);
      return f;
    };
    function addFormats2(ajv2, list, fs, exportName) {
      var _a;
      var _b;
      (_a = (_b = ajv2.opts.code).formats) !== null && _a !== void 0 ? _a : _b.formats = (0, codegen_1._)`require("ajv-formats/dist/formats").${exportName}`;
      for (const f of list)
        ajv2.addFormat(f, fs[f]);
    }
    module.exports = exports = formatsPlugin;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = formatsPlugin;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = Symbol.for("yaml.alias");
    var DOC = Symbol.for("yaml.document");
    var MAP = Symbol.for("yaml.map");
    var PAIR = Symbol.for("yaml.pair");
    var SCALAR = Symbol.for("yaml.scalar");
    var SEQ = Symbol.for("yaml.seq");
    var NODE_TYPE = Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path12) {
      const ctrl = callVisitor(key, node, visitor, path12);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path12, ctrl);
        return visit_(key, ctrl, visitor, path12);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path12 = Object.freeze(path12.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path12);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path12 = Object.freeze(path12.concat(node));
          const ck = visit_("key", node.key, visitor, path12);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path12);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path12) {
      const ctrl = await callVisitor(key, node, visitor, path12);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path12, ctrl);
        return visitAsync_(key, ctrl, visitor, path12);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path12 = Object.freeze(path12.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path12);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path12 = Object.freeze(path12.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path12);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path12);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path12) {
      if (typeof visitor === "function")
        return visitor(key, node, path12);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path12);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path12);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path12);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path12);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path12);
      return void 0;
    }
    function replaceNode(key, path12, node) {
      const parent = path12[path12.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (!data || data.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path12, value) {
      let v = value;
      for (let i = path12.length - 1; i >= 0; --i) {
        const k = path12[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path12) => path12 == null || typeof path12 === "object" && !!path12[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path12, value) {
        if (isEmptyPath(path12))
          this.add(value);
        else {
          const [key, ...rest] = path12;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path12) {
        const [key, ...rest] = path12;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path12, keepScalar) {
        const [key, ...rest] = path12;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path12) {
        const [key, ...rest] = path12;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path12, value) {
        const [key, ...rest] = path12;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n")
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      value = ctx && identity.isAlias(value) ? value.resolve(ctx.doc) : value;
      if (identity.isSeq(value))
        for (const it of value.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(value))
        for (const it of value)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, value);
    }
    function mergeValue(ctx, map, value) {
      const source = ctx && identity.isAlias(value) ? value.resolve(ctx.doc) : value;
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        if (i < items.length - 1)
          str += ",";
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        if (!reqNewline && (lines.length > linesAtValue || str.includes("\n")))
          reqNewline = true;
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^\d/.test(n)) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path12, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path12, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path12) {
        if (Collection.isEmptyPath(path12)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path12) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path12, keepScalar) {
        if (Collection.isEmptyPath(path12))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path12, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path12) {
        if (Collection.isEmptyPath(path12))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path12) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path12, value) {
        if (Collection.isEmptyPath(path12)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path12), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path12, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/errors.js
var require_errors2 = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "…" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "…";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "…\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end && end.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value && value.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source && value.source[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce && ce.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt && kt.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + match[1];
          sep = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = { x: 2, u: 4, U: 8 }[next];
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "",
      // Unicode next line
      _: " ",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      if (isNaN(code)) {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
      return String.fromCodePoint(code);
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          node = composeCollection.composeCollection(CN, ctx, token, props, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError);
          isSrcToken = false;
        }
      }
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors2();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          Array.prototype.push.apply(doc.errors, this.errors);
          Array.prototype.push.apply(doc.warnings, this.warnings);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors2();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path12) => {
      let item = cst;
      for (const [field, index] of path12) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path12) => {
      const parent = visit.itemAtPath(cst, path12.slice(0, -1));
      const field = path12[path12.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path12, item, visitor) {
      let ctrl = visitor(item, path12);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path12.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path12);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path12) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return yield* this.parseBlockStart();
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        switch (this.charAt(0)) {
          case "!":
            return (yield* this.pushTag()) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
          case "&":
            return (yield* this.pushUntil(isNotAnchorChar)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
          case "-":
          // this is an error
          case "?":
          // this is an error outside flow collections
          case ":": {
            const inFlow = this.flowLevel > 0;
            const ch1 = this.charAt(1);
            if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
              if (!inFlow)
                this.indentNext = this.indentValue + 1;
              else if (this.flowKey)
                this.flowKey = false;
              return (yield* this.pushCount(1)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
            }
          }
        }
        return 0;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                Array.prototype.push.apply(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              Array.prototype.push.apply(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && (!top || top.type !== "doc-end")) {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  Array.prototype.push.apply(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  Array.prototype.push.apply(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top && top.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors2();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse2(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse2;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify;
  }
});

// node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/index.js
var require_dist2 = __commonJS({
  "node_modules/.bun/yaml@2.8.1/node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors2();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// packages/cli/src/cli.ts
import { readFile as readFile3 } from "node:fs/promises";
import path11 from "node:path";

// packages/core/src/errors.ts
var ExitCode = {
  Success: 0,
  Internal: 1,
  Arguments: 2,
  Environment: 3,
  Incomplete: 4,
  Artifact: 5,
  Security: 6,
  Policy: 10
};
var UtsuriError = class extends Error {
  diagnosticId;
  exitCode;
  details;
  constructor(diagnosticId, message, exitCode, details = {}) {
    super(message);
    this.name = "UtsuriError";
    this.diagnosticId = diagnosticId;
    this.exitCode = exitCode;
    this.details = details;
  }
};
function toUtsuriError(error) {
  return error instanceof UtsuriError ? error : new UtsuriError(
    "UTSURI_INTERNAL",
    error instanceof Error ? error.message : String(error),
    ExitCode.Internal
  );
}

// packages/core/src/git.ts
import path2 from "node:path";

// packages/core/src/hash.ts
import { createHash } from "node:crypto";
import path from "node:path";
var defaultOmittedKeys = /* @__PURE__ */ new Set([
  "generatedAt",
  "generationTime",
  "port",
  "temporaryPath",
  "tempPath",
  "timestamp"
]);
function normalize(value, omittedKeys) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical JSON does not support non-finite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item, omittedKeys));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const object = value;
    const normalized = {};
    for (const key of Object.keys(object).sort()) {
      if (omittedKeys.has(key) || object[key] === void 0) continue;
      normalized[key] = normalize(object[key], omittedKeys);
    }
    return normalized;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value}`);
}
function canonicalJson(value, options = {}) {
  const omittedKeys = new Set(defaultOmittedKeys);
  for (const key of options.omitKeys ?? []) omittedKeys.add(key);
  return JSON.stringify(normalize(value, omittedKeys));
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function stableHash(value) {
  return sha256(canonicalJson(value));
}
function stableId(prefix, value, length = 16) {
  return `${prefix}:${stableHash(value).slice(0, length)}`;
}
function normalizeRepositoryPath(input) {
  const normalized = input.replaceAll("\\", "/").replace(/^\.\//u, "");
  return path.posix.normalize(normalized);
}
function hunkId(filePath, oldStart, newStart, content) {
  const normalizedPath = normalizeRepositoryPath(filePath);
  const digest = stableHash({ normalizedPath, oldStart, newStart, content }).slice(0, 16);
  return `hunk:${normalizedPath}:${oldStart}:${newStart}:${digest}`;
}

// packages/core/src/git.ts
var lowSignalPathPatterns = [
  ["vendor", /(?:^|\/)(?:vendor|vendors|third[_-]party|node_modules)(?:\/|$)/iu],
  ["generated-path", /(?:^|\/)(?:dist|build|coverage|generated)(?:\/|$)/iu],
  ["minified", /\.min\.(?:css|js|mjs|cjs)$/iu],
  [
    "lockfile",
    /(?:^|\/)(?:bun\.lock|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|Gemfile\.lock|go\.sum)$/u
  ],
  ["snapshot", /(?:\.snap$|(?:^|\/)__snapshots__(?:\/|$))/u],
  ["source-map", /\.map$/u]
];
function classifyLowSignal(filePath, options = {}) {
  const normalized = normalizeRepositoryPath(filePath);
  const reasons = lowSignalPathPatterns.filter(([, pattern]) => pattern.test(normalized)).map(([reason]) => reason);
  if (options.binary) reasons.push("binary");
  const header = (options.content ?? []).slice(0, 8).join("\n");
  if (/(?:@generated|generated (?:code|file)|do not edit)/iu.test(header))
    reasons.push("generated-header");
  return [...new Set(reasons)].sort();
}
function createGitHunk(input) {
  const selectedPath = normalizeRepositoryPath(input.path);
  const content = input.lines.map((line) => `${line.kind}:${line.content}`);
  return {
    ...input,
    path: selectedPath,
    oldPath: input.oldPath ? normalizeRepositoryPath(input.oldPath) : null,
    newPath: input.newPath ? normalizeRepositoryPath(input.newPath) : null,
    id: hunkId(selectedPath, input.oldStart, input.newStart, content),
    lowSignal: classifyLowSignal(selectedPath, { content }).length > 0
  };
}
function createGitFileId(oldPath, newPath) {
  const selectedPath = normalizeRepositoryPath(newPath ?? oldPath ?? "unknown");
  return stableId("file", { oldPath, newPath, selectedPath });
}
function displayPath(file) {
  if (file.oldPath && file.newPath && file.oldPath !== file.newPath) {
    return `${file.oldPath} → ${file.newPath}`;
  }
  return file.newPath ?? file.oldPath ?? "unknown";
}
function fileStem(filePath) {
  const normalized = normalizeRepositoryPath(filePath);
  const extension = path2.posix.extname(normalized);
  return path2.posix.join(path2.posix.dirname(normalized), path2.posix.basename(normalized, extension)).replace(/(?:\.(?:test|spec|stories)|[-_.](?:test|spec)|\.module)$/iu, "").replace(/(?:^|\/)__tests__\//u, "/").replace(/\/index$/u, "");
}

// packages/core/src/semantic.ts
import path3 from "node:path";
function evidenceType(file) {
  const selected = file.newPath ?? file.oldPath ?? "";
  if (file.binary) return "binary";
  if (file.lowSignal) return "generated";
  if (/(?:^|\/)(?:tests?|__tests__|spec)(?:\/|$)|\.(?:test|spec)\.[^.]+$/iu.test(selected)) {
    return "test";
  }
  if (/\.(?:css|scss|sass|less|styl)$/iu.test(selected)) return "style";
  if (/(?:^|\/)(?:package\.json|tsconfig[^/]*\.json|[^/]+\.config\.[^/]+)$/iu.test(selected)) {
    return "configuration";
  }
  return "code";
}
function candidateKey(file) {
  const selected = file.newPath ?? file.oldPath ?? "unknown";
  const stem = fileStem(selected);
  const basename = path3.posix.basename(stem);
  const directory = path3.posix.dirname(stem);
  return basename ? `${directory}/${basename}` : selected;
}
function candidateTitle(files) {
  if (files.length === 1) return displayPath(files[0]);
  const paths = files.map(displayPath);
  const sharedStem = path3.posix.basename(fileStem(paths[0] ?? "change"));
  return sharedStem ? `${sharedStem} and related files` : `${files.length} related files`;
}
function createEvidenceIndex(diff) {
  const evidence = diff.files.flatMap((file) => {
    const selected = file.newPath ?? file.oldPath ?? "unknown";
    const hunks = file.hunkRefs.map((reference) => diff.hunks.find((hunk) => hunk.id === reference)).filter((hunk) => hunk !== void 0);
    if (hunks.length === 0) {
      return [
        {
          id: stableId("evidence", { file: file.id, kind: evidenceType(file) }),
          type: evidenceType(file),
          path: selected,
          range: null,
          summary: `${file.status} ${displayPath(file)}`,
          hunkRefs: []
        }
      ];
    }
    return hunks.map((hunk) => {
      const usesNewRange = hunk.newLines > 0;
      const start = usesNewRange ? hunk.newStart : hunk.oldStart;
      const count = usesNewRange ? hunk.newLines : hunk.oldLines;
      return {
        id: stableId("evidence", { hunk: hunk.id }),
        type: evidenceType(file),
        path: selected,
        range: { start, end: start + Math.max(count - 1, 0) },
        summary: `${file.status} hunk in ${displayPath(file)}`,
        hunkRefs: [hunk.id]
      };
    });
  });
  return { schemaVersion: "1.0", evidence };
}
function createReviewPlan(diff, evidenceIndex = createEvidenceIndex(diff)) {
  const grouped = /* @__PURE__ */ new Map();
  for (const file of diff.files) {
    if (file.hunkRefs.length === 0) continue;
    const key = candidateKey(file);
    grouped.set(key, [...grouped.get(key) ?? [], file]);
  }
  const candidates = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, files]) => {
    const fileRefs = files.map((file) => file.id).sort();
    const sortedHunkRefs = files.flatMap((file) => file.hunkRefs).sort();
    const hunkRefs = sortedHunkRefs;
    const hunkSet = new Set(hunkRefs);
    const evidenceRefs = evidenceIndex.evidence.filter((evidence) => evidence.hunkRefs.some((reference) => hunkSet.has(reference))).map((evidence) => evidence.id).sort();
    return {
      id: stableId("change", { key, hunkRefs }),
      title: candidateTitle(files),
      reason: files.length === 1 ? "Hunks are close within one file." : "Implementation, test, style, or companion files share a stable path stem.",
      fileRefs,
      hunkRefs,
      evidenceRefs
    };
  });
  const classified = new Set(candidates.flatMap((candidate) => candidate.hunkRefs));
  const unclassifiedHunkRefs = diff.hunks.map((hunk) => hunk.id).filter((reference) => !classified.has(reference)).sort();
  return { schemaVersion: "1.0", candidates, unclassifiedHunkRefs };
}

// packages/git-collector/src/index.ts
import { mkdir, readFile, realpath as realpath3, writeFile } from "node:fs/promises";
import path7 from "node:path";

// packages/report-model/src/validator.ts
var import_ajv = __toESM(require_ajv(), 1);
var import_ajv_formats = __toESM(require_dist(), 1);

// schemas/annotations.schema.json
var annotations_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/annotations/v1",
  title: "Annotations",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "changes"],
  properties: {
    schemaVersion: { const: "1.0" },
    changes: { type: "array", items: { $ref: "#/$defs/semanticChange" } }
  },
  $defs: {
    semanticChange: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "title",
        "kind",
        "summary",
        "intent",
        "implementation",
        "userImpact",
        "technicalImpact",
        "risk",
        "hunkRefs",
        "targetRefs",
        "findingRefs",
        "verification"
      ],
      properties: {
        id: { type: "string", pattern: "^change[-:]" },
        title: { type: "string", minLength: 1 },
        kind: {
          enum: ["visual", "behavior", "content", "accessibility", "refactor", "mixed", "unknown"]
        },
        summary: { type: "string" },
        intent: {
          type: "object",
          additionalProperties: false,
          required: ["text", "source", "evidenceRefs"],
          properties: {
            text: { type: "string" },
            source: { enum: ["declared", "supported-inference", "weak-inference", "unknown"] },
            evidenceRefs: { type: "array", items: { type: "string" }, uniqueItems: true },
            missingEvidence: {
              type: "array",
              items: { type: "string" },
              uniqueItems: true
            }
          }
        },
        implementation: { type: "string" },
        userImpact: { type: "array", items: { type: "string" } },
        technicalImpact: { type: "array", items: { type: "string" } },
        risk: {
          type: "object",
          additionalProperties: false,
          required: ["level", "reasons"],
          properties: {
            level: { enum: ["critical", "high", "medium", "low", "info"] },
            reasons: { type: "array", items: { type: "string" } }
          }
        },
        hunkRefs: { type: "array", items: { type: "string" }, uniqueItems: true },
        targetRefs: { type: "array", items: { type: "string" }, uniqueItems: true },
        findingRefs: { type: "array", items: { type: "string" }, uniqueItems: true },
        verification: {
          type: "object",
          additionalProperties: false,
          required: ["verified", "gaps"],
          properties: {
            verified: { type: "array", items: { type: "string" } },
            gaps: { type: "array", items: { type: "string" } }
          }
        }
      }
    }
  }
};

// schemas/config.schema.json
var config_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/config/v1",
  title: "UtsuriConfig",
  type: "object",
  additionalProperties: false,
  required: ["version", "project", "diff", "execution", "report", "review", "feedback", "policy"],
  properties: {
    version: { const: 1 },
    project: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1 },
        locale: { type: "string", minLength: 2 }
      }
    },
    diff: {
      type: "object",
      additionalProperties: false,
      required: ["base", "head"],
      properties: {
        base: { type: "string", minLength: 1 },
        head: { type: "string", minLength: 1 },
        mergeBase: { type: "boolean", default: true },
        include: { type: "array", items: { type: "string" }, uniqueItems: true },
        exclude: { type: "array", items: { type: "string" }, uniqueItems: true },
        generatedPatterns: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true
        }
      }
    },
    execution: {
      type: "object",
      additionalProperties: false,
      required: ["mode", "trust", "install", "shell", "timeoutMs"],
      properties: {
        mode: { enum: ["dual-url", "static-fragment", "worktree", "container"] },
        trust: { enum: ["untrusted", "configured", "trusted"] },
        install: { const: "never" },
        shell: { const: false },
        timeoutMs: { type: "integer", minimum: 1, maximum: 9e5 }
      }
    },
    servers: {
      type: "object",
      additionalProperties: false,
      properties: {
        before: { $ref: "#/$defs/server" },
        after: { $ref: "#/$defs/server" }
      }
    },
    browser: {
      type: "object",
      additionalProperties: false,
      properties: {
        engine: { const: "chromium" },
        headless: { type: "boolean" },
        serviceWorkers: { const: "block" },
        locale: { type: "string" },
        timezone: { type: "string" },
        colorScheme: { enum: ["light", "dark"] },
        reducedMotion: { enum: ["reduce", "no-preference"] }
      }
    },
    viewports: {
      type: "object",
      additionalProperties: { $ref: "#/$defs/viewport" }
    },
    targets: {
      type: "array",
      items: { $ref: "#/$defs/target" }
    },
    network: {
      type: "object",
      additionalProperties: false,
      properties: {
        browserPolicy: { const: "block-external" },
        allowedOrigins: {
          type: "array",
          items: { type: "string", format: "uri" },
          uniqueItems: true
        },
        blockMethods: {
          type: "array",
          items: { enum: ["POST", "PUT", "PATCH", "DELETE"] },
          uniqueItems: true
        },
        recordBlocked: { type: "boolean" }
      }
    },
    security: {
      type: "object",
      additionalProperties: false,
      properties: {
        envAllowlist: { type: "array", items: { type: "string" }, uniqueItems: true },
        followSymlinks: { const: false },
        allowArbitraryScriptSteps: { const: false },
        allowRemoteAuthState: { const: false },
        sanitizeHtmlPreview: { const: true }
      }
    },
    report: {
      type: "object",
      additionalProperties: false,
      required: ["outputDirectory", "singleFile", "includeAbsolutePaths"],
      properties: {
        outputDirectory: { type: "string", minLength: 1 },
        language: { type: "string", minLength: 2 },
        theme: { enum: ["system", "light", "dark"] },
        singleFile: { type: "boolean" },
        includeReviewNotes: { type: "boolean" },
        includeRawLogs: { type: "boolean" },
        includeAbsolutePaths: { const: false }
      }
    },
    review: {
      type: "object",
      additionalProperties: false,
      required: ["enabled", "autoResolveAgentAnswer"],
      properties: {
        enabled: { type: "boolean" },
        viewedMode: { const: "manual" },
        staleOnFingerprintChange: { type: "boolean" },
        autoResolveAgentAnswer: { const: false }
      }
    },
    feedback: {
      type: "object",
      additionalProperties: false,
      required: ["target", "delivery", "neverCreateNewSession"],
      properties: {
        target: { const: "origin-session" },
        delivery: { enum: ["return-to-session", "direct-same-session", "export-only"] },
        directSameSessionBridge: { enum: ["auto", "disabled"] },
        neverCreateNewSession: { const: true },
        contextPreview: { const: "required" },
        maxBatchItems: { type: "integer", minimum: 1, maximum: 100 },
        maxContextBytes: { type: "integer", minimum: 1024, maximum: 10485760 }
      }
    },
    policy: {
      type: "object",
      additionalProperties: false,
      required: ["failOn", "warnOn"],
      properties: {
        failOn: { type: "array", items: { type: "string" }, uniqueItems: true },
        warnOn: { type: "array", items: { type: "string" }, uniqueItems: true }
      }
    }
  },
  $defs: {
    server: {
      type: "object",
      additionalProperties: false,
      required: ["command", "readyUrl"],
      properties: {
        command: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 }
        },
        readyUrl: { type: "string", format: "uri" },
        readySelector: { type: "string", minLength: 1 }
      }
    },
    viewport: {
      type: "object",
      additionalProperties: false,
      required: ["width", "height", "deviceScaleFactor"],
      properties: {
        width: { type: "integer", minimum: 1, maximum: 1e4 },
        height: { type: "integer", minimum: 1, maximum: 3e4 },
        deviceScaleFactor: { type: "number", minimum: 0.25, maximum: 4 }
      }
    },
    target: {
      type: "object",
      additionalProperties: false,
      required: ["id", "path", "viewports", "states"],
      properties: {
        id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" },
        path: { type: "string", pattern: "^/" },
        viewports: { type: "array", minItems: 1, items: { type: "string" } },
        roots: { type: "array", items: { type: "string" } },
        states: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name"],
            properties: {
              name: { type: "string", minLength: 1 },
              steps: { type: "array", items: { type: "object" } }
            }
          }
        }
      }
    }
  }
};

// schemas/context-pack.schema.json
var context_pack_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/context-pack/v1.1",
  title: "ContextPack",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "reportId",
    "batchId",
    "itemId",
    "baseSha",
    "headSha",
    "anchor",
    "question",
    "code",
    "images",
    "evidenceRefs",
    "priorThreadMessages",
    "redactions",
    "contextHash"
  ],
  properties: {
    schemaVersion: { const: "1.1" },
    reportId: { type: "string" },
    batchId: { type: "string" },
    itemId: { type: "string" },
    baseSha: { type: "string" },
    headSha: { type: "string" },
    anchor: { $ref: "#/$defs/anchor" },
    question: { type: "string", minLength: 1 },
    semanticChange: {
      type: "object",
      additionalProperties: false,
      required: ["id", "title", "summary", "intent", "risk"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        summary: { type: "string" },
        intent: {
          type: "object",
          additionalProperties: false,
          required: ["text", "source", "evidenceRefs"],
          properties: {
            text: { type: "string" },
            source: { enum: ["declared", "supported-inference", "weak-inference", "unknown"] },
            evidenceRefs: { type: "array", items: { type: "string" } }
          }
        },
        risk: {
          type: "object",
          additionalProperties: false,
          required: ["level", "reasons"],
          properties: {
            level: { enum: ["critical", "high", "medium", "low", "info"] },
            reasons: { type: "array", items: { type: "string" } }
          }
        }
      }
    },
    code: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "startLine", "endLine", "textRef"],
        properties: {
          path: { type: "string" },
          startLine: { type: "integer", minimum: 1 },
          endLine: { type: "integer", minimum: 1 },
          textRef: { type: "string" }
        }
      }
    },
    images: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "assetRef"],
        properties: {
          role: { enum: ["before", "after", "diff"] },
          assetRef: { type: "string" },
          crop: { $ref: "#/$defs/region" }
        }
      }
    },
    evidenceRefs: { type: "array", items: { type: "string" }, uniqueItems: true },
    priorThreadMessages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "text"],
        properties: {
          role: { enum: ["human", "agent"] },
          text: { type: "string" }
        }
      }
    },
    redactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "ref"],
        properties: {
          category: { type: "string" },
          ref: { type: "string" }
        }
      }
    },
    contextHash: { type: "string", minLength: 8 }
  },
  $defs: {
    anchor: {
      type: "object",
      additionalProperties: false,
      required: ["type", "ref", "fingerprint"],
      properties: {
        type: {
          enum: [
            "change",
            "file",
            "hunk",
            "line-range",
            "visual-target",
            "visual-region",
            "finding",
            "verification-gap"
          ]
        },
        ref: { type: "string" },
        path: { type: "string" },
        side: { enum: ["before", "after", "diff"] },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
        targetRef: { type: "string" },
        region: { $ref: "#/$defs/region" },
        selectorHint: { type: "string" },
        fingerprint: { type: "string", minLength: 8 }
      }
    },
    region: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "width", "height"],
      properties: {
        x: { type: "number", minimum: 0 },
        y: { type: "number", minimum: 0 },
        width: { type: "number", exclusiveMinimum: 0 },
        height: { type: "number", exclusiveMinimum: 0 }
      }
    }
  }
};

// schemas/diff.schema.json
var diff_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/diff/v1",
  title: "GitDiffDocument",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "input",
    "repository",
    "sourceDigests",
    "summary",
    "files",
    "hunks"
  ],
  properties: {
    schemaVersion: { const: "1.0" },
    input: {
      type: "object",
      additionalProperties: false,
      required: ["mode", "base", "head", "mergeBase", "patchPath"],
      properties: {
        mode: { enum: ["worktree", "range", "merge-base", "patch"] },
        base: { type: ["string", "null"] },
        head: { type: ["string", "null"] },
        mergeBase: { type: ["string", "null"] },
        patchPath: { type: ["string", "null"] }
      }
    },
    repository: {
      type: "object",
      additionalProperties: false,
      required: ["fingerprint"],
      properties: {
        fingerprint: { type: "string", minLength: 8 }
      }
    },
    sourceDigests: {
      type: "object",
      additionalProperties: false,
      required: ["patch", "numstat", "nameStatus", "summary", "raw", "commits"],
      properties: {
        patch: { type: "string", pattern: "^[a-f0-9]{64}$" },
        numstat: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
        nameStatus: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
        summary: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
        raw: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
        commits: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" }
      }
    },
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["filesChanged", "additions", "deletions", "binaryFiles", "lowSignalFiles"],
      properties: {
        filesChanged: { type: "integer", minimum: 0 },
        additions: { type: "integer", minimum: 0 },
        deletions: { type: "integer", minimum: 0 },
        binaryFiles: { type: "integer", minimum: 0 },
        lowSignalFiles: { type: "integer", minimum: 0 }
      }
    },
    files: { type: "array", items: { $ref: "#/$defs/file" } },
    hunks: { type: "array", items: { $ref: "#/$defs/hunk" } }
  },
  $defs: {
    file: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "status",
        "oldPath",
        "newPath",
        "additions",
        "deletions",
        "binary",
        "submodule",
        "oldMode",
        "newMode",
        "oldOid",
        "newOid",
        "similarity",
        "lowSignal",
        "lowSignalReasons",
        "hunkRefs"
      ],
      properties: {
        id: { type: "string", pattern: "^file:" },
        status: {
          enum: [
            "added",
            "modified",
            "deleted",
            "renamed",
            "copied",
            "type-changed",
            "unmerged",
            "unknown"
          ]
        },
        oldPath: { type: ["string", "null"] },
        newPath: { type: ["string", "null"] },
        additions: { type: ["integer", "null"], minimum: 0 },
        deletions: { type: ["integer", "null"], minimum: 0 },
        binary: { type: "boolean" },
        submodule: { type: "boolean" },
        oldMode: { type: ["string", "null"], pattern: "^[0-7]{6}$" },
        newMode: { type: ["string", "null"], pattern: "^[0-7]{6}$" },
        oldOid: { type: ["string", "null"], pattern: "^[a-f0-9]{7,64}$" },
        newOid: { type: ["string", "null"], pattern: "^[a-f0-9]{7,64}$" },
        similarity: { type: ["integer", "null"], minimum: 0, maximum: 100 },
        lowSignal: { type: "boolean" },
        lowSignalReasons: {
          type: "array",
          items: { type: "string", minLength: 1 },
          uniqueItems: true
        },
        hunkRefs: {
          type: "array",
          items: { type: "string", pattern: "^hunk:" },
          uniqueItems: true
        }
      }
    },
    line: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "content", "oldLine", "newLine"],
      properties: {
        kind: { enum: ["context", "addition", "deletion", "no-newline"] },
        content: { type: "string" },
        oldLine: { type: ["integer", "null"], minimum: 1 },
        newLine: { type: ["integer", "null"], minimum: 1 }
      }
    },
    hunk: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "path",
        "oldPath",
        "newPath",
        "oldStart",
        "oldLines",
        "newStart",
        "newLines",
        "heading",
        "lines",
        "lowSignal"
      ],
      properties: {
        id: { type: "string", pattern: "^hunk:" },
        path: { type: "string", minLength: 1 },
        oldPath: { type: ["string", "null"] },
        newPath: { type: ["string", "null"] },
        oldStart: { type: "integer", minimum: 0 },
        oldLines: { type: "integer", minimum: 0 },
        newStart: { type: "integer", minimum: 0 },
        newLines: { type: "integer", minimum: 0 },
        heading: { type: "string" },
        lines: { type: "array", items: { $ref: "#/$defs/line" } },
        lowSignal: { type: "boolean" }
      }
    }
  }
};

// schemas/evidence-index.schema.json
var evidence_index_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/evidence-index/v1",
  title: "EvidenceIndex",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "evidence"],
  properties: {
    schemaVersion: { const: "1.0" },
    evidence: { type: "array", items: { $ref: "#/$defs/evidence" } }
  },
  $defs: {
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "path", "range", "summary", "hunkRefs"],
      properties: {
        id: { type: "string", pattern: "^evidence:" },
        type: { enum: ["code", "test", "style", "configuration", "generated", "binary"] },
        path: { type: "string", minLength: 1 },
        range: {
          oneOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              required: ["start", "end"],
              properties: {
                start: { type: "integer", minimum: 0 },
                end: { type: "integer", minimum: 0 }
              }
            }
          ]
        },
        summary: { type: "string" },
        hunkRefs: {
          type: "array",
          items: { type: "string", pattern: "^hunk:" },
          uniqueItems: true
        }
      }
    }
  }
};

// schemas/feedback-batch.schema.json
var feedback_batch_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/feedback-batch/v1",
  title: "FeedbackBatch",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "reportId",
    "origin",
    "items",
    "state",
    "deliveryMode",
    "contextHash",
    "createdAt"
  ],
  properties: {
    id: { type: "string", pattern: "^fb[-:]" },
    reportId: { type: "string" },
    origin: { $ref: "#/$defs/origin" },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: { $ref: "#/$defs/item" }
    },
    state: { enum: ["draft", "ready", "submitted", "consumed", "answered", "stale"] },
    deliveryMode: { enum: ["direct-same-session", "return-to-session", "export-only"] },
    contextHash: { type: "string", minLength: 8 },
    createdAt: { type: "string", format: "date-time" },
    submittedAt: { type: "string", format: "date-time" },
    consumedAt: { type: "string", format: "date-time" }
  },
  $defs: {
    origin: {
      type: "object",
      additionalProperties: false,
      required: ["host", "projectFingerprint", "reportId", "bindingMode", "createdAt"],
      properties: {
        host: { enum: ["codex", "claude-code", "unknown"] },
        sessionRef: { type: "string" },
        projectFingerprint: { type: "string", minLength: 8 },
        reportId: { type: "string" },
        bindingMode: { enum: ["direct-same-session", "return-to-session", "unbound"] },
        createdAt: { type: "string", format: "date-time" }
      }
    },
    anchor: {
      type: "object",
      additionalProperties: false,
      required: ["type", "ref", "fingerprint"],
      properties: {
        type: {
          enum: [
            "change",
            "file",
            "hunk",
            "line-range",
            "visual-target",
            "visual-region",
            "finding",
            "verification-gap"
          ]
        },
        ref: { type: "string" },
        path: { type: "string" },
        side: { enum: ["before", "after", "diff"] },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
        targetRef: { type: "string" },
        region: {
          type: "object",
          additionalProperties: false,
          required: ["x", "y", "width", "height"],
          properties: {
            x: { type: "number", minimum: 0 },
            y: { type: "number", minimum: 0 },
            width: { type: "number", exclusiveMinimum: 0 },
            height: { type: "number", exclusiveMinimum: 0 }
          }
        },
        selectorHint: { type: "string" },
        fingerprint: { type: "string", minLength: 8 }
      }
    },
    item: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "threadId",
        "anchor",
        "sourceMessageId",
        "requestKind",
        "question",
        "contextSelection",
        "state"
      ],
      properties: {
        id: { type: "string", pattern: "^item[-:]" },
        threadId: { type: "string" },
        anchor: { $ref: "#/$defs/anchor" },
        sourceMessageId: { type: "string" },
        requestKind: {
          enum: [
            "explain",
            "trace-impact",
            "risk-check",
            "intent-check",
            "a11y-check",
            "suggest-tests",
            "freeform"
          ]
        },
        question: { type: "string", minLength: 1 },
        contextSelection: {
          type: "object",
          additionalProperties: false,
          required: [
            "includeCodeDiff",
            "includeVisualCrop",
            "includeComputedStyle",
            "includeDomAria",
            "includeRelatedTests"
          ],
          properties: {
            includeCodeDiff: { type: "boolean" },
            includeVisualCrop: { type: "boolean" },
            includeComputedStyle: { type: "boolean" },
            includeDomAria: { type: "boolean" },
            includeRelatedTests: { type: "boolean" }
          }
        },
        state: { enum: ["ready", "submitted", "acknowledged", "answered", "stale"] }
      }
    }
  }
};

// schemas/origin-session.schema.json
var origin_session_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/origin-session/v1",
  title: "OriginSessionBinding",
  type: "object",
  additionalProperties: false,
  required: ["host", "projectFingerprint", "reportId", "bindingMode", "createdAt"],
  properties: {
    host: { enum: ["codex", "claude-code", "unknown"] },
    sessionRef: { type: "string", minLength: 1 },
    projectFingerprint: { type: "string", minLength: 8 },
    reportId: { type: "string", minLength: 1 },
    bindingMode: { enum: ["direct-same-session", "return-to-session", "unbound"] },
    createdAt: { type: "string", format: "date-time" }
  }
};

// schemas/report.schema.json
var report_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/report/v1",
  title: "UtsuriReport",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "reportId",
    "status",
    "summary",
    "files",
    "hunks",
    "evidence",
    "unclassifiedHunkRefs",
    "changes",
    "targets",
    "findings",
    "coverage",
    "origin",
    "diagnostics"
  ],
  properties: {
    schemaVersion: { const: "1.0" },
    reportId: { type: "string", pattern: "^report[-:]" },
    status: { enum: ["PASS", "CHANGED", "REGRESSION", "INCOMPLETE", "UNCOVERED", "SKIPPED"] },
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["statement", "filesChanged", "additions", "deletions"],
      properties: {
        statement: { type: "string" },
        filesChanged: { type: "integer", minimum: 0 },
        additions: { type: "integer", minimum: 0 },
        deletions: { type: "integer", minimum: 0 }
      }
    },
    files: { type: "array", items: { $ref: "#/$defs/file" } },
    hunks: { type: "array", items: { $ref: "#/$defs/hunk" } },
    evidence: { type: "array", items: { $ref: "#/$defs/evidence" } },
    unclassifiedHunkRefs: { type: "array", items: { type: "string" }, uniqueItems: true },
    changes: { type: "array", items: { $ref: "#/$defs/change" } },
    targets: { type: "array", items: { $ref: "#/$defs/target" } },
    findings: { type: "array", items: { $ref: "#/$defs/finding" } },
    coverage: {
      type: "object",
      additionalProperties: false,
      required: [
        "knownUsages",
        "verifiedUsages",
        "unknownPossible",
        "planned",
        "succeeded",
        "failed"
      ],
      properties: {
        knownUsages: { type: ["integer", "null"], minimum: 0 },
        verifiedUsages: { type: "integer", minimum: 0 },
        unknownPossible: { type: "boolean" },
        planned: { type: "integer", minimum: 0 },
        succeeded: { type: "integer", minimum: 0 },
        failed: { type: "integer", minimum: 0 }
      }
    },
    origin: { $ref: "#/$defs/origin" },
    diagnostics: {
      type: "object",
      additionalProperties: false,
      required: ["incompleteReasons", "blockedRequestCount"],
      properties: {
        incompleteReasons: { type: "array", items: { type: "string" } },
        blockedRequestCount: { type: "integer", minimum: 0 }
      }
    }
  },
  $defs: {
    file: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "status",
        "oldPath",
        "newPath",
        "additions",
        "deletions",
        "binary",
        "submodule",
        "oldMode",
        "newMode",
        "oldOid",
        "newOid",
        "lowSignal",
        "lowSignalReasons",
        "hunkRefs"
      ],
      properties: {
        id: { type: "string", pattern: "^file:" },
        status: {
          enum: [
            "added",
            "modified",
            "deleted",
            "renamed",
            "copied",
            "type-changed",
            "unmerged",
            "unknown"
          ]
        },
        oldPath: { type: ["string", "null"] },
        newPath: { type: ["string", "null"] },
        additions: { type: ["integer", "null"], minimum: 0 },
        deletions: { type: ["integer", "null"], minimum: 0 },
        binary: { type: "boolean" },
        submodule: { type: "boolean" },
        oldMode: { type: ["string", "null"], pattern: "^[0-7]{6}$" },
        newMode: { type: ["string", "null"], pattern: "^[0-7]{6}$" },
        oldOid: { type: ["string", "null"], pattern: "^[a-f0-9]{7,64}$" },
        newOid: { type: ["string", "null"], pattern: "^[a-f0-9]{7,64}$" },
        lowSignal: { type: "boolean" },
        lowSignalReasons: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true
        },
        hunkRefs: {
          type: "array",
          items: { type: "string", pattern: "^hunk:" },
          uniqueItems: true
        }
      }
    },
    line: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "content", "oldLine", "newLine"],
      properties: {
        kind: { enum: ["context", "addition", "deletion", "no-newline"] },
        content: { type: "string" },
        oldLine: { type: ["integer", "null"], minimum: 1 },
        newLine: { type: ["integer", "null"], minimum: 1 }
      }
    },
    hunk: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "path",
        "oldPath",
        "newPath",
        "oldStart",
        "oldLines",
        "newStart",
        "newLines",
        "heading",
        "lines",
        "lowSignal"
      ],
      properties: {
        id: { type: "string", pattern: "^hunk:" },
        path: { type: "string", minLength: 1 },
        oldPath: { type: ["string", "null"] },
        newPath: { type: ["string", "null"] },
        oldStart: { type: "integer", minimum: 0 },
        oldLines: { type: "integer", minimum: 0 },
        newStart: { type: "integer", minimum: 0 },
        newLines: { type: "integer", minimum: 0 },
        heading: { type: "string" },
        lines: { type: "array", items: { $ref: "#/$defs/line" } },
        lowSignal: { type: "boolean" }
      }
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "path", "range", "summary", "hunkRefs"],
      properties: {
        id: { type: "string", pattern: "^evidence:" },
        type: { enum: ["code", "test", "style", "configuration", "generated", "binary"] },
        path: { type: "string", minLength: 1 },
        range: {
          oneOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              required: ["start", "end"],
              properties: {
                start: { type: "integer", minimum: 0 },
                end: { type: "integer", minimum: 0 }
              }
            }
          ]
        },
        summary: { type: "string" },
        hunkRefs: {
          type: "array",
          items: { type: "string", pattern: "^hunk:" },
          uniqueItems: true
        }
      }
    },
    change: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "title",
        "kind",
        "summary",
        "intent",
        "implementation",
        "userImpact",
        "technicalImpact",
        "risk",
        "hunkRefs",
        "targetRefs",
        "findingRefs",
        "verification"
      ],
      properties: {
        id: { type: "string", pattern: "^change[-:]" },
        title: { type: "string", minLength: 1 },
        kind: {
          enum: ["visual", "behavior", "content", "accessibility", "refactor", "mixed", "unknown"]
        },
        summary: { type: "string" },
        intent: {
          type: "object",
          additionalProperties: false,
          required: ["text", "source", "evidenceRefs"],
          properties: {
            text: { type: "string" },
            source: { enum: ["declared", "supported-inference", "weak-inference", "unknown"] },
            evidenceRefs: { type: "array", items: { type: "string" }, uniqueItems: true },
            missingEvidence: { type: "array", items: { type: "string" } }
          }
        },
        implementation: { type: "string" },
        userImpact: { type: "array", items: { type: "string" } },
        technicalImpact: { type: "array", items: { type: "string" } },
        risk: {
          type: "object",
          additionalProperties: false,
          required: ["level", "reasons"],
          properties: {
            level: { enum: ["critical", "high", "medium", "low", "info"] },
            reasons: { type: "array", items: { type: "string" } }
          }
        },
        hunkRefs: { type: "array", items: { type: "string" }, uniqueItems: true },
        targetRefs: { type: "array", items: { type: "string" }, uniqueItems: true },
        findingRefs: { type: "array", items: { type: "string" }, uniqueItems: true },
        verification: {
          type: "object",
          additionalProperties: false,
          required: ["verified", "gaps"],
          properties: {
            verified: { type: "array", items: { type: "string" } },
            gaps: { type: "array", items: { type: "string" } }
          }
        }
      }
    },
    captureResult: {
      type: "object",
      additionalProperties: false,
      required: ["status", "screenshotRefs"],
      properties: {
        status: { enum: ["success", "failed", "skipped"] },
        url: { type: "string" },
        screenshotRefs: { type: "array", items: { type: "string" } },
        domRef: { type: "string" },
        ariaRef: { type: "string" },
        styleRef: { type: "string" },
        axeRef: { type: "string" },
        consoleRef: { type: "string" },
        networkRef: { type: "string" },
        failure: {
          type: "object",
          additionalProperties: false,
          required: ["code", "message", "stage"],
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            stage: { type: "string" }
          }
        }
      }
    },
    target: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "routeOrStory",
        "viewport",
        "state",
        "roots",
        "discovery",
        "before",
        "after"
      ],
      properties: {
        id: { type: "string", pattern: "^target:" },
        routeOrStory: { type: "string" },
        viewport: { type: "string" },
        state: { type: "string" },
        roots: { type: "array", items: { type: "string" } },
        discovery: {
          type: "object",
          additionalProperties: false,
          required: ["source", "confidence", "reason"],
          properties: {
            source: {
              enum: ["explicit", "storybook", "test", "route", "import", "selector", "fallback"]
            },
            confidence: { enum: ["explicit", "strong", "medium", "weak", "unknown"] },
            reason: { type: "string" }
          }
        },
        before: { $ref: "#/$defs/captureResult" },
        after: { $ref: "#/$defs/captureResult" },
        comparisonRef: { type: "string" }
      }
    },
    finding: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "category",
        "state",
        "severity",
        "title",
        "description",
        "evidenceRefs",
        "hunkRefs"
      ],
      properties: {
        id: { type: "string", pattern: "^finding:" },
        category: {
          enum: [
            "visual",
            "layout",
            "dom",
            "aria",
            "a11y",
            "console",
            "page-error",
            "network",
            "coverage",
            "security"
          ]
        },
        state: { enum: ["new", "resolved", "unchanged", "incomplete"] },
        severity: { enum: ["critical", "high", "medium", "low", "info"] },
        title: { type: "string" },
        description: { type: "string" },
        targetRef: { type: "string" },
        evidenceRefs: { type: "array", items: { type: "string" } },
        hunkRefs: { type: "array", items: { type: "string" } }
      }
    },
    origin: {
      type: "object",
      additionalProperties: false,
      required: ["host", "projectFingerprint", "reportId", "bindingMode", "createdAt"],
      properties: {
        host: { enum: ["codex", "claude-code", "unknown"] },
        sessionRef: { type: "string" },
        projectFingerprint: { type: "string", minLength: 8 },
        reportId: { type: "string" },
        bindingMode: { enum: ["direct-same-session", "return-to-session", "unbound"] },
        createdAt: { type: "string", format: "date-time" }
      }
    }
  }
};

// schemas/review-answer.schema.json
var review_answer_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/review-answer/v1",
  title: "ReviewAnswer",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "batchId",
    "itemId",
    "directAnswer",
    "evidence",
    "uncertainty",
    "suggestedNextActions",
    "metadata"
  ],
  properties: {
    schemaVersion: { const: "1.0" },
    batchId: { type: "string", minLength: 1 },
    itemId: { type: "string", minLength: 1 },
    directAnswer: { type: "string" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "explanation"],
        properties: {
          ref: { type: "string" },
          explanation: { type: "string" }
        }
      }
    },
    uncertainty: { type: "array", items: { type: "string" } },
    suggestedNextActions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "label"],
        properties: {
          type: { enum: ["inspect", "test", "recapture", "propose-patch", "none"] },
          label: { type: "string" },
          anchorRef: { type: "string" }
        }
      }
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["host", "contextHash"],
      properties: {
        host: { enum: ["codex", "claude-code", "unknown"] },
        originSessionRef: { type: "string" },
        answerTurnRef: { type: "string" },
        contextHash: { type: "string", minLength: 8 }
      }
    }
  }
};

// schemas/review-plan.schema.json
var review_plan_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/review-plan/v1",
  title: "ReviewPlan",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "candidates", "unclassifiedHunkRefs"],
  properties: {
    schemaVersion: { const: "1.0" },
    candidates: { type: "array", items: { $ref: "#/$defs/candidate" } },
    unclassifiedHunkRefs: {
      type: "array",
      items: { type: "string", pattern: "^hunk:" },
      uniqueItems: true
    }
  },
  $defs: {
    candidate: {
      type: "object",
      additionalProperties: false,
      required: ["id", "title", "reason", "fileRefs", "hunkRefs", "evidenceRefs"],
      properties: {
        id: { type: "string", pattern: "^change[-:]" },
        title: { type: "string", minLength: 1 },
        reason: { type: "string", minLength: 1 },
        fileRefs: {
          type: "array",
          items: { type: "string", pattern: "^file:" },
          uniqueItems: true
        },
        hunkRefs: {
          type: "array",
          items: { type: "string", pattern: "^hunk:" },
          minItems: 1,
          uniqueItems: true
        },
        evidenceRefs: {
          type: "array",
          items: { type: "string", pattern: "^evidence:" },
          uniqueItems: true
        }
      }
    }
  }
};

// schemas/review-state.schema.json
var review_state_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/review-state/v1.3",
  title: "ReviewState",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "reportId",
    "reportFingerprint",
    "revision",
    "updatedAt",
    "viewed",
    "judgments",
    "threadIds",
    "orphanedThreadIds"
  ],
  properties: {
    schemaVersion: { const: "1.3" },
    reportId: { type: "string", minLength: 1 },
    reportFingerprint: { type: "string", minLength: 8 },
    revision: { type: "integer", minimum: 0 },
    updatedAt: { type: "string", format: "date-time" },
    viewed: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["anchor", "state", "updatedAt"],
        properties: {
          anchor: { $ref: "#/$defs/reviewAnchor" },
          state: { enum: ["unseen", "viewed", "stale"] },
          updatedAt: { type: "string", format: "date-time" }
        }
      }
    },
    judgments: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["changeId", "state", "updatedAt"],
        properties: {
          changeId: { type: "string" },
          state: { enum: ["unreviewed", "reviewed", "follow-up", "blocked", "stale"] },
          updatedAt: { type: "string", format: "date-time" }
        }
      }
    },
    threadIds: { type: "array", items: { type: "string" }, uniqueItems: true },
    orphanedThreadIds: { type: "array", items: { type: "string" }, uniqueItems: true }
  },
  $defs: {
    reviewAnchor: {
      type: "object",
      additionalProperties: false,
      required: ["type", "ref", "fingerprint"],
      properties: {
        type: {
          enum: [
            "change",
            "file",
            "hunk",
            "line-range",
            "visual-target",
            "visual-region",
            "finding",
            "verification-gap"
          ]
        },
        ref: { type: "string", minLength: 1 },
        path: { type: "string" },
        side: { enum: ["before", "after", "diff"] },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
        targetRef: { type: "string" },
        region: { $ref: "#/$defs/region" },
        selectorHint: { type: "string" },
        fingerprint: { type: "string", minLength: 8 }
      }
    },
    region: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "width", "height"],
      properties: {
        x: { type: "number", minimum: 0 },
        y: { type: "number", minimum: 0 },
        width: { type: "number", exclusiveMinimum: 0 },
        height: { type: "number", exclusiveMinimum: 0 }
      }
    }
  }
};

// schemas/review-thread.schema.json
var review_thread_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/review-thread/v1",
  title: "ReviewThread",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "reportId",
    "anchor",
    "kind",
    "state",
    "messages",
    "agentAttention",
    "createdAt",
    "updatedAt"
  ],
  properties: {
    id: { type: "string", pattern: "^thread[-:]" },
    reportId: { type: "string" },
    anchor: { $ref: "#/$defs/reviewAnchor" },
    kind: { enum: ["note", "question", "finding", "change-request"] },
    state: { enum: ["open", "answered", "resolved", "stale", "orphaned"] },
    messages: { type: "array", items: { $ref: "#/$defs/message" } },
    agentAttention: {
      type: "object",
      additionalProperties: false,
      required: ["state"],
      properties: {
        state: {
          enum: ["none", "requested", "batched", "submitted", "acknowledged", "answered", "stale"]
        },
        batchId: { type: "string" },
        updatedAt: { type: "string", format: "date-time" }
      }
    },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" }
  },
  $defs: {
    reviewAnchor: {
      type: "object",
      additionalProperties: false,
      required: ["type", "ref", "fingerprint"],
      properties: {
        type: {
          enum: [
            "change",
            "file",
            "hunk",
            "line-range",
            "visual-target",
            "visual-region",
            "finding",
            "verification-gap"
          ]
        },
        ref: { type: "string" },
        path: { type: "string" },
        side: { enum: ["before", "after", "diff"] },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
        targetRef: { type: "string" },
        region: {
          type: "object",
          additionalProperties: false,
          required: ["x", "y", "width", "height"],
          properties: {
            x: { type: "number", minimum: 0 },
            y: { type: "number", minimum: 0 },
            width: { type: "number", exclusiveMinimum: 0 },
            height: { type: "number", exclusiveMinimum: 0 }
          }
        },
        selectorHint: { type: "string" },
        fingerprint: { type: "string", minLength: 8 }
      }
    },
    message: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "author", "body", "createdAt"],
      properties: {
        id: { type: "string" },
        kind: { enum: ["human-note", "agent-answer", "system"] },
        author: {
          type: "object",
          additionalProperties: false,
          required: ["type", "label"],
          properties: {
            type: { enum: ["human", "agent", "system"] },
            label: { type: "string" }
          }
        },
        body: { type: "string" },
        feedbackItemId: { type: "string" },
        evidenceRefs: { type: "array", items: { type: "string" } },
        createdAt: { type: "string", format: "date-time" }
      }
    }
  }
};

// packages/report-model/src/validator.ts
var schemaMap = {
  annotations: annotations_schema_default,
  config: config_schema_default,
  "context-pack": context_pack_schema_default,
  diff: diff_schema_default,
  "evidence-index": evidence_index_schema_default,
  "feedback-batch": feedback_batch_schema_default,
  "origin-session": origin_session_schema_default,
  report: report_schema_default,
  "review-answer": review_answer_schema_default,
  "review-plan": review_plan_schema_default,
  "review-state": review_state_schema_default,
  "review-thread": review_thread_schema_default
};
var schemaNames = Object.freeze(Object.keys(schemaMap));
var ajv = new import_ajv.default({ allErrors: true, strict: false, validateFormats: true });
(0, import_ajv_formats.default)(ajv);
var validators = /* @__PURE__ */ new Map();
for (const name of schemaNames) validators.set(name, ajv.compile(schemaMap[name]));
function validateStructuredHunks(hunks) {
  const errors = [];
  for (const hunk of hunks) {
    let oldCursor = hunk.oldStart;
    let newCursor = hunk.newStart;
    let oldObserved = 0;
    let newObserved = 0;
    for (const line of hunk.lines) {
      const expectedOld = line.kind === "context" || line.kind === "deletion" ? oldCursor++ : null;
      const expectedNew = line.kind === "context" || line.kind === "addition" ? newCursor++ : null;
      if (expectedOld !== null) oldObserved += 1;
      if (expectedNew !== null) newObserved += 1;
      if (line.oldLine !== expectedOld || line.newLine !== expectedNew) {
        errors.push(`${hunk.id} contains inconsistent line numbers`);
        break;
      }
    }
    if (oldObserved !== hunk.oldLines || newObserved !== hunk.newLines) {
      errors.push(`${hunk.id} contains inconsistent range counts`);
    }
  }
  return errors;
}
function formatError(error) {
  const location = error.instancePath || "/";
  return `${location} ${error.message ?? "is invalid"}`;
}
function validateArtifact(name, value) {
  const validator = validators.get(name);
  if (!validator) return { ok: false, errors: [`Unknown schema: ${name}`] };
  const valid = validator(value);
  return { ok: Boolean(valid), errors: valid ? [] : (validator.errors ?? []).map(formatError) };
}
function assertArtifact(name, value) {
  const result2 = validateArtifact(name, value);
  if (!result2.ok) {
    throw new UtsuriError(
      "SCHEMA_INVALID",
      `${name}: ${result2.errors.join("; ")}`,
      ExitCode.Artifact,
      { schema: name, errors: result2.errors }
    );
  }
}
function validateReportReferences(report) {
  const errors = [];
  const hunkIds = new Set(report.hunks.map((hunk) => hunk.id));
  const hunksById = new Map(report.hunks.map((hunk) => [hunk.id, hunk]));
  const evidenceIds = new Set(report.evidence.map((evidence) => evidence.id));
  const targetIds = new Set(report.targets.map((target) => target.id));
  const findingIds = new Set(report.findings.map((finding) => finding.id));
  const assigned = /* @__PURE__ */ new Map();
  errors.push(...validateStructuredHunks(report.hunks));
  const requireUniqueIds = (label, values) => {
    if (new Set(values).size !== values.length) errors.push(`${label} contains duplicate IDs`);
  };
  requireUniqueIds(
    "files",
    report.files.map((file) => file.id)
  );
  requireUniqueIds(
    "hunks",
    report.hunks.map((hunk) => hunk.id)
  );
  requireUniqueIds(
    "evidence",
    report.evidence.map((evidence) => evidence.id)
  );
  requireUniqueIds(
    "changes",
    report.changes.map((change) => change.id)
  );
  requireUniqueIds(
    "targets",
    report.targets.map((target) => target.id)
  );
  requireUniqueIds(
    "findings",
    report.findings.map((finding) => finding.id)
  );
  const unique = (label, values) => {
    if (new Set(values).size !== values.length)
      errors.push(`${label} contains duplicate references`);
  };
  for (const change of report.changes) {
    unique(`${change.id}.hunkRefs`, change.hunkRefs);
    unique(`${change.id}.targetRefs`, change.targetRefs);
    unique(`${change.id}.findingRefs`, change.findingRefs);
    for (const ref of change.hunkRefs) {
      if (!hunkIds.has(ref)) errors.push(`${change.id} references missing hunk ${ref}`);
      const previous = assigned.get(ref);
      if (previous) errors.push(`${ref} is assigned to both ${previous} and ${change.id}`);
      assigned.set(ref, change.id);
    }
    for (const ref of change.targetRefs) {
      if (!targetIds.has(ref)) errors.push(`${change.id} references missing target ${ref}`);
    }
    for (const ref of change.findingRefs) {
      if (!findingIds.has(ref)) errors.push(`${change.id} references missing finding ${ref}`);
    }
    for (const ref of change.intent.evidenceRefs) {
      if (!evidenceIds.has(ref)) errors.push(`${change.id} references missing evidence ${ref}`);
    }
  }
  const fileAssignments = /* @__PURE__ */ new Map();
  for (const file of report.files) {
    unique(`${file.id}.hunkRefs`, file.hunkRefs);
    for (const ref of file.hunkRefs) {
      if (!hunkIds.has(ref)) errors.push(`${file.id} references missing hunk ${ref}`);
      const previous = fileAssignments.get(ref);
      if (previous) errors.push(`${ref} belongs to both ${previous} and ${file.id}`);
      fileAssignments.set(ref, file.id);
      const hunk = hunksById.get(ref);
      const selectedPath = file.newPath ?? file.oldPath;
      if (hunk && (hunk.path !== selectedPath || hunk.oldPath !== file.oldPath || hunk.newPath !== file.newPath)) {
        errors.push(`${ref} path metadata does not match ${file.id}`);
      }
      if (hunk && hunk.lowSignal !== file.lowSignal) {
        errors.push(`${ref} low-signal classification does not match ${file.id}`);
      }
    }
    if (file.lowSignal !== file.lowSignalReasons.length > 0) {
      errors.push(`${file.id} low-signal reasons are inconsistent`);
    }
  }
  for (const hunkId2 of hunkIds) {
    if (!fileAssignments.has(hunkId2)) errors.push(`${hunkId2} does not belong to a file`);
  }
  for (const evidence of report.evidence) {
    unique(`${evidence.id}.hunkRefs`, evidence.hunkRefs);
    for (const ref of evidence.hunkRefs) {
      if (!hunkIds.has(ref)) errors.push(`${evidence.id} references missing hunk ${ref}`);
    }
  }
  unique("unclassifiedHunkRefs", report.unclassifiedHunkRefs);
  for (const ref of report.unclassifiedHunkRefs) {
    if (!hunkIds.has(ref)) errors.push(`unclassifiedHunkRefs references missing hunk ${ref}`);
    const previous = assigned.get(ref);
    if (previous) errors.push(`${ref} is both ${previous} and unclassified`);
    assigned.set(ref, "unclassified");
  }
  for (const hunkId2 of hunkIds) {
    if (!assigned.has(hunkId2)) errors.push(`${hunkId2} is neither classified nor unclassified`);
  }
  for (const finding of report.findings) {
    if (finding.targetRef && !targetIds.has(finding.targetRef)) {
      errors.push(`${finding.id} references missing target ${finding.targetRef}`);
    }
    for (const ref of finding.hunkRefs) {
      if (!hunkIds.has(ref)) errors.push(`${finding.id} references missing hunk ${ref}`);
    }
    for (const ref of finding.evidenceRefs) {
      if (!evidenceIds.has(ref)) errors.push(`${finding.id} references missing evidence ${ref}`);
    }
  }
  if (report.origin.reportId !== report.reportId)
    errors.push("origin.reportId does not match reportId");
  if (report.summary.filesChanged !== report.files.length)
    errors.push("summary.filesChanged is inconsistent");
  if (report.summary.additions !== report.files.reduce((sum, file) => sum + (file.additions ?? 0), 0)) {
    errors.push("summary.additions is inconsistent");
  }
  if (report.summary.deletions !== report.files.reduce((sum, file) => sum + (file.deletions ?? 0), 0)) {
    errors.push("summary.deletions is inconsistent");
  }
  return { ok: errors.length === 0, errors };
}
function validateDiffReferences(diff) {
  const errors = [];
  const hunkIds = new Set(diff.hunks.map((hunk) => hunk.id));
  const hunksById = new Map(diff.hunks.map((hunk) => [hunk.id, hunk]));
  errors.push(...validateStructuredHunks(diff.hunks));
  if (hunkIds.size !== diff.hunks.length) errors.push("hunks contains duplicate IDs");
  const fileIds = new Set(diff.files.map((file) => file.id));
  if (fileIds.size !== diff.files.length) errors.push("files contains duplicate IDs");
  const assigned = /* @__PURE__ */ new Map();
  for (const file of diff.files) {
    if (new Set(file.hunkRefs).size !== file.hunkRefs.length) {
      errors.push(`${file.id}.hunkRefs contains duplicate references`);
    }
    for (const reference of file.hunkRefs) {
      if (!hunkIds.has(reference)) errors.push(`${file.id} references missing hunk ${reference}`);
      const previous = assigned.get(reference);
      if (previous) errors.push(`${reference} belongs to both ${previous} and ${file.id}`);
      assigned.set(reference, file.id);
      const hunk = hunksById.get(reference);
      const selectedPath = file.newPath ?? file.oldPath;
      if (hunk && (hunk.path !== selectedPath || hunk.oldPath !== file.oldPath || hunk.newPath !== file.newPath)) {
        errors.push(`${reference} path metadata does not match ${file.id}`);
      }
      if (hunk && hunk.lowSignal !== file.lowSignal) {
        errors.push(`${reference} low-signal classification does not match ${file.id}`);
      }
    }
    if (file.lowSignal !== file.lowSignalReasons.length > 0) {
      errors.push(`${file.id} low-signal reasons are inconsistent`);
    }
  }
  for (const reference of hunkIds) {
    if (!assigned.has(reference)) errors.push(`${reference} does not belong to a file`);
  }
  const additions = diff.files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
  const deletions = diff.files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  const binaryFiles = diff.files.filter((file) => file.binary).length;
  const lowSignalFiles = diff.files.filter((file) => file.lowSignal).length;
  if (diff.summary.filesChanged !== diff.files.length)
    errors.push("summary.filesChanged is inconsistent");
  if (diff.summary.additions !== additions) errors.push("summary.additions is inconsistent");
  if (diff.summary.deletions !== deletions) errors.push("summary.deletions is inconsistent");
  if (diff.summary.binaryFiles !== binaryFiles) errors.push("summary.binaryFiles is inconsistent");
  if (diff.summary.lowSignalFiles !== lowSignalFiles)
    errors.push("summary.lowSignalFiles is inconsistent");
  return { ok: errors.length === 0, errors };
}
function validateReviewPlanReferences(plan, diff, evidenceIndex) {
  const errors = [];
  const hunkIds = new Set(diff.hunks.map((hunk) => hunk.id));
  const fileIds = new Set(diff.files.map((file) => file.id));
  const evidenceIds = new Set(evidenceIndex.evidence.map((evidence) => evidence.id));
  const hunkOwners = new Map(
    diff.files.flatMap((file) => file.hunkRefs.map((reference) => [reference, file.id]))
  );
  const assigned = /* @__PURE__ */ new Map();
  if (new Set(plan.candidates.map((candidate) => candidate.id)).size !== plan.candidates.length) {
    errors.push("candidates contains duplicate IDs");
  }
  if (evidenceIds.size !== evidenceIndex.evidence.length) {
    errors.push("evidence contains duplicate IDs");
  }
  for (const evidence of evidenceIndex.evidence) {
    for (const reference of evidence.hunkRefs) {
      if (!hunkIds.has(reference)) {
        errors.push(`${evidence.id} references missing hunk ${reference}`);
      }
    }
  }
  for (const candidate of plan.candidates) {
    for (const reference of candidate.fileRefs) {
      if (!fileIds.has(reference))
        errors.push(`${candidate.id} references missing file ${reference}`);
    }
    for (const reference of candidate.evidenceRefs) {
      if (!evidenceIds.has(reference))
        errors.push(`${candidate.id} references missing evidence ${reference}`);
    }
    for (const reference of candidate.hunkRefs) {
      if (!hunkIds.has(reference))
        errors.push(`${candidate.id} references missing hunk ${reference}`);
      const owner = hunkOwners.get(reference);
      if (owner && !candidate.fileRefs.includes(owner)) {
        errors.push(`${candidate.id} omits owning file ${owner} for ${reference}`);
      }
      const previous = assigned.get(reference);
      if (previous) errors.push(`${reference} is assigned to both ${previous} and ${candidate.id}`);
      assigned.set(reference, candidate.id);
    }
  }
  for (const reference of plan.unclassifiedHunkRefs) {
    if (!hunkIds.has(reference)) errors.push(`unclassified references missing hunk ${reference}`);
    const previous = assigned.get(reference);
    if (previous) errors.push(`${reference} is both ${previous} and unclassified`);
    assigned.set(reference, "unclassified");
  }
  for (const reference of hunkIds) {
    if (!assigned.has(reference)) errors.push(`${reference} is missing from the review plan`);
  }
  return { ok: errors.length === 0, errors };
}

// packages/security/src/index.ts
import { lstat, realpath } from "node:fs/promises";
import path4 from "node:path";
function securityError(id, message) {
  throw new UtsuriError(id, message, ExitCode.Security);
}
async function resolveContainedPath(rootInput, relativeInput, options = {}) {
  if (path4.isAbsolute(relativeInput) || relativeInput.includes("\0")) {
    securityError("SEC_PATH_RELATIVE", "Repository paths must be relative");
  }
  const root = await realpath(rootInput);
  const candidate = path4.resolve(root, relativeInput);
  const relative = path4.relative(root, candidate);
  if (relative === ".." || relative.startsWith(`..${path4.sep}`) || path4.isAbsolute(relative)) {
    securityError("SEC_PATH_TRAVERSAL", "Path escapes the allowed root");
  }
  let current = root;
  for (const segment of relative.split(path4.sep).filter(Boolean)) {
    current = path4.join(current, segment);
    try {
      const stat2 = await lstat(current);
      if (stat2.isSymbolicLink())
        securityError("SEC_PATH_SYMLINK", "Symbolic links are not allowed");
    } catch (error) {
      const code = error.code;
      if (code === "ENOENT" && options.allowMissing) break;
      if (code === "ENOENT") securityError("SEC_PATH_MISSING", "Path does not exist");
      throw error;
    }
  }
  return candidate;
}

// packages/git-collector/src/git-command.ts
import { spawn } from "node:child_process";
import { realpath as realpath2 } from "node:fs/promises";
import path5 from "node:path";
var maximumGitOutputBytes = 64 * 1024 * 1024;
var gitTimeoutMilliseconds = 6e4;
async function execute(cwd, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let settled = false;
    const timeout = { value: void 0 };
    const finish = (error, result2) => {
      if (settled) return;
      settled = true;
      if (timeout.value) clearTimeout(timeout.value);
      if (error) reject(error);
      else resolve(result2);
    };
    const collect = (target, chunk) => {
      bytes += chunk.length;
      if (bytes > maximumGitOutputBytes) {
        child.kill("SIGKILL");
        finish(
          new UtsuriError(
            "GIT_OUTPUT_LIMIT",
            `Git output exceeds ${maximumGitOutputBytes} bytes`,
            ExitCode.Artifact
          )
        );
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", (chunk) => collect(stdout, chunk));
    child.stderr.on("data", (chunk) => collect(stderr, chunk));
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE" && error.code !== "ERR_STREAM_DESTROYED") finish(error);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (status) => {
      const result2 = {
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        status: status ?? 1
      };
      const expected = options.expectedStatuses ?? [0];
      if (!expected.includes(result2.status)) {
        const diagnostic = result2.stderr.toString("utf8").trim().slice(0, 2e3);
        finish(
          new UtsuriError(
            "GIT_COMMAND_FAILED",
            diagnostic || `git ${args[0] ?? "command"} exited ${result2.status}`,
            ExitCode.Artifact
          )
        );
      } else finish(void 0, result2);
    });
    timeout.value = setTimeout(() => {
      child.kill("SIGKILL");
      finish(
        new UtsuriError(
          "GIT_COMMAND_TIMEOUT",
          `Git command exceeded ${gitTimeoutMilliseconds} ms`,
          ExitCode.Environment
        )
      );
    }, gitTimeoutMilliseconds);
    child.stdin.end(options.stdin ?? "");
  });
}
async function repositoryRoot(cwd) {
  const requested = await realpath2(cwd);
  const result2 = await execute(requested, ["rev-parse", "--show-toplevel"]);
  const root = await realpath2(result2.stdout.toString("utf8").trim());
  const relative = path5.relative(root, requested);
  if (relative === ".." || relative.startsWith(`..${path5.sep}`) || path5.isAbsolute(relative)) {
    throw new UtsuriError(
      "GIT_ROOT_MISMATCH",
      "Current directory is outside the resolved repository root",
      ExitCode.Security
    );
  }
  return root;
}
async function resolveCommit(root, reference) {
  const containsControlCharacter = [...reference].some((character) => {
    const code = character.codePointAt(0);
    return code <= 31 || code === 127;
  });
  if (!reference || reference.length > 1024 || containsControlCharacter || reference.startsWith("-")) {
    throw new UtsuriError(
      "GIT_REF_INVALID",
      "Git references must be plain non-option values",
      ExitCode.Arguments
    );
  }
  const result2 = await execute(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    "--end-of-options",
    `${reference}^{commit}`
  ]);
  return result2.stdout.toString("utf8").trim();
}
async function emptyTree(root) {
  const result2 = await execute(root, ["mktree"], { stdin: "" });
  return result2.stdout.toString("utf8").trim();
}
async function gitBuffer(root, args, expectedStatuses = [0], stdin) {
  return (await execute(root, args, { expectedStatuses, stdin })).stdout;
}

// packages/git-collector/src/patch.ts
import path6 from "node:path";
var maximumPatchBytes = 64 * 1024 * 1024;
var maximumFiles = 2e4;
var maximumHunks = 1e5;
var maximumLines = 2e6;
var utf8Decoder = new TextDecoder("utf-8", { fatal: true });
function patchError(id, message) {
  throw new UtsuriError(id, message, ExitCode.Artifact);
}
function decodeGitQuoted(value) {
  if (!value.startsWith('"')) return value;
  if (!value.endsWith('"')) patchError("PATCH_PATH_QUOTE", "Git path has an unterminated quote");
  const buffers = [];
  const literal = [];
  const flush = () => {
    if (literal.length > 0) buffers.push(Buffer.from(literal.splice(0).join(""), "utf8"));
  };
  for (let index = 1; index < value.length - 1; index += 1) {
    const character = value[index];
    if (character !== "\\") {
      literal.push(character);
      continue;
    }
    flush();
    const escaped = value[++index];
    if (escaped === void 0) patchError("PATCH_PATH_ESCAPE", "Git path has an invalid escape");
    const simple = {
      a: 7,
      b: 8,
      t: 9,
      n: 10,
      v: 11,
      f: 12,
      r: 13,
      '"': 34,
      "\\": 92
    };
    if (simple[escaped] !== void 0) {
      buffers.push(Buffer.from([simple[escaped]]));
      continue;
    }
    if (/[0-7]/u.test(escaped)) {
      let octal = escaped;
      while (octal.length < 3 && /[0-7]/u.test(value[index + 1] ?? "")) {
        octal += value[++index];
      }
      buffers.push(Buffer.from([Number.parseInt(octal, 8)]));
      continue;
    }
    patchError("PATCH_PATH_ESCAPE", `Git path contains unsupported escape \\${escaped}`);
  }
  flush();
  try {
    return utf8Decoder.decode(Buffer.concat(buffers));
  } catch {
    return patchError("PATCH_PATH_ENCODING", "Git path is not valid UTF-8");
  }
}
function tokenizeGitHeader(value) {
  const tokens = [];
  for (let index = 0; index < value.length; ) {
    while (value[index] === " ") index += 1;
    if (index >= value.length) break;
    const start = index;
    if (value[index] === '"') {
      index += 1;
      let escaped = false;
      while (index < value.length) {
        const character = value[index++];
        if (character === '"' && !escaped) break;
        if (character === "\\" && !escaped) escaped = true;
        else escaped = false;
      }
    } else {
      while (index < value.length && value[index] !== " ") index += 1;
    }
    tokens.push(decodeGitQuoted(value.slice(start, index)));
  }
  return tokens;
}
function normalizePatchPath(value, prefix) {
  const decoded = decodeGitQuoted(value);
  if (decoded === "/dev/null") return null;
  const withoutPrefix = prefix && decoded.startsWith(prefix) ? decoded.slice(prefix.length) : decoded;
  if (withoutPrefix.includes("\\")) {
    throw new UtsuriError(
      "PATCH_PATH_BACKSLASH",
      "Git patch paths must use forward slashes",
      ExitCode.Security
    );
  }
  const slashPath = withoutPrefix;
  if (path6.posix.isAbsolute(slashPath) || slashPath.includes("\0") || slashPath.split("/").includes("..")) {
    throw new UtsuriError(
      "PATCH_PATH_INVALID",
      `Patch path escapes the repository: ${withoutPrefix}`,
      ExitCode.Security
    );
  }
  const normalized = normalizeRepositoryPath(slashPath);
  if (!normalized || normalized === ".") patchError("PATCH_PATH_INVALID", "Patch path is empty");
  return normalized;
}
function initialFile(oldPath, newPath) {
  return {
    status: "modified",
    oldPath,
    newPath,
    binary: false,
    submodule: false,
    oldMode: null,
    newMode: null,
    oldOid: null,
    newOid: null,
    similarity: null,
    hunks: []
  };
}
function statusFromCode(code) {
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code.startsWith("R")) return "renamed";
  if (code.startsWith("C")) return "copied";
  if (code === "T") return "type-changed";
  if (code === "U") return "unmerged";
  if (code === "M") return "modified";
  return "unknown";
}
function finalizeHunk(file, hunk) {
  if (!hunk) return null;
  const oldObserved = hunk.lines.filter(
    (line) => line.kind === "context" || line.kind === "deletion"
  ).length;
  const newObserved = hunk.lines.filter(
    (line) => line.kind === "context" || line.kind === "addition"
  ).length;
  if (oldObserved !== hunk.oldLines || newObserved !== hunk.newLines) {
    patchError(
      "PATCH_HUNK_RANGE",
      `Hunk range declares -${hunk.oldLines}/+${hunk.newLines} but contains -${oldObserved}/+${newObserved}`
    );
  }
  const selectedPath = file.newPath ?? file.oldPath;
  if (!selectedPath) patchError("PATCH_PATH_MISSING", "Hunk has no repository path");
  file.hunks.push(
    createGitHunk({
      path: selectedPath,
      oldPath: file.oldPath,
      newPath: file.newPath,
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      heading: hunk.heading,
      lines: hunk.lines
    })
  );
  return null;
}
function materializeFile(file) {
  const selectedPath = file.newPath ?? file.oldPath;
  if (!selectedPath) patchError("PATCH_PATH_MISSING", "Diff file has no repository path");
  const additions = file.binary ? null : file.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind === "addition").length;
  const deletions = file.binary ? null : file.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind === "deletion").length;
  const content = file.hunks.flatMap((hunk) => hunk.lines.map((line) => line.content));
  const lowSignalReasons = classifyLowSignal(selectedPath, { binary: file.binary, content });
  const hunks = file.hunks.map((hunk) => ({ ...hunk, lowSignal: lowSignalReasons.length > 0 }));
  return {
    file: {
      id: createGitFileId(file.oldPath, file.newPath),
      status: file.status,
      oldPath: file.oldPath,
      newPath: file.newPath,
      additions,
      deletions,
      binary: file.binary,
      submodule: file.submodule || file.oldMode === "160000" || file.newMode === "160000",
      oldMode: file.oldMode,
      newMode: file.newMode,
      oldOid: file.oldOid,
      newOid: file.newOid,
      similarity: file.similarity,
      lowSignal: lowSignalReasons.length > 0,
      lowSignalReasons,
      hunkRefs: hunks.map((hunk) => hunk.id)
    },
    hunks
  };
}
function applyNameStatus(document, raw) {
  const tokens = raw.split("\0");
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const separator = token.indexOf("	");
    const code = separator === -1 ? token : token.slice(0, separator);
    const encodedFirstPath = separator === -1 ? tokens[++index] ?? "" : token.slice(separator + 1);
    const firstPath = normalizePatchPath(encodedFirstPath);
    const secondPath = code.startsWith("R") || code.startsWith("C") ? normalizePatchPath(tokens[++index] ?? "") : null;
    const oldPath = secondPath ? firstPath : code === "D" ? firstPath : null;
    const newPath = secondPath ?? (code === "D" ? null : firstPath);
    const match = document.files.find(
      (file) => (oldPath === null || file.oldPath === oldPath) && (newPath === null || file.newPath === newPath)
    );
    if (!match) continue;
    match.status = statusFromCode(code[0] ?? "?");
    if ((code.startsWith("R") || code.startsWith("C")) && /^\d+$/u.test(code.slice(1))) {
      match.similarity = Number(code.slice(1));
    }
  }
  return document;
}
function applyNumstat(document, raw) {
  const tokens = raw.split("\0");
  const appliedFileIds = /* @__PURE__ */ new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const firstTab = token.indexOf("	");
    const secondTab = token.indexOf("	", firstTab + 1);
    if (firstTab === -1 || secondTab === -1) {
      patchError("GIT_NUMSTAT", "numstat output is malformed");
    }
    const added = token.slice(0, firstTab);
    const deleted = token.slice(firstTab + 1, secondTab);
    const pathname = token.slice(secondTab + 1);
    const renamed = pathname === "";
    const oldPath = normalizePatchPath(renamed ? tokens[++index] ?? "" : pathname);
    const newPath = renamed ? normalizePatchPath(tokens[++index] ?? "") : oldPath;
    const match = document.files.find(
      (file) => !appliedFileIds.has(file.id) && (renamed ? file.oldPath === oldPath && file.newPath === newPath : file.newPath === null ? file.oldPath === oldPath : file.newPath === newPath)
    );
    if (!match) {
      patchError("GIT_NUMSTAT_MATCH", "numstat entry does not match a parsed diff file");
    }
    appliedFileIds.add(match.id);
    match.additions = added === "-" ? null : Number(added);
    match.deletions = deleted === "-" ? null : Number(deleted);
    match.binary = added === "-" || deleted === "-";
  }
  if (appliedFileIds.size !== document.files.length) {
    patchError("GIT_NUMSTAT_MATCH", "numstat entries do not cover every parsed diff file");
  }
  document.summary.additions = document.files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
  document.summary.deletions = document.files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  document.summary.binaryFiles = document.files.filter((file) => file.binary).length;
  return document;
}
function parseGitPatch(patch, input) {
  if (Buffer.byteLength(patch) > maximumPatchBytes) {
    patchError("PATCH_TOO_LARGE", `Patch exceeds ${maximumPatchBytes} bytes`);
  }
  const lines = patch.replaceAll("\r\n", "\n").split("\n");
  const materialized = [];
  let file = null;
  let hunk = null;
  let lineCount = 0;
  const closeFile = () => {
    if (!file) return;
    hunk = finalizeHunk(file, hunk);
    materialized.push(materializeFile(file));
    file = null;
    if (materialized.length > maximumFiles)
      patchError("PATCH_FILE_LIMIT", "Patch has too many files");
  };
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      closeFile();
      const paths = tokenizeGitHeader(line.slice("diff --git ".length));
      if (paths.length !== 2)
        patchError("PATCH_DIFF_HEADER", "diff --git header must contain two paths");
      file = initialFile(normalizePatchPath(paths[0], "a/"), normalizePatchPath(paths[1], "b/"));
      continue;
    }
    if (!file) {
      if (line.trim() !== "") patchError("PATCH_PREAMBLE", "Only Git-format patches are accepted");
      continue;
    }
    const hunkHeader = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/u);
    if (hunkHeader) {
      hunk = finalizeHunk(file, hunk);
      const oldStart = Number(hunkHeader[1]);
      const oldLines = Number(hunkHeader[2] ?? "1");
      const newStart = Number(hunkHeader[3]);
      const newLines = Number(hunkHeader[4] ?? "1");
      hunk = {
        oldStart,
        oldLines,
        newStart,
        newLines,
        heading: hunkHeader[5] ?? "",
        oldCursor: oldStart,
        newCursor: newStart,
        lines: []
      };
      continue;
    }
    if (hunk) {
      const prefix = line[0];
      if (prefix === " " || prefix === "+" || prefix === "-" || line === "\\ No newline at end of file") {
        if (line === "\\ No newline at end of file") {
          hunk.lines.push({ kind: "no-newline", content: line, oldLine: null, newLine: null });
        } else if (prefix === " ") {
          hunk.lines.push({
            kind: "context",
            content: line.slice(1),
            oldLine: hunk.oldCursor++,
            newLine: hunk.newCursor++
          });
        } else if (prefix === "+") {
          hunk.lines.push({
            kind: "addition",
            content: line.slice(1),
            oldLine: null,
            newLine: hunk.newCursor++
          });
        } else {
          hunk.lines.push({
            kind: "deletion",
            content: line.slice(1),
            oldLine: hunk.oldCursor++,
            newLine: null
          });
        }
        lineCount += 1;
        if (lineCount > maximumLines) patchError("PATCH_LINE_LIMIT", "Patch has too many lines");
        continue;
      }
      hunk = finalizeHunk(file, hunk);
    }
    if (line.startsWith("new file mode ")) {
      file.status = "added";
      file.oldPath = null;
      file.newMode = line.slice("new file mode ".length);
    } else if (line.startsWith("deleted file mode ")) {
      file.status = "deleted";
      file.newPath = null;
      file.oldMode = line.slice("deleted file mode ".length);
    } else if (line.startsWith("old mode ")) {
      file.oldMode = line.slice("old mode ".length);
    } else if (line.startsWith("new mode ")) {
      file.newMode = line.slice("new mode ".length);
    } else if (line.startsWith("similarity index ")) {
      file.similarity = Number.parseInt(line.slice("similarity index ".length), 10);
    } else if (line.startsWith("rename from ")) {
      file.status = "renamed";
      file.oldPath = normalizePatchPath(line.slice("rename from ".length));
    } else if (line.startsWith("rename to ")) {
      file.status = "renamed";
      file.newPath = normalizePatchPath(line.slice("rename to ".length));
    } else if (line.startsWith("copy from ")) {
      file.status = "copied";
      file.oldPath = normalizePatchPath(line.slice("copy from ".length));
    } else if (line.startsWith("copy to ")) {
      file.status = "copied";
      file.newPath = normalizePatchPath(line.slice("copy to ".length));
    } else if (line.startsWith("index ")) {
      const match = line.match(/^index ([a-f0-9]+)\.\.([a-f0-9]+)(?: ([0-7]{6}))?$/u);
      if (!match) patchError("PATCH_INDEX", "Git index metadata is malformed");
      file.oldOid = match[1];
      file.newOid = match[2];
      if (match[3]) {
        file.oldMode ??= match[3];
        file.newMode ??= match[3];
      }
    } else if (line.startsWith("--- ")) {
      file.oldPath = normalizePatchPath(line.slice(4), "a/");
    } else if (line.startsWith("+++ ")) {
      file.newPath = normalizePatchPath(line.slice(4), "b/");
    } else if (line.startsWith("Binary files ") || line === "GIT binary patch") {
      file.binary = true;
    } else if (line.startsWith("Subproject commit ")) {
      file.submodule = true;
    }
  }
  closeFile();
  const hunks = materialized.flatMap((entry) => entry.hunks);
  if (hunks.length > maximumHunks) patchError("PATCH_HUNK_LIMIT", "Patch has too many hunks");
  const files = materialized.map((entry) => entry.file);
  return {
    schemaVersion: "1.0",
    input: {
      mode: input.mode,
      base: input.base,
      head: input.head,
      mergeBase: input.mergeBase,
      patchPath: input.patchPath
    },
    repository: { fingerprint: input.repositoryFingerprint },
    sourceDigests: input.sourceDigests,
    summary: {
      filesChanged: files.length,
      additions: files.reduce((sum, entry) => sum + (entry.additions ?? 0), 0),
      deletions: files.reduce((sum, entry) => sum + (entry.deletions ?? 0), 0),
      binaryFiles: files.filter((entry) => entry.binary).length,
      lowSignalFiles: files.filter((entry) => entry.lowSignal).length
    },
    files,
    hunks
  };
}

// packages/git-collector/src/index.ts
var patchFlags = [
  "--binary",
  "--full-index",
  "--no-ext-diff",
  "--no-color",
  "--find-renames",
  "--find-copies",
  "--unified=20"
];
var utf8Decoder2 = new TextDecoder("utf-8", { fatal: true });
function decodeGitText(value, label) {
  try {
    return utf8Decoder2.decode(value);
  } catch {
    throw new UtsuriError("GIT_OUTPUT_ENCODING", `${label} is not valid UTF-8`, ExitCode.Artifact);
  }
}
function selectMode(options) {
  const modes = [
    options.patch ? "patch" : null,
    options.worktree ? "worktree" : null,
    options.mergeBase ? "merge-base" : null,
    options.base ? "range" : null
  ].filter((mode2) => mode2 !== null);
  if (modes.length !== 1) {
    throw new UtsuriError(
      "COLLECT_MODE_REQUIRED",
      "Select exactly one input mode: --patch, --worktree, --base/--head, or --merge-base/--head",
      ExitCode.Arguments
    );
  }
  const mode = modes[0];
  if (mode === "patch" && (options.worktree || options.base !== void 0 || options.head !== void 0 || options.mergeBase !== void 0) || mode === "worktree" && (options.patch !== void 0 || options.base !== void 0 || options.head !== void 0 || options.mergeBase !== void 0)) {
    throw new UtsuriError(
      "COLLECT_MODE_CONFLICT",
      `${mode} mode does not accept options from another input mode`,
      ExitCode.Arguments
    );
  }
  if ((mode === "range" || mode === "merge-base") && !options.head) {
    throw new UtsuriError(
      "COLLECT_HEAD_REQUIRED",
      `${mode} mode requires --head`,
      ExitCode.Arguments
    );
  }
  return mode;
}
async function appendUntracked(root, patch, numstat) {
  const untracked = decodeGitText(
    await gitBuffer(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
    "Untracked path list"
  ).split("\0").filter(Boolean).sort();
  const patchParts = [patch];
  const numstatParts = [numstat];
  for (const relative of untracked) {
    if (relative.includes("\\") || relative.split("/").includes("..") || path7.posix.isAbsolute(relative)) {
      throw new UtsuriError(
        "GIT_UNTRACKED_PATH",
        "Git returned an unsafe untracked path",
        ExitCode.Security
      );
    }
    const normalized = relative;
    const [patchOutput, numstatOutput] = await Promise.all([
      gitBuffer(root, ["diff", "--no-index", ...patchFlags, "--", "/dev/null", normalized], [0, 1]),
      gitBuffer(
        root,
        [
          "diff",
          "--no-index",
          "--no-ext-diff",
          "--no-color",
          "--numstat",
          "-z",
          "--",
          "/dev/null",
          normalized
        ],
        [0, 1]
      )
    ]);
    patchParts.push(patchOutput);
    numstatParts.push(numstatOutput);
  }
  return {
    patch: Buffer.concat(
      patchParts.map(
        (part, index) => index > 0 && patchParts[index - 1]?.at(-1) !== 10 ? Buffer.concat([Buffer.from("\n"), part]) : part
      )
    ),
    numstat: Buffer.concat(numstatParts)
  };
}
async function collectSource(root, options) {
  const mode = selectMode(options);
  if (mode === "patch") {
    const filename = await resolveContainedPath(root, options.patch);
    const patch2 = await readFile(filename);
    return {
      mode,
      patch: patch2,
      base: null,
      head: null,
      mergeBase: null,
      patchPath: path7.relative(root, filename).replaceAll(path7.sep, "/"),
      numstat: null,
      nameStatus: null,
      summary: null,
      raw: null,
      commits: null
    };
  }
  let base;
  let head;
  let mergeBase = null;
  let workingTree = false;
  if (mode === "worktree") {
    base = await resolveCommit(root, "HEAD").catch(() => emptyTree(root));
    head = "worktree";
    workingTree = true;
  } else if (mode === "range") {
    base = await resolveCommit(root, options.base);
    workingTree = options.head === "worktree";
    head = workingTree ? "worktree" : await resolveCommit(root, options.head);
  } else {
    const comparisonBase = await resolveCommit(root, options.mergeBase);
    workingTree = options.head === "worktree";
    const headCommit = workingTree ? await resolveCommit(root, "HEAD") : await resolveCommit(root, options.head);
    mergeBase = (await gitBuffer(root, ["merge-base", comparisonBase, headCommit])).toString("utf8").trim();
    base = comparisonBase;
    head = workingTree ? "worktree" : headCommit;
  }
  const diffBase = mergeBase ?? base;
  const revisions = workingTree ? [diffBase] : [diffBase, head];
  const common = ["diff", ...patchFlags, ...revisions, "--"];
  let patch = await gitBuffer(root, common);
  const metadataBase = ["diff", "--no-ext-diff", "--no-color", "--find-renames", "--find-copies"];
  const [trackedNumstat, nameStatus, summary, raw, commits] = await Promise.all([
    gitBuffer(root, [...metadataBase, "--numstat", "-z", ...revisions, "--"]),
    gitBuffer(root, [...metadataBase, "--name-status", "-z", ...revisions, "--"]),
    gitBuffer(root, [...metadataBase, "--summary", ...revisions, "--"]),
    gitBuffer(root, [...metadataBase, "--raw", "--full-index", "-z", ...revisions, "--"]),
    gitBuffer(root, [
      "log",
      "--format=%H%x00%P%x00%s%x00",
      `${diffBase}..${workingTree ? "HEAD" : head}`
    ])
  ]);
  let numstat = trackedNumstat;
  if (workingTree) {
    const withUntracked = await appendUntracked(root, patch, numstat);
    patch = withUntracked.patch;
    numstat = withUntracked.numstat;
  }
  return {
    mode,
    patch,
    base,
    head,
    mergeBase,
    patchPath: null,
    numstat,
    nameStatus,
    summary,
    raw,
    commits
  };
}
function sourceDigests(source) {
  const digest = (value) => value === null ? null : sha256(value);
  return {
    patch: sha256(source.patch),
    numstat: digest(source.numstat),
    nameStatus: digest(source.nameStatus),
    summary: digest(source.summary),
    raw: digest(source.raw),
    commits: digest(source.commits)
  };
}
async function writeRun(root, output, source, diff, evidenceIndex, reviewPlan) {
  const outputPath = await resolveContainedPath(root, output, { allowMissing: true });
  const relative = path7.relative(root, outputPath);
  if (relative === ".git" || relative.startsWith(`.git${path7.sep}`)) {
    throw new UtsuriError(
      "COLLECT_OUTPUT_GIT",
      "Run output must not be inside .git",
      ExitCode.Security
    );
  }
  const parent = path7.dirname(outputPath);
  await resolveContainedPath(root, path7.relative(root, parent), { allowMissing: true });
  await mkdir(parent, { recursive: true, mode: 448 });
  await resolveContainedPath(root, path7.relative(root, parent));
  await mkdir(outputPath, { mode: 448 }).catch((error) => {
    if (error.code === "EEXIST") {
      throw new UtsuriError(
        "COLLECT_OUTPUT_EXISTS",
        "Run output already exists and will not be replaced",
        ExitCode.Artifact
      );
    }
    throw error;
  });
  try {
    await mkdir(path7.join(outputPath, "logs"));
    const input = {
      schemaVersion: "1.0",
      mode: source.mode,
      base: source.base,
      head: source.head,
      mergeBase: source.mergeBase,
      patchPath: source.patchPath
    };
    const writes = [
      ["input.json", `${JSON.stringify(input, null, 2)}
`],
      ["diff.patch", source.patch],
      ["diff.json", `${JSON.stringify(diff, null, 2)}
`],
      ["evidence-index.json", `${JSON.stringify(evidenceIndex, null, 2)}
`],
      ["review-plan.json", `${JSON.stringify(reviewPlan, null, 2)}
`],
      [
        "logs/collect.ndjson",
        `${JSON.stringify({
          event: "collect.completed",
          mode: source.mode,
          filesChanged: diff.summary.filesChanged,
          hunks: diff.hunks.length,
          sourceDigests: diff.sourceDigests
        })}
`
      ]
    ];
    await Promise.all(
      writes.map(([name, value]) => writeFile(path7.join(outputPath, name), value, { flag: "wx" }))
    );
  } catch (error) {
    await writeFile(
      path7.join(outputPath, "logs/collect-error.ndjson"),
      `${JSON.stringify({ event: "collect.failed", message: error instanceof Error ? error.message : String(error) })}
`,
      { flag: "wx" }
    ).catch(() => void 0);
    throw error;
  }
  return await realpath3(outputPath);
}
async function collectGit(options) {
  const root = await repositoryRoot(options.cwd);
  const source = await collectSource(root, options);
  const patch = decodeGitText(source.patch, "Git patch");
  const fingerprint = stableHash({ repositoryRoot: root }).slice(0, 32);
  let diff = parseGitPatch(patch, {
    mode: source.mode,
    base: source.base,
    head: source.head,
    mergeBase: source.mergeBase,
    patchPath: source.patchPath,
    repositoryFingerprint: fingerprint,
    sourceDigests: sourceDigests(source)
  });
  if (source.nameStatus) {
    diff = applyNameStatus(diff, decodeGitText(source.nameStatus, "Git name-status output"));
  }
  if (source.numstat) {
    diff = applyNumstat(diff, decodeGitText(source.numstat, "Git numstat output"));
  }
  assertArtifact("diff", diff);
  const diffReferences = validateDiffReferences(diff);
  if (!diffReferences.ok) {
    throw new UtsuriError(
      "DIFF_REFERENCE_INVALID",
      diffReferences.errors.join("; "),
      ExitCode.Artifact
    );
  }
  const evidenceIndex = createEvidenceIndex(diff);
  const reviewPlan = createReviewPlan(diff, evidenceIndex);
  assertArtifact("evidence-index", evidenceIndex);
  assertArtifact("review-plan", reviewPlan);
  const reviewReferences = validateReviewPlanReferences(reviewPlan, diff, evidenceIndex);
  if (!reviewReferences.ok) {
    throw new UtsuriError(
      "REVIEW_PLAN_INVALID",
      reviewReferences.errors.join("; "),
      ExitCode.Artifact
    );
  }
  const runDirectory = await writeRun(
    root,
    options.output,
    source,
    diff,
    evidenceIndex,
    reviewPlan
  );
  return { root, runDirectory, patch, diff, evidenceIndex, reviewPlan };
}

// packages/report-builder/src/index.ts
import { createHash as createHash2, randomUUID } from "node:crypto";
import { constants as constants2 } from "node:fs";
import { access as access2, lstat as lstat3, mkdir as mkdir2, open, readdir, realpath as realpath4, stat, writeFile as writeFile2 } from "node:fs/promises";
import path9 from "node:path";

// packages/report-builder/src/generated-ui-assets.ts
var reportUiJavaScript = 'typeof window<"u"&&((window.__svelte??={}).v??=new Set).add("5");let hn=!1,Na=!1;function Oa(){hn=!0}Oa();const $a=1,Fa=2,Ti=4,Pa=8,Ha=16,Ua=2,J=Symbol("uninitialized"),ja="http://www.w3.org/1999/xhtml",Ci=!1;var Ai=Array.isArray,Ba=Array.prototype.indexOf,In=Array.prototype.includes,Fn=Array.from,Va=Object.defineProperty,on=Object.getOwnPropertyDescriptor,Ri=Object.getOwnPropertyDescriptors,za=Object.prototype,Ya=Array.prototype,hr=Object.getPrototypeOf,fi=Object.isExtensible;const Ga=()=>{};function Wa(e){return e()}function ir(e){for(var t=0;t<e.length;t++)e[t]()}function Li(){var e,t,n=new Promise((s,i)=>{e=s,t=i});return{promise:n,resolve:e,reject:t}}const ne=2,dn=4,_n=8,Ii=1<<24,Pe=16,Re=32,rt=64,sr=128,Te=512,K=1024,Q=2048,Ce=4096,ue=8192,Ae=16384,Bt=32768,ui=1<<25,Ht=65536,Mn=1<<17,Ka=1<<18,Vt=1<<19,Mi=1<<20,ze=1<<25,At=65536,qn=1<<21,Pt=1<<22,dt=1<<23,fn=Symbol("$state"),Qa=Symbol(""),qi=Symbol("attributes"),ar=Symbol("class"),Xa=Symbol("style"),lr=Symbol("text"),An=Symbol("form reset"),pn=new class extends Error{name="StaleReactionError";message="The reaction that called `getAbortSignal()` was re-run or destroyed"};function Za(e){throw new Error("https://svelte.dev/e/lifecycle_outside_component")}function Ja(){throw new Error("https://svelte.dev/e/async_derived_orphan")}function el(e,t,n){throw new Error("https://svelte.dev/e/each_key_duplicate")}function tl(e){throw new Error("https://svelte.dev/e/effect_in_teardown")}function nl(){throw new Error("https://svelte.dev/e/effect_in_unowned_derived")}function rl(e){throw new Error("https://svelte.dev/e/effect_orphan")}function il(){throw new Error("https://svelte.dev/e/effect_update_depth_exceeded")}function sl(){throw new Error("https://svelte.dev/e/state_descriptors_fixed")}function al(){throw new Error("https://svelte.dev/e/state_prototype_fixed")}function ll(){throw new Error("https://svelte.dev/e/state_unsafe_mutation")}function ol(){throw new Error("https://svelte.dev/e/svelte_boundary_reset_onerror")}function fl(){console.warn("https://svelte.dev/e/derived_inert")}function ul(){console.warn("https://svelte.dev/e/svelte_boundary_reset_noop")}function Di(e){return e===this.v}function cl(e,t){return e!=e?t==t:e!==t||e!==null&&typeof e=="object"||typeof e=="function"}function Ni(e){return!cl(e,this.v)}let H=null;function Ut(e){H=e}function Oi(e,t=!1,n){H={p:H,i:!1,c:null,e:null,s:e,x:null,r:L,l:hn&&!t?{s:null,u:null,$:[]}:null}}function $i(e){var t=H,n=t.e;if(n!==null){t.e=null;for(var s of n)ts(s)}return t.i=!0,H=t.p,{}}function gn(){return!hn||H!==null&&H.l===null}let kt=[];function Fi(){var e=kt;kt=[],ir(e)}function ut(e){if(kt.length===0&&!un){var t=kt;queueMicrotask(()=>{t===kt&&Fi()})}kt.push(e)}function dl(){for(;kt.length>0;)Fi()}function Pi(e){var t=L;if(t===null)return I.f|=dt,e;if((t.f&Bt)===0&&(t.f&dn)===0)throw e;ct(e,t)}function ct(e,t){if(!(t!==null&&(t.f&Ae)!==0)){for(;t!==null;){if((t.f&sr)!==0){if((t.f&Bt)===0)throw e;try{t.b.error(e);return}catch(n){e=n}}t=t.parent}throw e}}const vl=-7169;function z(e,t){e.f=e.f&vl|t}function _r(e){(e.f&Te)!==0||e.deps===null?z(e,K):z(e,Ce)}function Hi(e){if(e!==null)for(const t of e)(t.f&ne)===0||(t.f&At)===0||(t.f^=At,Hi(t.deps))}function Ui(e,t,n){(e.f&Q)!==0?t.add(e):(e.f&Ce)!==0&&n.add(e),Hi(e.deps),z(e,K)}let ci=!1;function hl(){ci||(ci=!0,document.addEventListener("reset",e=>{Promise.resolve().then(()=>{if(!e.defaultPrevented)for(const t of e.target.elements)t[An]?.()})},{capture:!0}))}function mn(e){var t=I,n=L;Le(null),Ie(null);try{return e()}finally{Le(t),Ie(n)}}function _l(e,t,n,s=n){e.addEventListener(t,()=>mn(n));const i=e[An];i?e[An]=()=>{i(),s(!0)}:e[An]=()=>s(!0),hl()}function pl(e){let t=0,n=Rt(0),s;return()=>{wr()&&(r(n),Pn(()=>(t===0&&(s=f(()=>e(()=>cn(n)))),t+=1,()=>{ut(()=>{t-=1,t===0&&(s?.(),s=void 0,cn(n))})})))}}var gl=Ht|Vt;function ml(e,t,n,s){new yl(e,t,n,s)}class yl{parent;is_pending=!1;transform_error;#t;#a=null;#e;#o;#r;#s=null;#n=null;#l=null;#i=null;#_=0;#f=0;#u=!1;#d=new Set;#p=new Set;#c=null;#m=pl(()=>(this.#c=Rt(this.#_),()=>{this.#c=null}));constructor(t,n,s,i){this.#t=t,this.#e=n,this.#o=a=>{var u=L;u.b=this,u.f|=sr,s(a)},this.parent=L.b,this.transform_error=i??this.parent?.transform_error??(a=>a),this.#r=xr(()=>{this.#v()},gl)}#g(){try{this.#s=Se(()=>this.#o(this.#t))}catch(t){this.error(t)}}#w(t){const n=this.#e.failed,{reset:s,invoke_onerror:i}=this.#y(t);ut(i),n&&(this.#l=Se(()=>{n(this.#t,()=>t,()=>s)}))}#y(t){var n=!1,s=!1;const i=()=>{if(n){ul();return}n=!0,s&&ol(),this.#l!==null&&Tt(this.#l,()=>{this.#l=null}),this.#h(()=>{this.#v()})};return{reset:i,invoke_onerror:()=>{try{s=!0,this.#e.onerror?.(t,i),s=!1}catch(u){ct(u,this.#r&&this.#r.parent)}}}}#x(){const t=this.#e.pending;t&&(this.is_pending=!0,this.#n=Se(()=>t(this.#t)),ut(()=>{var n=this.#i=document.createDocumentFragment(),s=vt();n.append(s),this.#s=this.#h(()=>Se(()=>this.#o(s))),this.#f===0&&(this.#t.before(n),this.#i=null,Tt(this.#n,()=>{this.#n=null}),this.#b(A))}))}#v(){try{if(this.is_pending=this.has_pending_snippet(),this.#f=0,this.#_=0,this.#s=Se(()=>{this.#o(this.#t)}),this.#f>0){var t=this.#i=document.createDocumentFragment();Er(this.#s,t);const n=this.#e.pending;this.#n=Se(()=>n(this.#t))}else this.#b(A)}catch(n){this.error(n)}}#b(t){this.is_pending=!1,t.transfer_effects(this.#d,this.#p)}defer_effect(t){Ui(t,this.#d,this.#p)}is_rendered(){return!this.is_pending&&(!this.parent||this.parent.is_rendered())}has_pending_snippet(){return!!this.#e.pending}#h(t){var n=L,s=I,i=H;Ie(this.#r),Le(this.#r),Ut(this.#r.ctx);try{return ht.ensure(),t()}catch(a){return Pi(a),null}finally{Ie(n),Le(s),Ut(i)}}#k(t,n){if(!this.has_pending_snippet()){this.parent&&this.parent.#k(t,n);return}this.#f+=t,this.#f===0&&(this.#b(n),this.#n&&Tt(this.#n,()=>{this.#n=null}),this.#i&&(this.#t.before(this.#i),this.#i=null))}update_pending_count(t,n){this.#k(t,n),this.#_+=t,!(!this.#c||this.#u)&&(this.#u=!0,ut(()=>{this.#u=!1,this.#c&&jt(this.#c,this.#_)}))}get_effect_pending(){return this.#m(),r(this.#c)}error(t){if(!this.#e.onerror&&!this.#e.failed)throw t;A?.is_fork?(this.#s&&A.skip_effect(this.#s),this.#n&&A.skip_effect(this.#n),this.#l&&A.skip_effect(this.#l),A.oncommit(()=>{this.#E(t)})):this.#E(t)}#E(t){this.#s&&(ve(this.#s),this.#s=null),this.#n&&(ve(this.#n),this.#n=null),this.#l&&(ve(this.#l),this.#l=null);let n=this.#e.failed;const s=i=>{const{reset:a,invoke_onerror:u}=this.#y(i);u(),n&&(this.#l=this.#h(()=>{try{return Se(()=>{var c=L;c.b=this,c.f|=sr,n(this.#t,()=>i,()=>a)})}catch(c){return ct(c,this.#r.parent),null}}))};ut(()=>{var i;try{i=this.transform_error(t)}catch(a){ct(a,this.#r&&this.#r.parent);return}i!==null&&typeof i=="object"&&typeof i.then=="function"?i.then(s,a=>ct(a,this.#r&&this.#r.parent)):s(i)})}}function bl(e,t,n,s){const i=gn()?pr:Nn;var a=e.filter(v=>!v.settled),u=t.map(i);if(n.length===0&&a.length===0){s(u);return}var c=L,l=wl(),d=a.length===1?a[0].promise:a.length>1?Promise.all(a.map(v=>v.promise)):null;function g(v){if((c.f&Ae)===0){l();try{s([...u,...v])}catch(b){ct(b,c)}Dn()}}var m=ji();if(n.length===0){d.then(()=>g([])).finally(m);return}function _(){Promise.all(n.map(v=>xl(v))).then(g).catch(v=>ct(v,c)).finally(m)}d?d.then(()=>{l(),_(),Dn()}):_()}function wl(){var e=L,t=I,n=H,s=A;return function(a=!0){Ie(e),Le(t),Ut(n),a&&(e.f&Ae)===0&&(s?.activate(),s?.apply())}}function Dn(e=!0){Ie(null),Le(null),Ut(null),e&&A?.deactivate()}function ji(){var e=L,t=e.b,n=A,s=!!t?.is_rendered();return t?.update_pending_count(1,n),n.increment(s,e),()=>{t?.update_pending_count(-1,n),n.decrement(s,e)}}function pr(e){var t=ne|Q;return L!==null&&(L.f|=Vt),{ctx:H,deps:null,effects:null,equals:Di,f:t,fn:e,reactions:null,rv:0,v:J,wv:0,parent:L,ac:null}}const rn=Symbol("obsolete");function xl(e,t,n){let s=L;s===null&&Ja();var i=void 0,a=Rt(J),u=!I,c=new Set;return $l(()=>{var l=L,d=Li();i=d.promise;try{Promise.resolve(e()).then(d.resolve,v=>{v!==pn&&d.reject(v)}).finally(Dn)}catch(v){d.reject(v),Dn()}var g=A;if(u){if((l.f&Bt)!==0)var m=ji();if(s.b?.is_rendered())g.async_deriveds.get(l)?.reject(rn);else for(const v of c.values())v.reject(rn);c.add(d),g.async_deriveds.set(l,d)}const _=(v,b=void 0)=>{m?.(),c.delete(d),b!==rn&&(g.activate(),b?(a.f|=dt,jt(a,b)):((a.f&dt)!==0&&(a.f^=dt),jt(a,v)),g.deactivate())};d.promise.then(_,v=>_(null,v||"unknown"))}),ql(()=>{for(const l of c)l.reject(rn)}),new Promise(l=>{function d(g){function m(){g===i?l(a):d(i)}g.then(m,m)}d(i)})}function Nn(e){const t=pr(e);return t.equals=Ni,t}function kl(e){var t=e.effects;if(t!==null){e.effects=null;for(var n=0;n<t.length;n+=1)ve(t[n])}}function gr(e){var t,n=L,s=e.parent;if(!_t&&s!==null&&e.v!==J&&(s.f&(Ae|ue))!==0)return fl(),e.v;Ie(s);try{e.f&=~At,kl(e),t=fs(e)}finally{Ie(n)}return t}function Bi(e){var t=gr(e);if(!e.equals(t)&&(e.wv=ls(),(!A?.is_fork||e.deps===null)&&(A!==null?(A.capture(e,t,!0),or?.capture(e,t,!0)):e.v=t,e.deps===null))){z(e,K);return}_t||(He!==null?(wr()||A?.is_fork)&&He.set(e,t):_r(e))}function El(e){if(e.effects!==null)for(const t of e.effects)(t.teardown||t.ac)&&(t.teardown?.(),t.ac!==null&&mn(()=>{t.ac.abort(pn),t.ac=null}),t.fn!==null&&(t.teardown=Ga),vn(t,0),kr(t))}function Vi(e){if(e.effects!==null)for(const t of e.effects)t.teardown&&t.fn!==null&&Lt(t)}let er=null,$t=null,A=null,or=null,He=null,fr=null,un=!1,tr=!1,Ft=null,Rn=null;var di=0;let Sl=1;class ht{id=Sl++;#t=!1;linked=!0;#a=null;#e=null;async_deriveds=new Map;current=new Map;previous=new Map;#o=new Set;#r=new Set;#s=0;#n=new Map;#l=null;#i=[];#_=[];#f=new Set;#u=new Set;#d=new Map;#p=new Set;is_fork=!1;#c=!1;constructor(){$t===null?er=$t=this:($t.#e=this,this.#a=$t),$t=this}#m(){if(this.is_fork)return!0;for(const s of this.#n.keys()){for(var t=s,n=!1;t.parent!==null;){if(this.#d.has(t)){n=!0;break}t=t.parent}if(!n)return!0}return!1}skip_effect(t){this.#d.has(t)||this.#d.set(t,{d:[],m:[]}),this.#p.delete(t)}unskip_effect(t,n=s=>this.schedule(s)){var s=this.#d.get(t);if(s){this.#d.delete(t);for(var i of s.d)z(i,Q),n(i);for(i of s.m)z(i,Ce),n(i)}this.#p.add(t)}#g(){this.#t=!0,di++>1e3&&(this.#h(),Cl());for(const l of this.#f)this.#u.delete(l),z(l,Q),this.schedule(l);for(const l of this.#u)z(l,Ce),this.schedule(l);const t=this.#i;this.#i=[],this.apply();var n=Ft=[],s=[],i=Rn=[];for(const l of t)try{this.#w(l,n,s)}catch(d){throw Gi(l),this.#m()||this.discard(),d}if(A=null,i.length>0){var a=ht.ensure();for(const l of i)a.schedule(l)}if(Ft=null,Rn=null,this.#m()){this.#v(s),this.#v(n);for(const[l,d]of this.#d)Yi(l,d);i.length>0&&A.#g();return}const u=this.#y();if(u){this.#v(s),this.#v(n),u.#x(this);return}this.#f.clear(),this.#u.clear();for(const l of this.#o)l(this);this.#o.clear(),or=this,vi(s),vi(n),or=null,this.#l?.resolve();var c=A;if(this.#s===0&&(this.#i.length===0||c!==null)&&this.#h(),this.#i.length>0)if(c!==null){const l=c;l.#i.push(...this.#i.filter(d=>!l.#i.includes(d)))}else c=this;c!==null&&c.#g()}#w(t,n,s){t.f^=K;for(var i=t.first;i!==null;){var a=i.f,u=(a&(Re|rt))!==0,c=u&&(a&K)!==0,l=c||(a&ue)!==0||this.#d.has(i);if(!l&&i.fn!==null){u?i.f^=K:(a&dn)!==0?n.push(i):zt(i)&&((a&Pe)!==0&&this.#u.add(i),Lt(i));var d=i.first;if(d!==null){i=d;continue}}for(;i!==null;){var g=i.next;if(g!==null){i=g;break}i=i.parent}}}#y(){for(var t=this.#a;t!==null;){if(!t.is_fork){for(const[n,[,s]]of this.current)if(t.current.has(n)&&!s)return t}t=t.#a}return null}#x(t){for(const[s,i]of t.current)!this.previous.has(s)&&t.previous.has(s)&&this.previous.set(s,t.previous.get(s)),this.current.set(s,i);for(const[s,i]of t.async_deriveds){const a=this.async_deriveds.get(s);a&&i.promise.then(a.resolve).catch(a.reject)}t.async_deriveds.clear(),this.transfer_effects(t.#f,t.#u);const n=s=>{var i=s.reactions;if(i!==null&&!((s.f&ne)!==0&&(s.f&(Q|Ce))===0))for(const c of i){var a=c.f;if((a&ne)!==0)n(c);else{var u=c;a&(Pt|Pe)&&!this.async_deriveds.has(u)&&(this.#u.delete(u),z(u,Q),this.schedule(u))}}};for(const s of this.current.keys())n(s);this.oncommit(()=>t.discard()),t.#h(),A=this,this.#g()}#v(t){for(var n=0;n<t.length;n+=1)Ui(t[n],this.#f,this.#u)}capture(t,n,s=!1){t.v!==J&&!this.previous.has(t)&&this.previous.set(t,t.v),(t.f&dt)===0&&(this.current.set(t,[n,s]),He?.set(t,n)),this.is_fork||(t.v=n)}activate(){A=this}deactivate(){A=null,He=null}flush(){try{tr=!0,A=this,this.#g()}finally{di=0,fr=null,Ft=null,Rn=null,tr=!1,A=null,He=null,St.clear()}}discard(){for(const t of this.#r)t(this);this.#r.clear();for(const t of this.async_deriveds.values())t.reject(rn);this.#h(),this.#l?.resolve()}register_created_effect(t){this.#_.push(t)}#b(){for(let m=er;m!==null;m=m.#e){var t=m.id<this.id,n=[];for(const[_,[v,b]]of this.current){if(m.current.has(_)){var s=m.current.get(_)[0];if(t&&v!==s)m.current.set(_,[v,b]);else continue}n.push(_)}if(t)for(const[_,v]of this.async_deriveds){const b=m.async_deriveds.get(_);b&&v.promise.then(b.resolve).catch(b.reject)}var i=[...m.current.keys()].filter(_=>!m.current.get(_)[1]);if(!(!m.#t||i.length===0)){var a=i.filter(_=>!this.current.has(_));if(a.length===0)t&&m.discard();else if(n.length>0){if(t)for(const _ of this.#p)m.unskip_effect(_,v=>{(v.f&(Pe|Pt))!==0?m.schedule(v):m.#v([v])});m.activate();var u=new Set,c=new Map;for(var l of n)zi(l,a,u,c);c=new Map;var d=[...m.current].filter(([_,v])=>{const b=this.current.get(_);return b?b[0]!==v[0]||b[1]!==v[1]:!0}).map(([_])=>_);if(d.length>0)for(const _ of this.#_)(_.f&(Ae|ue|Mn))===0&&mr(_,d,c)&&((_.f&(Pt|Pe))!==0?(z(_,Q),m.schedule(_)):m.#f.add(_));if(m.#i.length>0&&!m.#c){m.apply();for(var g of m.#i)m.#w(g,[],[]);m.#i=[]}m.deactivate()}}}}increment(t,n){if(this.#s+=1,t){let s=this.#n.get(n)??0;this.#n.set(n,s+1)}}decrement(t,n){if(this.#s-=1,t){let s=this.#n.get(n)??0;s===1?this.#n.delete(n):this.#n.set(n,s-1)}this.#c||(this.#c=!0,ut(()=>{this.#c=!1,this.linked&&this.flush()}))}transfer_effects(t,n){for(const s of t)this.#f.add(s);for(const s of n)this.#u.add(s);t.clear(),n.clear()}oncommit(t){this.#o.add(t)}ondiscard(t){this.#r.add(t)}settled(){return(this.#l??=Li()).promise}static ensure(){if(A===null){const t=A=new ht;!tr&&!un&&ut(()=>{t.#t||t.flush()})}return A}apply(){{He=null;return}}schedule(t){if(fr=t,t.b?.is_pending&&(t.f&(dn|_n|Ii))!==0&&(t.f&Bt)===0){t.b.defer_effect(t);return}for(var n=t;n.parent!==null;){n=n.parent;var s=n.f;if(Ft!==null&&n===L&&(I===null||(I.f&ne)===0))return;if((s&(rt|Re))!==0){if((s&K)===0)return;n.f^=K}}this.#i.push(n)}#h(){if(this.linked){var t=this.#a,n=this.#e;t===null?er=n:t.#e=n,n===null?$t=t:n.#a=t,this.linked=!1}}}function Tl(e){var t=un;un=!0;try{for(var n;;){if(dl(),A===null)return n;A.flush()}}finally{un=t}}function Cl(){try{il()}catch(e){ct(e,fr)}}let nt=null;function vi(e){var t=e.length;if(t!==0){for(var n=0;n<t;){var s=e[n++];if((s.f&(Ae|ue))===0&&zt(s)&&(nt=new Set,Lt(s),s.deps===null&&s.first===null&&s.nodes===null&&s.teardown===null&&s.ac===null&&rs(s),nt?.size>0)){St.clear();for(const i of nt){if((i.f&(Ae|ue))!==0)continue;const a=[i];let u=i.parent;for(;u!==null;)nt.has(u)&&(nt.delete(u),a.push(u)),u=u.parent;for(let c=a.length-1;c>=0;c--){const l=a[c];(l.f&(Ae|ue))===0&&Lt(l)}}nt.clear()}}nt=null}}function zi(e,t,n,s){if(!n.has(e)&&(n.add(e),e.reactions!==null))for(const i of e.reactions){const a=i.f;(a&ne)!==0?zi(i,t,n,s):(a&(Pt|Pe))!==0&&(a&Q)===0&&mr(i,t,s)&&(z(i,Q),yr(i))}}function mr(e,t,n){const s=n.get(e);if(s!==void 0)return s;if(e.deps!==null)for(const i of e.deps){if(In.call(t,i))return!0;if((i.f&ne)!==0&&mr(i,t,n))return n.set(i,!0),!0}return n.set(e,!1),!1}function yr(e){A.schedule(e)}function Yi(e,t){if(!((e.f&Re)!==0&&(e.f&K)!==0)){(e.f&Q)!==0?t.d.push(e):(e.f&Ce)!==0&&t.m.push(e),z(e,K);for(var n=e.first;n!==null;)Yi(n,t),n=n.next}}function Gi(e){z(e,K);for(var t=e.first;t!==null;)Gi(t),t=t.next}let On=new Set;const St=new Map;let Wi=!1;function Rt(e,t){var n={f:0,v:e,reactions:null,equals:Di,rv:0,wv:0};return n}function ot(e,t){const n=Rt(e);return Hl(n),n}function ye(e,t=!1,n=!0){const s=Rt(e);return t||(s.equals=Ni),hn&&n&&H!==null&&H.l!==null&&(H.l.s??=[]).push(s),s}function q(e,t,n=!1){I!==null&&(!Ue||(I.f&Mn)!==0)&&gn()&&(I.f&(ne|Pe|Pt|Mn))!==0&&(Ye===null||!Ye.has(e))&&ll();let s=n?sn(t):t;return jt(e,s,Rn)}function jt(e,t,n=null){if(!e.equals(t)){St.set(e,_t?t:e.v);var s=ht.ensure();if(s.capture(e,t),(e.f&ne)!==0){const i=e;(e.f&Q)!==0&&gr(i),He===null&&_r(i)}e.wv=ls(),Ki(e,Q,n),gn()&&L!==null&&(L.f&K)!==0&&(L.f&(Re|rt))===0&&(Ee===null?Ul([e]):Ee.push(e)),!s.is_fork&&On.size>0&&!Wi&&Al()}return t}function Al(){Wi=!1;for(const e of On){(e.f&K)!==0&&z(e,Ce);let t;try{t=zt(e)}catch{t=!0}t&&Lt(e)}On.clear()}function cn(e){q(e,e.v+1)}function Ki(e,t,n){var s=e.reactions;if(s!==null)for(var i=gn(),a=s.length,u=0;u<a;u++){var c=s[u],l=c.f;if(!(!i&&c===L)){var d=(l&Q)===0;if(d&&z(c,t),(l&Mn)!==0)On.add(c);else if((l&ne)!==0){var g=c;He?.delete(g),(l&At)===0&&(l&Te&&(L===null||(L.f&qn)===0)&&(c.f|=At),Ki(g,Ce,n))}else if(d){var m=c;(l&Pe)!==0&&nt!==null&&nt.add(m),n!==null?n.push(m):yr(m)}}}}function sn(e){if(typeof e!="object"||e===null||fn in e)return e;const t=hr(e);if(t!==za&&t!==Ya)return e;var n=new Map,s=Ai(e),i=ot(0),a=Ct,u=c=>{if(Ct===a)return c();var l=I,d=Ct;Le(null),pi(a);var g=c();return Le(l),pi(d),g};return s&&n.set("length",ot(e.length)),new Proxy(e,{defineProperty(c,l,d){(!("value"in d)||d.configurable===!1||d.enumerable===!1||d.writable===!1)&&sl();var g=n.get(l);return g===void 0?u(()=>{var m=ot(d.value);return n.set(l,m),m}):q(g,d.value,!0),!0},deleteProperty(c,l){var d=n.get(l);if(d===void 0){if(l in c){const g=u(()=>ot(J));n.set(l,g),cn(i)}}else q(d,J),cn(i);return!0},get(c,l,d){if(l===fn)return e;var g=n.get(l),m=l in c;if(g===void 0&&(!m||on(c,l)?.writable)&&(g=u(()=>{var v=sn(m?c[l]:J),b=ot(v);return b}),n.set(l,g)),g!==void 0){var _=r(g);return _===J?void 0:_}return Reflect.get(c,l,d)},getOwnPropertyDescriptor(c,l){var d=Reflect.getOwnPropertyDescriptor(c,l);if(d&&"value"in d){var g=n.get(l);g&&(d.value=r(g))}else if(d===void 0){var m=n.get(l),_=m?.v;if(m!==void 0&&_!==J)return{enumerable:!0,configurable:!0,value:_,writable:!0}}return d},has(c,l){if(l===fn)return!0;var d=n.get(l),g=d!==void 0&&d.v!==J||Reflect.has(c,l);if(d!==void 0||L!==null&&(!g||on(c,l)?.writable)){d===void 0&&(d=u(()=>{var _=g?sn(c[l]):J,v=ot(_);return v}),n.set(l,d));var m=r(d);if(m===J)return!1}return g},set(c,l,d,g){var m=n.get(l),_=l in c;if(s&&l==="length")for(var v=d;v<m.v;v+=1){var b=n.get(v+"");b!==void 0?q(b,J):v in c&&(b=u(()=>ot(J)),n.set(v+"",b))}if(m===void 0)(!_||on(c,l)?.writable)&&(m=u(()=>ot(void 0)),q(m,sn(d)),n.set(l,m));else{_=m.v!==J;var T=u(()=>sn(d));q(m,T)}var w=Reflect.getOwnPropertyDescriptor(c,l);if(w?.set&&w.set.call(g,d),!_){if(s&&typeof l=="string"){var E=n.get("length"),G=Number(l);Number.isInteger(G)&&G>=E.v&&q(E,G+1)}cn(i)}return!0},ownKeys(c){r(i);var l=Reflect.ownKeys(c).filter(m=>{var _=n.get(m);return _===void 0||_.v!==J});for(var[d,g]of n)g.v!==J&&!(d in c)&&l.push(d);return l},setPrototypeOf(){al()}})}var hi,Qi,Xi,Zi;function Rl(){if(hi===void 0){hi=window,Qi=/Firefox/.test(navigator.userAgent);var e=Element.prototype,t=Node.prototype,n=Text.prototype;Xi=on(t,"firstChild").get,Zi=on(t,"nextSibling").get,fi(e)&&(e[ar]=void 0,e[qi]=null,e[Xa]=void 0,e.__e=void 0),fi(n)&&(n[lr]=void 0)}}function vt(e=""){return document.createTextNode(e)}function br(e){return Xi.call(e)}function yn(e){return Zi.call(e)}function o(e,t){return br(e)}function Jt(e,t=!1){{var n=br(e);return n instanceof Comment&&n.data===""?yn(n):n}}function p(e,t=1,n=!1){let s=e;for(;t--;)s=yn(s);return s}function Ll(e){e.textContent=""}function Ji(){return!1}function Il(e,t,n){return n?document.createElement(e,{is:n}):document.createElement(e)}function es(e){L===null&&(I===null&&rl(),nl()),_t&&tl()}function Ml(e,t){var n=t.last;n===null?t.last=t.first=e:(n.next=e,e.prev=n,t.last=e)}function it(e,t){var n=L;n!==null&&(n.f&ue)!==0&&(e|=ue);var s={ctx:H,deps:null,nodes:null,f:e|Q|Te,first:null,fn:t,last:null,next:null,parent:n,b:n&&n.b,prev:null,teardown:null,wv:0,ac:null};A?.register_created_effect(s);var i=s;if((e&dn)!==0)Ft!==null?Ft.push(s):ht.ensure().schedule(s);else if(t!==null){try{Lt(s)}catch(u){throw ve(s),u}i.deps===null&&i.teardown===null&&i.nodes===null&&i.first===i.last&&(i.f&Vt)===0&&(i=i.first,(e&Pe)!==0&&(e&Ht)!==0&&i!==null&&(i.f|=Ht))}if(i!==null&&(i.parent=n,n!==null&&Ml(i,n),I!==null&&(I.f&ne)!==0&&(e&rt)===0)){var a=I;(a.effects??=[]).push(i)}return s}function wr(){return I!==null&&!Ue}function ql(e){const t=it(_n,null);return z(t,K),t.teardown=e,t}function ur(e){es();var t=L.f,n=!I&&(t&Re)!==0&&H!==null&&!H.i;if(n){var s=H;(s.e??=[]).push(e)}else return ts(e)}function ts(e){return it(dn|Mi,e)}function Dl(e){return es(),it(_n|Mi,e)}function Nl(e){ht.ensure();const t=it(rt|Vt,e);return(n={})=>new Promise(s=>{n.outro?Tt(t,()=>{ve(t),s(void 0)}):(ve(t),s(void 0))})}function en(e,t){var n=H,s={effect:null,ran:!1,deps:e};n.l.$.push(s),s.effect=Pn(()=>{if(e(),!s.ran){s.ran=!0;var i=L;try{Ie(i.parent),f(t)}finally{Ie(i)}}})}function Ol(){var e=H;Pn(()=>{for(var t of e.l.$){t.deps();var n=t.effect;(n.f&K)!==0&&n.deps!==null&&z(n,Ce),zt(n)&&Lt(n),t.ran=!1}})}function $l(e){return it(Pt|Vt,e)}function Pn(e,t=0){return it(_n|t,e)}function D(e,t=[],n=[],s=[]){bl(s,t,n,i=>{it(_n,()=>{e(...i.map(r))})})}function xr(e,t=0){var n=it(Pe|t,e);return n}function Se(e){return it(Re|Vt,e)}function ns(e){var t=e.teardown;if(t!==null){const n=_t,s=I;_i(!0),Le(null);try{t.call(null)}finally{_i(n),Le(s)}}}function kr(e,t=!1){var n=e.first;for(e.first=e.last=null;n!==null;){const i=n.ac;i!==null&&mn(()=>{i.abort(pn)});var s=n.next;(n.f&rt)!==0?n.parent=null:ve(n,t),n=s}}function Fl(e){for(var t=e.first;t!==null;){var n=t.next;(t.f&Re)===0&&ve(t),t=n}}function ve(e,t=!0){var n=!1;(t||(e.f&Ka)!==0)&&e.nodes!==null&&e.nodes.end!==null&&(Pl(e.nodes.start,e.nodes.end),n=!0),e.f|=ui,kr(e,t&&!n),vn(e,0);var s=e.nodes&&e.nodes.t;if(s!==null)for(const a of s)a.stop();ns(e),e.f^=ui,e.f|=Ae;var i=e.parent;i!==null&&i.first!==null&&rs(e),e.next=e.prev=e.teardown=e.ctx=e.deps=e.fn=e.nodes=e.ac=e.b=null}function Pl(e,t){for(;e!==null;){var n=e===t?null:yn(e);e.remove(),e=n}}function rs(e){var t=e.parent,n=e.prev,s=e.next;n!==null&&(n.next=s),s!==null&&(s.prev=n),t!==null&&(t.first===e&&(t.first=s),t.last===e&&(t.last=n))}function Tt(e,t,n=!0){var s=[];is(e,s,!0);var i=()=>{n&&ve(e),t&&t()},a=s.length;if(a>0){var u=()=>--a||i();for(var c of s)c.out(u)}else i()}function is(e,t,n){if((e.f&ue)===0){e.f^=ue;var s=e.nodes&&e.nodes.t;if(s!==null)for(const c of s)(c.is_global||n)&&t.push(c);for(var i=e.first;i!==null;){var a=i.next;if((i.f&rt)===0){var u=(i.f&Ht)!==0||(i.f&Re)!==0&&(e.f&Pe)!==0;is(i,t,u?n:!1)}i=a}}}function $n(e){ss(e,!0)}function ss(e,t){if((e.f&ue)!==0){e.f^=ue,(e.f&K)===0&&(z(e,Q),ht.ensure().schedule(e));for(var n=e.first;n!==null;){var s=n.next,i=(n.f&Ht)!==0||(n.f&Re)!==0;ss(n,i?t:!1),n=s}var a=e.nodes&&e.nodes.t;if(a!==null)for(const u of a)(u.is_global||t)&&u.in()}}function Er(e,t){if(e.nodes)for(var n=e.nodes.start,s=e.nodes.end;n!==null;){var i=n===s?null:yn(n);t.append(n),n=i}}let Ln=!1,_t=!1;function _i(e){_t=e}let I=null,Ue=!1;function Le(e){I=e}let L=null;function Ie(e){L=e}let Ye=null;function Hl(e){I!==null&&(Ye??=new Set).add(e)}let de=null,be=0,Ee=null;function Ul(e){Ee=e}let as=1,Et=0,Ct=Et;function pi(e){Ct=e}function ls(){return++as}function zt(e){var t=e.f;if((t&Q)!==0)return!0;if(t&ne&&(e.f&=~At),(t&Ce)!==0){for(var n=e.deps,s=n.length,i=0;i<s;i++){var a=n[i];if(zt(a)&&Bi(a),a.wv>e.wv)return!0}(t&Te)!==0&&He===null&&z(e,K)}return!1}function os(e,t,n=!0){var s=e.reactions;if(s!==null&&!(Ye!==null&&Ye.has(e)))for(var i=0;i<s.length;i++){var a=s[i];(a.f&ne)!==0?os(a,t,!1):t===a&&(n?z(a,Q):(a.f&K)!==0&&z(a,Ce),yr(a))}}function fs(e){var t=de,n=be,s=Ee,i=I,a=Ye,u=H,c=Ue,l=Ct,d=e.f;de=null,be=0,Ee=null,I=(d&(Re|rt))===0?e:null,Ye=null,Ut(e.ctx),Ue=!1,Ct=++Et,e.ac!==null&&(mn(()=>{e.ac.abort(pn)}),e.ac=null);try{e.f|=qn;var g=e.fn,m=g();e.f|=Bt;var _=e.deps,v=A?.is_fork;if(de!==null){var b;if(v||vn(e,be),_!==null&&be>0)for(_.length=be+de.length,b=0;b<de.length;b++)_[be+b]=de[b];else e.deps=_=de;if(wr()&&(e.f&Te)!==0)for(b=be;b<_.length;b++)(_[b].reactions??=[]).push(e)}else!v&&_!==null&&be<_.length&&(vn(e,be),_.length=be);if(gn()&&Ee!==null&&!Ue&&_!==null&&(e.f&(ne|Ce|Q))===0)for(b=0;b<Ee.length;b++)os(Ee[b],e);if(i!==null&&i!==e){if(Et++,i.deps!==null)for(let T=0;T<n;T+=1)i.deps[T].rv=Et;if(t!==null)for(const T of t)T.rv=Et;Ee!==null&&(s===null?s=Ee:s.push(...Ee))}return(e.f&dt)!==0&&(e.f^=dt),m}catch(T){return Pi(T)}finally{e.f^=qn,de=t,be=n,Ee=s,I=i,Ye=a,Ut(u),Ue=c,Ct=l}}function jl(e,t){let n=t.reactions;if(n!==null){var s=Ba.call(n,e);if(s!==-1){var i=n.length-1;i===0?n=t.reactions=null:(n[s]=n[i],n.pop())}}if(n===null&&(t.f&ne)!==0&&(de===null||!In.call(de,t))){var a=t;(a.f&Te)!==0&&(a.f^=Te,a.f&=~At),a.v!==J&&_r(a),a.ac!==null&&mn(()=>{a.ac.abort(pn),a.ac=null,z(a,Q)}),El(a),vn(a,0)}}function vn(e,t){var n=e.deps;if(n!==null)for(var s=t;s<n.length;s++)jl(e,n[s])}function Lt(e){var t=e.f;if((t&Ae)===0){z(e,K);var n=L,s=Ln;L=e,Ln=(t&(Re|rt))===0;try{(t&(Pe|Ii))!==0?Fl(e):kr(e),ns(e);var i=fs(e);e.teardown=typeof i=="function"?i:null,e.wv=as;var a;Ci&&Na&&(e.f&Q)!==0&&e.deps}finally{Ln=s,L=n}}}async function us(){await Promise.resolve(),Tl()}function r(e){var t=e.f,n=(t&ne)!==0;if(I!==null&&!Ue){var s=L!==null&&(L.f&Ae)!==0;if(!s&&(Ye===null||!Ye.has(e))){var i=I.deps;if((I.f&qn)!==0)e.rv<Et&&(e.rv=Et,de===null&&i!==null&&i[be]===e?be++:de===null?de=[e]:de.push(e));else{I.deps??=[],In.call(I.deps,e)||I.deps.push(e);var a=e.reactions;a===null?e.reactions=[I]:In.call(a,I)||a.push(I)}}}if(_t&&St.has(e))return St.get(e);if(n){var u=e;if(_t){var c=u.v;return((u.f&K)===0&&u.reactions!==null||ds(u))&&(c=gr(u)),St.set(u,c),c}var l=(u.f&Te)===0&&!Ue&&I!==null&&(Ln||(I.f&Te)!==0),d=(u.f&Bt)===0;zt(u)&&(l&&(u.f|=Te),Bi(u)),l&&!d&&(Vi(u),cs(u))}if(He?.has(e))return He.get(e);if((e.f&dt)!==0)throw e.v;return e.v}function cs(e){if(e.f|=Te,e.deps!==null)for(const t of e.deps)(t.reactions??=[]).push(e),(t.f&ne)!==0&&(t.f&Te)===0&&(Vi(t),cs(t))}function ds(e){if(e.v===J)return!0;if(e.deps===null)return!1;for(const t of e.deps)if(St.has(t)||(t.f&ne)!==0&&ds(t))return!0;return!1}function f(e){var t=Ue;try{return Ue=!0,e()}finally{Ue=t}}function ke(e){if(!(typeof e!="object"||!e||e instanceof EventTarget)){if(fn in e)cr(e);else if(!Array.isArray(e))for(let t in e){const n=e[t];typeof n=="object"&&n&&fn in n&&cr(n)}}}function cr(e,t=new Set){if(typeof e=="object"&&e!==null&&!(e instanceof EventTarget)&&!t.has(e)){t.add(e),e instanceof Date&&e.getTime();for(let s in e)try{cr(e[s],t)}catch{}const n=hr(e);if(n!==Object.prototype&&n!==Array.prototype&&n!==Map.prototype&&n!==Set.prototype&&n!==Date.prototype){const s=Ri(n);for(let i in s){const a=s[i].get;if(a)try{a.call(e)}catch{}}}}}const an=Symbol("events"),vs=new Set,dr=new Set;function Ve(e,t,n){(t[an]??={})[e]=n}function Bl(e){for(var t=0;t<e.length;t++)vs.add(e[t]);for(var n of dr)n(e)}let gi=null;function mi(e){var t=this,n=t.ownerDocument,s=e.type,i=e.composedPath?.()||[],a=i[0]||e.target;gi=e;var u=0,c=gi===e&&e[an];if(c){var l=i.indexOf(c);if(l!==-1&&(t===document||t===window)){e[an]=t;return}var d=i.indexOf(t);if(d===-1)return;l<=d&&(u=l)}if(a=i[u]||e.target,a!==t){Va(e,"currentTarget",{configurable:!0,get(){return a||n}});var g=I,m=L;Le(null),Ie(null);try{for(var _,v=[];a!==null&&a!==t;){try{var b=a[an]?.[s];b!=null&&(!a.disabled||e.target===a)&&b.call(a,e)}catch(T){_?v.push(T):_=T}if(e.cancelBubble)break;u++,a=u<i.length?i[u]:null}if(_){for(let T of v)queueMicrotask(()=>{throw T});throw _}}finally{e[an]=t,delete e.currentTarget,Le(g),Ie(m)}}}const Vl=globalThis?.window?.trustedTypes&&globalThis.window.trustedTypes.createPolicy("svelte-trusted-html",{createHTML:e=>e});function zl(e){return Vl?.createHTML(e)??e}function Yl(e){var t=Il("template");return t.innerHTML=zl(e.replaceAll("<!>","<!---->")),t.content}function hs(e,t){var n=L;n.nodes===null&&(n.nodes={start:e,end:t,a:null,t:null})}function j(e,t){var n=(t&Ua)!==0,s,i=!e.startsWith("<!>");return()=>{s===void 0&&(s=Yl(i?e:"<!>"+e),s=br(s));var a=n||Qi?document.importNode(s,!0):s.cloneNode(!0);return hs(a,a),a}}function tn(){var e=document.createDocumentFragment(),t=document.createComment(""),n=vt();return e.append(t,n),hs(t,n),e}function R(e,t){e!==null&&e.before(t)}const Gl=["touchstart","touchmove"];function Wl(e){return Gl.includes(e)}function h(e,t){var n=t==null?"":typeof t=="object"?`${t}`:t;n!==(e[lr]??=e.nodeValue)&&(e[lr]=n,e.nodeValue=`${n}`)}function Kl(e,t){return Ql(e,t)}const Sn=new Map;function Ql(e,{target:t,anchor:n,props:s={},events:i,context:a,intro:u=!0,transformError:c}){Rl();var l=void 0,d=Nl(()=>{var g=n??t.appendChild(vt());ml(g,{pending:()=>{}},v=>{Oi({});var b=H;a&&(b.c=a),i&&(s.$$events=i),l=e(v,s)||{},$i()},c);var m=new Set,_=v=>{for(var b=0;b<v.length;b++){var T=v[b];if(!m.has(T)){m.add(T);var w=Wl(T);for(const U of[t,document]){var E=Sn.get(U);E===void 0&&(E=new Map,Sn.set(U,E));var G=E.get(T);G===void 0?(U.addEventListener(T,mi,{passive:w}),E.set(T,1)):E.set(T,G+1)}}}};return _(Fn(vs)),dr.add(_),()=>{for(var v of m)for(const w of[t,document]){var b=Sn.get(w),T=b.get(v);--T==0?(w.removeEventListener(v,mi),b.delete(v),b.size===0&&Sn.delete(w)):b.set(v,T)}dr.delete(_),g!==n&&g.parentNode?.removeChild(g)}});return Xl.set(l,d),l}let Xl=new WeakMap;class Zl{anchor;#t=new Map;#a=new Map;#e=new Map;#o=new Set;#r=!0;constructor(t,n=!0){this.anchor=t,this.#r=n}#s=t=>{if(this.#t.has(t)){var n=this.#t.get(t),s=this.#a.get(n);if(s)$n(s),this.#o.delete(n);else{var i=this.#e.get(n);i&&($n(i.effect),this.#a.set(n,i.effect),this.#e.delete(n),i.fragment.lastChild.remove(),this.anchor.before(i.fragment),s=i.effect)}for(const[a,u]of this.#t){if(this.#t.delete(a),a===t)break;const c=this.#e.get(u);c&&(ve(c.effect),this.#e.delete(u))}for(const[a,u]of this.#a){if(a===n||this.#o.has(a))continue;const c=()=>{if(Array.from(this.#t.values()).includes(a)){var d=document.createDocumentFragment();Er(u,d),d.append(vt()),this.#e.set(a,{effect:u,fragment:d})}else ve(u);this.#o.delete(a),this.#a.delete(a)};this.#r||!s?(this.#o.add(a),Tt(u,c,!1)):c()}}};#n=t=>{this.#t.delete(t);const n=Array.from(this.#t.values());for(const[s,i]of this.#e)n.includes(s)||(ve(i.effect),this.#e.delete(s))};ensure(t,n){var s=A,i=Ji();if(n&&!this.#a.has(t)&&!this.#e.has(t))if(i){var a=document.createDocumentFragment(),u=vt();a.append(u),this.#e.set(t,{effect:Se(()=>n(u)),fragment:a})}else this.#a.set(t,Se(()=>n(this.anchor)));if(this.#t.set(s,t),i){for(const[c,l]of this.#a)c===t?s.unskip_effect(l):s.skip_effect(l);for(const[c,l]of this.#e)c===t?s.unskip_effect(l.effect):s.skip_effect(l.effect);s.oncommit(this.#s),s.ondiscard(this.#n)}else this.#s(s)}}function Jl(e){H===null&&Za(),hn&&H.l!==null?eo(H).m.push(e):ur(()=>{const t=f(e);if(typeof t=="function")return t})}function eo(e){var t=e.l;return t.u??={a:[],b:[],m:[]}}function me(e,t,n=!1){var s=new Zl(e),i=n?Ht:0;function a(u,c){s.ensure(u,c)}xr(()=>{var u=!1;t((c,l=0)=>{u=!0,a(l,c)}),u||a(-1,null)},i)}function et(e,t){return t}function to(e,t,n){for(var s=[],i=t.length,a,u=t.length,c=0;c<i;c++){let m=t[c];Tt(m,()=>{if(a){if(a.pending.delete(m),a.done.add(m),a.pending.size===0){var _=e.outrogroups;vr(e,Fn(a.done)),_.delete(a),_.size===0&&(e.outrogroups=null)}}else u-=1},!1)}if(u===0){var l=s.length===0&&n!==null;if(l){var d=n,g=d.parentNode;Ll(g),g.append(d),e.items.clear()}vr(e,t,!l)}else a={pending:new Set(t),done:new Set},(e.outrogroups??=new Set).add(a)}function vr(e,t,n=!0){var s;if(e.pending.size>0){s=new Set;for(const u of e.pending.values())for(const c of u)s.add(e.items.get(c).e)}for(var i=0;i<t.length;i++){var a=t[i];if(s?.has(a)){a.f|=ze;const u=document.createDocumentFragment();Er(a,u)}else ve(t[i],n)}}var yi;function ae(e,t,n,s,i,a=null){var u=e,c=new Map,l=(t&Ti)!==0;if(l){var d=e;u=d.appendChild(vt())}var g=null,m=Nn(()=>{var U=n();return Ai(U)?U:U==null?[]:Fn(U)}),_,v=new Map,b=!0;function T(U){(G.effect.f&Ae)===0&&(G.pending.delete(U),G.fallback=g,no(G,_,u,t,s),g!==null&&(_.length===0?(g.f&ze)===0?$n(g):(g.f^=ze,ln(g,null,u)):Tt(g,()=>{g=null})))}function w(U){G.pending.delete(U)}var E=xr(()=>{_=r(m);for(var U=_.length,le=new Set,he=A,_e=Ji(),oe=0;oe<U;oe+=1){var je=_[oe],st=s(je,oe),X=b?null:c.get(st);X?(X.v&&jt(X.v,je),X.i&&jt(X.i,oe),_e&&he.unskip_effect(X.e)):(X=ro(c,b?u:yi??=vt(),je,st,oe,i,t,n),b||(X.e.f|=ze),c.set(st,X)),le.add(st)}if(U===0&&a&&!g&&(b?g=Se(()=>a(u)):(g=Se(()=>a(yi??=vt())),g.f|=ze)),U>le.size&&el(),!b)if(v.set(he,le),_e){for(const[Hn,Yt]of c)le.has(Hn)||he.skip_effect(Yt.e);he.oncommit(T),he.ondiscard(w)}else T(he);r(m)}),G={effect:E,items:c,pending:v,outrogroups:null,fallback:g};b=!1}function nn(e){for(;e!==null&&(e.f&Re)===0;)e=e.next;return e}function no(e,t,n,s,i){var a=(s&Pa)!==0,u=t.length,c=e.items,l=nn(e.effect.first),d,g=null,m,_=[],v=[],b,T,w,E;if(a)for(E=0;E<u;E+=1)b=t[E],T=i(b,E),w=c.get(T).e,(w.f&ze)===0&&(w.nodes?.a?.measure(),(m??=new Set).add(w));for(E=0;E<u;E+=1){if(b=t[E],T=i(b,E),w=c.get(T).e,e.outrogroups!==null)for(const X of e.outrogroups)X.pending.delete(w),X.done.delete(w);if((w.f&ue)!==0&&($n(w),a&&(w.nodes?.a?.unfix(),(m??=new Set).delete(w))),(w.f&ze)!==0)if(w.f^=ze,w===l)ln(w,null,n);else{var G=g?g.next:l;w===e.effect.last&&(e.effect.last=w.prev),w.prev&&(w.prev.next=w.next),w.next&&(w.next.prev=w.prev),ft(e,g,w),ft(e,w,G),ln(w,G,n),g=w,_=[],v=[],l=nn(g.next);continue}if(w!==l){if(d!==void 0&&d.has(w)){if(_.length<v.length){var U=v[0],le;g=U.prev;var he=_[0],_e=_[_.length-1];for(le=0;le<_.length;le+=1)ln(_[le],U,n);for(le=0;le<v.length;le+=1)d.delete(v[le]);ft(e,he.prev,_e.next),ft(e,g,he),ft(e,_e,U),l=U,g=_e,E-=1,_=[],v=[]}else d.delete(w),ln(w,l,n),ft(e,w.prev,w.next),ft(e,w,g===null?e.effect.first:g.next),ft(e,g,w),g=w;continue}for(_=[],v=[];l!==null&&l!==w;)(d??=new Set).add(l),v.push(l),l=nn(l.next);if(l===null)continue}(w.f&ze)===0&&_.push(w),g=w,l=nn(w.next)}if(e.outrogroups!==null){for(const X of e.outrogroups)X.pending.size===0&&(vr(e,Fn(X.done)),e.outrogroups?.delete(X));e.outrogroups.size===0&&(e.outrogroups=null)}if(l!==null||d!==void 0){var oe=[];if(d!==void 0)for(w of d)(w.f&ue)===0&&oe.push(w);for(;l!==null;)(l.f&ue)===0&&l!==e.fallback&&oe.push(l),l=nn(l.next);var je=oe.length;if(je>0){var st=(s&Ti)!==0&&u===0?n:null;if(a){for(E=0;E<je;E+=1)oe[E].nodes?.a?.measure();for(E=0;E<je;E+=1)oe[E].nodes?.a?.fix()}to(e,oe,st)}}a&&ut(()=>{if(m!==void 0)for(w of m)w.nodes?.a?.apply()})}function ro(e,t,n,s,i,a,u,c){var l=(u&$a)!==0?(u&Ha)===0?ye(n,!1,!1):Rt(n):null,d=(u&Fa)!==0?Rt(i):null;return{v:l,i:d,e:Se(()=>(a(t,l??n,d??i,c),()=>{e.delete(s)}))}}function ln(e,t,n){if(e.nodes)for(var s=e.nodes.start,i=e.nodes.end,a=t&&(t.f&ze)===0?t.nodes.start:n;s!==null;){var u=yn(s);if(a.before(s),s===i)return;s=u}}function ft(e,t,n){t===null?e.effect.first=n:t.next=n,n===null?e.effect.last=t:n.prev=t}const bi=[..." \\t\\n\\r\\f \\u000b\uFEFF"];function io(e,t,n){var s=e==null?"":""+e;if(t&&(s=s?s+" "+t:t),n){for(var i of Object.keys(n))if(n[i])s=s?s+" "+i:i;else if(s.length)for(var a=i.length,u=0;(u=s.indexOf(i,u))>=0;){var c=u+a;(u===0||bi.includes(s[u-1]))&&(c===s.length||bi.includes(s[c]))?s=(u===0?"":s.substring(0,u))+s.substring(c+1):u=c}}return s===""?null:s}function tt(e,t,n,s,i,a){var u=e[ar];if(u!==n||u===void 0){var c=io(n,s,a);c==null?e.removeAttribute("class"):e.className=c,e[ar]=n}else if(a&&i!==a)for(var l in a){var d=!!a[l];(i==null||d!==!!i[l])&&e.classList.toggle(l,d)}return a}const so=Symbol("is custom element"),ao=Symbol("is html");function V(e,t,n,s){var i=lo(e);i[t]!==(i[t]=n)&&(t==="loading"&&(e[Qa]=n),n==null?e.removeAttribute(t):typeof n!="string"&&oo(e).includes(t)?e[t]=n:e.setAttribute(t,n))}function lo(e){return e[qi]??={[so]:e.nodeName.includes("-"),[ao]:e.namespaceURI===ja}}var wi=new Map;function oo(e){var t=e.getAttribute("is")||e.nodeName,n=wi.get(t);if(n)return n;wi.set(t,n=[]);for(var s,i=e,a=Element.prototype;a!==i;){s=Ri(i);for(var u in s)s[u].set&&u!=="innerHTML"&&u!=="textContent"&&u!=="innerText"&&n.push(u);i=hr(i)}return n}function fo(e,t,n=t){var s=new WeakSet;_l(e,"input",async i=>{var a=i?e.defaultValue:e.value;if(a=nr(e)?rr(a):a,n(a),A!==null&&s.add(A),await us(),a!==(a=t())){var u=e.selectionStart,c=e.selectionEnd,l=e.value.length;if(e.value=a??"",c!==null){var d=e.value.length;u===c&&c===l&&d>l?(e.selectionStart=d,e.selectionEnd=d):(e.selectionStart=u,e.selectionEnd=Math.min(c,d))}}}),f(t)==null&&e.value&&(n(nr(e)?rr(e.value):e.value),A!==null&&s.add(A)),Pn(()=>{var i=t();if(e===document.activeElement){var a=A;if(s.has(a))return}nr(e)&&i===rr(e.value)||e.type==="date"&&!i&&!e.value||i!==e.value&&(e.value=i??"")})}function nr(e){var t=e.type;return t==="number"||t==="range"}function rr(e){return e===""?null:+e}function uo(e=!1){const t=H,n=t.l.u;if(!n)return;let s=()=>ke(t.s);if(e){let i=0,a={};const u=pr(()=>{let c=!1;const l=t.s;for(const d in l)l[d]!==a[d]&&(a[d]=l[d],c=!0);return c&&i++,i});s=()=>r(u)}n.b.length&&Dl(()=>{xi(t,s),ir(n.b)}),ur(()=>{const i=f(()=>n.m.map(Wa));return()=>{for(const a of i)typeof a=="function"&&a()}}),n.a.length&&ur(()=>{xi(t,s),ir(n.a)})}function xi(e,t){if(e.l.s)for(const n of e.l.s)r(n);t()}var Tn=j("<span> </span>"),co=j(\'<li><a><span class="queue-index"> </span> <span class="queue-copy"><strong> </strong> <span class="badges"><span> </span> <!></span></span></a></li>\'),vo=j(\'<section class="queue-section"><h3><span> </span> <span class="count"> </span></h3> <ol></ol></section>\'),ho=j(\'<li><a><span class="queue-index"> </span> <span class="queue-copy"><strong> </strong><span> </span></span></a></li>\'),_o=j(\'<section class="queue-section unclassified"><h3><span> </span><span class="count"> </span></h3> <ol></ol></section>\'),po=j(\'<li><span class="file-status"> </span> <code> </code> <span> </span></li>\'),Cn=j("<li> </li>"),go=j("<ul></ul>"),mo=j("<p> </p>"),yo=j("<li><span> </span><strong> </strong> <p> </p></li>"),bo=j("<li><strong> </strong> </li>"),wo=j(\'<details class="more-evidence"><summary> </summary> <ul></ul></details>\'),ki=j(\'<button class="context-fold" type="button"> </button>\'),xo=j(\'<div role="row"><span class="line-number"> </span> <span class="line-number"> </span> <span class="line-sign" aria-hidden="true"> </span> <code></code></div>\'),Ei=j("<code></code>"),ko=j(\'<div class="split-row" role="row"><div><span class="line-number"> </span> <span class="line-sign" aria-hidden="true"> </span> <!></div> <div><span class="line-number"> </span> <span class="line-sign" aria-hidden="true"> </span> <!></div></div>\'),Eo=j(\'<button class="back-link hunk-back" type="button"> </button>\'),So=j(\'<section tabindex="-1"><header><div><p> </p> <h4> </h4></div> <button type="button" class="anchor-button">#</button></header> <div role="table"></div> <!></section>\'),To=j(\'<article class="focused-change" tabindex="-1"><button class="back-link" type="button"> </button> <header class="change-header"><div><p class="kicker"> </p> <h2> </h2></div> <div class="change-badges" aria-label="Change status"><span> </span> <span> </span> <span> </span></div></header> <div class="explanation-grid"><section><h3> </h3> <p> </p> <p class="technical"> </p></section> <section><h3> </h3> <p> </p></section> <section><h3> </h3> <!></section> <section class="risk-block"><h3> </h3> <ul></ul></section> <section class="gap-block"><h3> </h3> <ul></ul></section> <section><h3> </h3> <ul></ul></section></div> <section class="evidence-section" aria-labelledby="evidence-heading"><div class="section-heading"><div><p class="kicker"> </p> <h3 id="evidence-heading"> </h3></div></div> <ul class="evidence-list"></ul> <!></section> <section class="diff-section" aria-labelledby="diff-heading"><div class="section-heading"><div><p class="kicker"> </p> <h3 id="diff-heading"> </h3></div> <div class="segmented-control" aria-label="Diff layout"><button type="button"> </button> <button type="button"> </button></div></div> <!></section></article>\'),Co=j(\'<div><span class="line-number"> </span><span class="line-number"> </span><span class="line-sign"> </span><code> </code></div>\'),Ao=j(\'<section class="focused-change unclassified-focus"><button class="back-link" type="button"> </button> <p class="kicker"> </p> <h2> </h2> <section class="hunk active-hunk" tabindex="-1"><header><h3> </h3></header> <div class="diff-table"></div></section></section>\'),Ro=j(\'<section class="focused-change empty-focus"><h2> </h2></section>\'),Lo=j(\'<div class="report-shell"><header class="report-header"><a class="wordmark" href="#summary-heading" aria-label="Utsuri review summary"><span aria-hidden="true">UT</span> <strong>Utsuri</strong></a> <div class="report-state"><span class="state-mark" aria-hidden="true"></span> <span> </span> <small> </small></div> <p class="report-id"> </p></header> <aside class="review-rail" aria-labelledby="queue-heading"><div class="rail-heading"><p class="kicker">Focus / 01</p> <h2 id="queue-heading" tabindex="-1"> </h2></div> <label class="queue-search"><span> </span> <input type="search" autocomplete="off"/></label> <nav><!> <!></nav></aside> <main id="main-content"><section aria-labelledby="summary-heading" class="decision-summary"><div><p class="kicker"> </p> <h1 id="summary-heading"> </h1> <p class="decision-statement"> </p></div> <dl class="metrics"><div><dt> </dt> <dd> </dd></div> <div><dt> </dt> <dd class="positive"> </dd></div> <div><dt> </dt> <dd class="negative"> </dd></div> <div><dt> </dt> <dd> </dd></div> <div><dt> </dt> <dd> </dd></div></dl> <details class="file-inventory"><summary> </summary> <ul></ul></details></section> <!></main></div>\'),Io=j(\'<p class="loading" aria-live="polite"> </p>\');function Mo(e,t){Oi(t,!1);const n=ye(),s={en:{queue:"Review queue",search:"Filter changes",action:"Action required",confirm:"Needs confirmation",clear:"No issue found",unclassified:"Unclassified hunks",summary:"Decision summary",files:"Files",additions:"Additions",deletions:"Deletions",changes:"Change groups",lowSignal:"Low-signal files",inventory:"File inventory",backQueue:"Back to review queue",what:"What changed",why:"Why",userImpact:"User impact",noImpact:"User impact is not established.",risk:"Risk",gaps:"Not verified",verified:"Verified",evidence:"Evidence",codeDiff:"Code diff",unified:"Unified",split:"Side by side",context:"Show {count} hidden context lines",moreEvidence:"More evidence",backChange:"Back to focused change",visualGap:"Visual verification has not run",empty:"No semantic changes",loading:"Loading review data…"},ja:{queue:"レビューキュー",search:"変更を絞り込む",action:"対応が必要",confirm:"確認が必要",clear:"問題なし",unclassified:"未分類のハンク",summary:"判断サマリー",files:"ファイル",additions:"追加",deletions:"削除",changes:"変更グループ",lowSignal:"低シグナル",inventory:"ファイル一覧",backQueue:"レビューキューへ戻る",what:"変更内容",why:"変更理由",userImpact:"ユーザー影響",noImpact:"ユーザー影響は未確定です。",risk:"リスク",gaps:"未検証",verified:"検証済み",evidence:"根拠",codeDiff:"コード差分",unified:"統合表示",split:"左右表示",context:"非表示のコンテキスト {count} 行を表示",moreEvidence:"その他の根拠",backChange:"変更グループへ戻る",visualGap:"画面の検証は未実施です",empty:"意味単位の変更はありません",loading:"レビューデータを読み込んでいます…"}};let i=ye(null),a=ye(""),u=ye("en"),c=ye(""),l=ye(""),d=ye(""),g="",m=ye("unified"),_=new Set,v=ye(),b=ye([]),T=ye([]),w=ye([]);function E(y,C){return`${y}-${C.replace(/[^a-zA-Z0-9_-]/gu,"-")}`}function G(y){return y.risk.level==="critical"||y.risk.level==="high"?"action-required":y.verification.gaps.length>0||y.intent.source==="unknown"?"needs-confirmation":"no-issue"}function U(y){return y==="action-required"?r(n).action:y==="needs-confirmation"?r(n).confirm:r(n).clear}function le(y){return r(w).filter(C=>G(C)===y).length}function he(y,C){history.pushState(null,"",`#${y}=${encodeURIComponent(C)}`)}async function _e(y){await us(),document.getElementById(y)?.focus({preventScroll:!1})}function oe(y,C=!0){C&&(g=E("queue",y.id)),q(l,y.id),q(d,""),he("change",y.id),_e(E("change",y.id))}function je(y){q(d,y),he("hunk",y),_e(E("hunk",y))}function st(y){g=E("queue-hunk",y),q(l,""),je(y)}function X(){q(d,""),history.pushState(null,"","#queue"),_e(g||"queue-heading")}function Hn(){q(d,""),r(v)&&(he("change",r(v).id),_e(E("change",r(v).id)))}function Yt(){if(!r(i))return;const y=location.hash.match(/^#(change|hunk)=(.+)$/u);if(!y){q(l,r(l)||(r(i).changes[0]?.id??""));return}let C="";try{C=decodeURIComponent(y[2]??"")}catch{q(l,r(l)||(r(i).changes[0]?.id??""));return}if(y[1]==="change"&&r(i).changes.some(M=>M.id===C)){q(l,C),q(d,""),_e(E("change",C));return}y[1]==="hunk"&&r(i).hunks.some(M=>M.id===C)&&(q(l,r(i).changes.find(M=>M.hunkRefs.includes(C))?.id??""),q(d,C),_e(E("hunk",C)))}async function _s(){try{const y=await fetch("./report.json",{credentials:"omit"});if(!y.ok)throw new Error(`HTTP ${y.status}`);q(i,await y.json()),q(l,r(i).changes[0]?.id??""),document.querySelector("[data-static-fallback]")?.remove(),Yt()}catch(y){q(a,`Interactive data unavailable: ${y instanceof Error?y.message:String(y)}`)}}function Sr(y){if(_.has(y.id))return y.lines.map((P,N)=>({kind:"line",line:P,index:N}));const C=y.lines.map(()=>!1);y.lines.forEach((P,N)=>{if(P.kind==="addition"||P.kind==="deletion")for(let re=Math.max(0,N-3);re<=Math.min(y.lines.length-1,N+3);re+=1)C[re]=!0}),C.some(Boolean)||C.fill(!0);const M=[];for(let P=0;P<y.lines.length;)if(C[P])M.push({kind:"line",line:y.lines[P],index:P}),P+=1;else{let N=P+1;for(;N<y.lines.length&&!C[N];)N+=1;M.push({kind:"fold",count:N-P}),P=N}return M}function Tr(y){_=new Set([..._,y])}function ps(y,C){const M=y.lines[C];if(!M||M.kind!=="addition"&&M.kind!=="deletion")return;const P=M.kind==="addition"?"deletion":"addition";for(let N=1;N<=6;N+=1)for(const re of[C-N,C+N]){const at=y.lines[re];if(at?.kind===P)return at;if(at&&at.kind==="context")break}}function Un(y,C){const M=y.lines[C],P=ps(y,C);if(!P)return[{text:M.content,changed:M.kind==="addition"||M.kind==="deletion"}];let N=0;for(;N<M.content.length&&M.content[N]===P.content[N];)N+=1;let re=0;for(;re<M.content.length-N&&re<P.content.length-N&&M.content[M.content.length-re-1]===P.content[P.content.length-re-1];)re+=1;return[{text:M.content.slice(0,N),changed:!1},{text:M.content.slice(N,re?-re:void 0),changed:!0},{text:re?M.content.slice(-re):"",changed:!1}].filter(at=>at.text.length>0)}Jl(()=>(q(u,navigator.language.toLowerCase().startsWith("ja")?"ja":"en"),_s(),window.addEventListener("hashchange",Yt),()=>window.removeEventListener("hashchange",Yt))),en(()=>r(u),()=>{q(n,s[r(u)])}),en(()=>(r(i),r(l)),()=>{q(v,r(i)?.changes.find(y=>y.id===r(l)))}),en(()=>(r(v),r(i)),()=>{q(b,r(v)?r(v).hunkRefs.map(y=>r(i)?.hunks.find(C=>C.id===y)).filter(y=>y!==void 0):[])}),en(()=>(r(v),r(i)),()=>{q(T,r(v)&&r(i)?r(i).evidence.filter(y=>r(v)?.intent.evidenceRefs.includes(y.id)||y.hunkRefs.some(C=>r(v)?.hunkRefs.includes(C))):[])}),en(()=>(r(i),r(c)),()=>{q(w,r(i)?r(i).changes.filter(y=>`${y.title} ${y.summary}`.toLocaleLowerCase().includes(r(c).toLocaleLowerCase())):[])}),Ol(),uo();var Cr=tn(),gs=Jt(Cr);{var ms=y=>{var C=Lo(),M=o(C),P=p(o(M),2),N=p(o(P),2),re=o(N),at=p(N,2),bs=o(at),ws=p(P,2),xs=o(ws),Ar=p(M,2),Rr=o(Ar),ks=p(o(Rr),2),Es=o(ks),Lr=p(Rr,2),Ir=o(Lr),Ss=o(Ir),Ts=p(Ir,2),Mr=p(Lr,2),qr=o(Mr);ae(qr,0,()=>["action-required","needs-confirmation","no-issue"],O=>O,(O,S)=>{var ee=vo(),ce=o(ee),Me=o(ce),fe=o(Me),qe=p(Me,2),De=o(qe),we=p(ce,2);ae(we,7,()=>(r(w),f(()=>r(w).filter(W=>G(W)===S))),W=>W.id,(W,B,ie)=>{var Ge=co(),pe=o(Ge),We=o(pe),Ne=o(We),lt=p(We,2),xe=o(lt),Oe=o(xe),Y=p(xe,2),Ke=o(Y),Qe=o(Ke),pt=p(Ke,2);{var gt=te=>{var Z=Tn(),ge=o(Z);D(()=>h(ge,`${r(B),f(()=>r(B).verification.gaps.length)??""} gaps`)),R(te,Z)};me(pt,te=>{r(B),f(()=>r(B).verification.gaps.length>0)&&te(gt)})}D((te,Z,ge)=>{V(pe,"id",te),V(pe,"href",Z),V(pe,"aria-current",(r(l),r(B),f(()=>r(l)===r(B).id?"page":void 0))),h(Ne,ge),h(Oe,(r(B),f(()=>r(B).title))),h(Qe,(r(B),f(()=>r(B).risk.level)))},[()=>(r(B),f(()=>E("queue",r(B).id))),()=>(r(B),f(()=>`#change=${encodeURIComponent(r(B).id)}`)),()=>(ke(r(ie)),f(()=>String(r(ie)+1).padStart(2,"0")))]),Ve("click",pe,te=>{te.preventDefault(),oe(r(B))}),R(W,Ge)}),D((W,B)=>{V(ee,"data-queue",S),h(fe,W),h(De,B)},[()=>f(()=>U(S)),()=>f(()=>le(S))]),R(O,ee)});var Cs=p(qr,2);{var As=O=>{var S=_o(),ee=o(S),ce=o(ee),Me=o(ce),fe=p(ce),qe=o(fe),De=p(ee,2);ae(De,7,()=>(r(i),f(()=>r(i).unclassifiedHunkRefs)),we=>we,(we,W,B)=>{const ie=Nn(()=>(r(i),r(W),f(()=>r(i).hunks.find(Ne=>Ne.id===r(W)))));var Ge=tn(),pe=Jt(Ge);{var We=Ne=>{var lt=ho(),xe=o(lt),Oe=o(xe),Y=o(Oe),Ke=p(Oe,2),Qe=o(Ke),pt=o(Qe),gt=p(Qe),te=o(gt);D((Z,ge)=>{V(xe,"id",Z),V(xe,"href",ge),h(Y,`U${r(B)+1}`),h(pt,(ke(r(ie)),f(()=>r(ie).path))),h(te,`@@ ${ke(r(ie)),f(()=>r(ie).oldStart)??""} → ${ke(r(ie)),f(()=>r(ie).newStart)??""}`)},[()=>(r(W),f(()=>E("queue-hunk",r(W)))),()=>(r(W),f(()=>`#hunk=${encodeURIComponent(r(W))}`))]),Ve("click",xe,Z=>{Z.preventDefault(),st(r(W))}),R(Ne,lt)};me(pe,Ne=>{r(ie)&&Ne(We)})}R(we,Ge)}),D(()=>{h(Me,(r(n),f(()=>r(n).unclassified))),h(qe,(r(i),f(()=>r(i).unclassifiedHunkRefs.length)))}),R(O,S)};me(Cs,O=>{r(i),f(()=>r(i).unclassifiedHunkRefs.length>0)&&O(As)})}var Rs=p(Ar,2),Dr=o(Rs),Nr=o(Dr),Or=o(Nr),Ls=o(Or),$r=p(Or,2),Is=o($r),Ms=p($r,2),qs=o(Ms),Fr=p(Nr,2),Pr=o(Fr),Hr=o(Pr),Ds=o(Hr),Ns=p(Hr,2),Os=o(Ns),Ur=p(Pr,2),jr=o(Ur),$s=o(jr),Fs=p(jr,2),Ps=o(Fs),Br=p(Ur,2),Vr=o(Br),Hs=o(Vr),Us=p(Vr,2),js=o(Us),zr=p(Br,2),Yr=o(zr),Bs=o(Yr),Vs=p(Yr,2),zs=o(Vs),Ys=p(zr,2),Gr=o(Ys),Gs=o(Gr),Ws=p(Gr,2),Ks=o(Ws),Qs=p(Fr,2),Wr=o(Qs),Xs=o(Wr),Zs=p(Wr,2);ae(Zs,5,()=>(r(i),f(()=>r(i).files)),O=>O.id,(O,S)=>{var ee=po(),ce=o(ee),Me=o(ce),fe=p(ce,2),qe=o(fe),De=p(fe,2),we=o(De);D(()=>{h(Me,(r(S),f(()=>r(S).status))),h(qe,(r(S),f(()=>r(S).oldPath&&r(S).newPath&&r(S).oldPath!==r(S).newPath?`${r(S).oldPath} → ${r(S).newPath}`:r(S).newPath??r(S).oldPath))),h(we,(r(S),f(()=>r(S).binary?"binary":`+${r(S).additions??0} / −${r(S).deletions??0}`)))}),R(O,ee)});var Js=p(Dr,2);{var ea=O=>{var S=To(),ee=o(S),ce=o(ee),Me=p(ee,2),fe=o(Me),qe=o(fe),De=o(qe),we=p(qe,2),W=o(we),B=p(fe,2),ie=o(B),Ge=o(ie),pe=p(ie,2),We=o(pe),Ne=p(pe,2),lt=o(Ne),xe=p(Me,2),Oe=o(xe),Y=o(Oe),Ke=o(Y),Qe=p(Y,2),pt=o(Qe),gt=p(Qe,2),te=o(gt),Z=p(Oe,2),ge=o(Z),Gt=o(ge),bn=p(ge,2),jn=o(bn),Wt=p(Z,2),wn=o(Wt),Bn=o(wn),Vn=p(wn,2);{var ra=$=>{var x=go();ae(x,5,()=>(r(v),f(()=>r(v).userImpact)),et,(F,se)=>{var $e=Cn(),Fe=o($e);D(()=>h(Fe,r(se))),R(F,$e)}),R($,x)},ia=$=>{var x=mo(),F=o(x);D(()=>h(F,(r(n),f(()=>r(n).noImpact)))),R($,x)};me(Vn,$=>{r(v),f(()=>r(v).userImpact.length>0)?$(ra):$(ia,-1)})}var Kr=p(Wt,2),Qr=o(Kr),sa=o(Qr),aa=p(Qr,2);ae(aa,5,()=>(r(v),f(()=>r(v).risk.reasons)),et,($,x)=>{var F=Cn(),se=o(F);D(()=>h(se,r(x))),R($,F)});var Xr=p(Kr,2),Zr=o(Xr),la=o(Zr),oa=p(Zr,2);ae(oa,5,()=>(r(v),f(()=>r(v).verification.gaps)),et,($,x)=>{var F=Cn(),se=o(F);D(()=>h(se,r(x))),R($,F)});var fa=p(Xr,2),Jr=o(fa),ua=o(Jr),ca=p(Jr,2);ae(ca,5,()=>(r(v),f(()=>r(v).verification.verified)),et,($,x)=>{var F=Cn(),se=o(F);D(()=>h(se,r(x))),R($,F)});var ei=p(xe,2),ti=o(ei),da=o(ti),ni=o(da),va=o(ni),ha=p(ni,2),_a=o(ha),ri=p(ti,2);ae(ri,5,()=>(r(T),f(()=>r(T).slice(0,3))),$=>$.id,($,x)=>{var F=yo(),se=o(F),$e=o(se),Fe=p(se),Xe=o(Fe),It=p(Fe,2),mt=o(It);D(()=>{h($e,(r(x),f(()=>r(x).type))),h(Xe,(r(x),f(()=>r(x).path))),h(mt,(r(x),f(()=>r(x).summary)))}),R($,F)});var pa=p(ri,2);{var ga=$=>{var x=wo(),F=o(x),se=o(F),$e=p(F,2);ae($e,5,()=>(r(T),f(()=>r(T).slice(3))),Fe=>Fe.id,(Fe,Xe)=>{var It=bo(),mt=o(It),Yn=o(mt),kn=p(mt);D(()=>{h(Yn,(r(Xe),f(()=>r(Xe).path))),h(kn,` — ${r(Xe),f(()=>r(Xe).summary)??""}`)}),R(Fe,It)}),D(()=>h(se,`${r(n),f(()=>r(n).moreEvidence)??""} (${r(T),f(()=>r(T).length-3)??""})`)),R($,x)};me(pa,$=>{r(T),f(()=>r(T).length>3)&&$(ga)})}var ma=p(ei,2),ii=o(ma),si=o(ii),ai=o(si),ya=o(ai),ba=p(ai,2),wa=o(ba),xa=p(si,2),xn=o(xa),ka=o(xn),zn=p(xn,2),Ea=o(zn),Sa=p(ii,2);ae(Sa,1,()=>r(b),$=>$.id,($,x)=>{var F=So();let se;var $e=o(F),Fe=o($e),Xe=o(Fe),It=o(Xe),mt=p(Xe,2),Yn=o(mt),kn=p(Fe,2),En=p($e,2);let li;ae(En,5,()=>(r(x),f(()=>Sr(r(x)))),et,(yt,k)=>{var Mt=tn(),Aa=Jt(Mt);{var Ra=Ze=>{var Be=ki(),Je=o(Be);D(qt=>h(Je,qt),[()=>(r(n),r(k),f(()=>r(n).context.replace("{count}",String(r(k).count))))]),Ve("click",Be,()=>Tr(r(x).id)),R(Ze,Be)},La=Ze=>{var Be=xo(),Je=o(Be),qt=o(Je),Dt=p(Je,2),Gn=o(Dt),Kt=p(Dt,2),Wn=o(Kt),Kn=p(Kt,2);ae(Kn,5,()=>(r(x),r(k),f(()=>Un(r(x),r(k).index))),et,(Qn,Nt)=>{var Ot=Tn();let Qt;var Xn=o(Ot);D(()=>{Qt=tt(Ot,1,"",null,Qt,{"word-change":r(Nt).changed}),h(Xn,(r(Nt),f(()=>r(Nt).text)))}),R(Qn,Ot)}),D(()=>{tt(Be,1,(r(k),f(()=>`diff-line ${r(k).line.kind}`))),V(Je,"aria-label",(r(k),f(()=>`old line ${r(k).line.oldLine??"none"}`))),h(qt,(r(k),f(()=>r(k).line.oldLine??""))),V(Dt,"aria-label",(r(k),f(()=>`new line ${r(k).line.newLine??"none"}`))),h(Gn,(r(k),f(()=>r(k).line.newLine??""))),h(Wn,(r(k),f(()=>r(k).line.kind==="addition"?"+":r(k).line.kind==="deletion"?"−":" ")))}),R(Ze,Be)},Ia=Ze=>{var Be=ko(),Je=o(Be);let qt;var Dt=o(Je),Gn=o(Dt),Kt=p(Dt,2),Wn=o(Kt),Kn=p(Kt,2);{var Qn=bt=>{var Xt=Ei();ae(Xt,5,()=>(r(x),r(k),f(()=>Un(r(x),r(k).index))),et,(Zn,wt)=>{var xt=Tn();let Zt;var Jn=o(xt);D(()=>{Zt=tt(xt,1,"",null,Zt,{"word-change":r(wt).changed}),h(Jn,(r(wt),f(()=>r(wt).text)))}),R(Zn,xt)}),R(bt,Xt)};me(Kn,bt=>{r(k),f(()=>r(k).line.kind!=="addition")&&bt(Qn)})}var Nt=p(Je,2);let Ot;var Qt=o(Nt),Xn=o(Qt),oi=p(Qt,2),Ma=o(oi),qa=p(oi,2);{var Da=bt=>{var Xt=Ei();ae(Xt,5,()=>(r(x),r(k),f(()=>Un(r(x),r(k).index))),et,(Zn,wt)=>{var xt=Tn();let Zt;var Jn=o(xt);D(()=>{Zt=tt(xt,1,"",null,Zt,{"word-change":r(wt).changed}),h(Jn,(r(wt),f(()=>r(wt).text)))}),R(Zn,xt)}),R(bt,Xt)};me(qa,bt=>{r(k),f(()=>r(k).line.kind!=="deletion")&&bt(Da)})}D(()=>{qt=tt(Je,1,(r(k),f(()=>`diff-line ${r(k).line.kind==="addition"?"empty":r(k).line.kind}`)),null,qt,{"empty-side":r(k).line.kind==="addition"}),h(Gn,(r(k),f(()=>r(k).line.oldLine??""))),h(Wn,(r(k),f(()=>r(k).line.kind==="deletion"?"−":" "))),Ot=tt(Nt,1,(r(k),f(()=>`diff-line ${r(k).line.kind==="deletion"?"empty":r(k).line.kind}`)),null,Ot,{"empty-side":r(k).line.kind==="deletion"}),h(Xn,(r(k),f(()=>r(k).line.newLine??""))),h(Ma,(r(k),f(()=>r(k).line.kind==="addition"?"+":" ")))}),R(Ze,Be)};me(Aa,Ze=>{r(k),f(()=>r(k).kind==="fold")?Ze(Ra):r(m)==="unified"?Ze(La,1):Ze(Ia,-1)})}R(yt,Mt)});var Ta=p(En,2);{var Ca=yt=>{var k=Eo(),Mt=o(k);D(()=>h(Mt,`← ${r(n),f(()=>r(n).backChange)??""}`)),Ve("click",k,Hn),R(yt,k)};me(Ta,yt=>{r(d),r(x),f(()=>r(d)===r(x).id)&&yt(Ca)})}D((yt,k,Mt)=>{se=tt(F,1,"hunk",null,se,{"active-hunk":r(d)===r(x).id}),V(F,"id",yt),V(F,"aria-labelledby",k),h(It,(r(x),f(()=>r(x).path))),V(mt,"id",Mt),h(Yn,`@@ −${r(x),f(()=>r(x).oldStart)??""},${r(x),f(()=>r(x).oldLines)??""} +${r(x),f(()=>r(x).newStart)??""},${r(x),f(()=>r(x).newLines)??""} @@ ${r(x),f(()=>r(x).heading)??""}`),V(kn,"aria-label",(r(x),f(()=>`Link to hunk in ${r(x).path}`))),li=tt(En,1,"diff-table",null,li,{"split-diff":r(m)==="split"}),V(En,"aria-label",(r(x),f(()=>`Diff for ${r(x).path}`)))},[()=>(r(x),f(()=>E("hunk",r(x).id))),()=>(r(x),f(()=>E("hunk-title",r(x).id))),()=>(r(x),f(()=>E("hunk-title",r(x).id)))]),Ve("click",kn,()=>je(r(x).id)),R($,F)}),D(($,x,F,se,$e)=>{V(S,"id",$),V(S,"aria-labelledby",x),h(ce,`← ${r(n),f(()=>r(n).backQueue)??""}`),h(De,`Focused change / ${r(v),f(()=>r(v).kind)??""}`),V(we,"id",F),h(W,(r(v),f(()=>r(v).title))),V(ie,"data-queue",se),h(Ge,$e),h(We,`${r(v),f(()=>r(v).risk.level)??""} risk`),h(lt,(r(v),f(()=>r(v).intent.source))),h(Ke,(r(n),f(()=>r(n).what))),h(pt,(r(v),f(()=>r(v).summary))),h(te,(r(v),f(()=>r(v).implementation))),h(Gt,(r(n),f(()=>r(n).why))),h(jn,(r(v),f(()=>r(v).intent.text||"Intent unknown"))),h(Bn,(r(n),f(()=>r(n).userImpact))),h(sa,(r(n),f(()=>r(n).risk))),h(la,(r(n),f(()=>r(n).gaps))),h(ua,(r(n),f(()=>r(n).verified))),h(va,`Evidence / ${r(T),f(()=>r(T).length)??""}`),h(_a,(r(n),f(()=>r(n).evidence))),h(ya,`Structured patch / ${r(b),f(()=>r(b).length)??""}`),h(wa,(r(n),f(()=>r(n).codeDiff))),V(xn,"aria-pressed",r(m)==="unified"),h(ka,(r(n),f(()=>r(n).unified))),V(zn,"aria-pressed",r(m)==="split"),h(Ea,(r(n),f(()=>r(n).split)))},[()=>(r(v),f(()=>E("change",r(v).id))),()=>(r(v),f(()=>E("title",r(v).id))),()=>(r(v),f(()=>E("title",r(v).id))),()=>(r(v),f(()=>G(r(v)))),()=>(r(v),f(()=>U(G(r(v)))))]),Ve("click",ee,X),Ve("click",xn,()=>q(m,"unified")),Ve("click",zn,()=>q(m,"split")),R(O,S)},ta=O=>{const S=Nn(()=>(r(i),r(d),f(()=>r(i).hunks.find(fe=>fe.id===r(d)))));var ee=tn(),ce=Jt(ee);{var Me=fe=>{var qe=Ao(),De=o(qe),we=o(De),W=p(De,2),B=o(W),ie=p(W,2),Ge=o(ie),pe=p(ie,2),We=o(pe),Ne=o(We),lt=o(Ne),xe=p(We,2);ae(xe,5,()=>(ke(r(S)),f(()=>Sr(r(S)))),et,(Oe,Y)=>{var Ke=tn(),Qe=Jt(Ke);{var pt=te=>{var Z=ki(),ge=o(Z);D(Gt=>h(ge,Gt),[()=>(r(n),r(Y),f(()=>r(n).context.replace("{count}",String(r(Y).count))))]),Ve("click",Z,()=>Tr(r(S).id)),R(te,Z)},gt=te=>{var Z=Co(),ge=o(Z),Gt=o(ge),bn=p(ge),jn=o(bn),Wt=p(bn),wn=o(Wt),Bn=p(Wt),Vn=o(Bn);D(()=>{tt(Z,1,(r(Y),f(()=>`diff-line ${r(Y).line.kind}`))),h(Gt,(r(Y),f(()=>r(Y).line.oldLine??""))),h(jn,(r(Y),f(()=>r(Y).line.newLine??""))),h(wn,(r(Y),f(()=>r(Y).line.kind==="addition"?"+":r(Y).line.kind==="deletion"?"−":" "))),h(Vn,(r(Y),f(()=>r(Y).line.content)))}),R(te,Z)};me(Qe,te=>{r(Y),f(()=>r(Y).kind==="fold")?te(pt):te(gt,-1)})}R(Oe,Ke)}),D(Oe=>{h(we,`← ${r(n),f(()=>r(n).backQueue)??""}`),h(B,(r(n),f(()=>r(n).unclassified))),h(Ge,(ke(r(S)),f(()=>r(S).path))),V(pe,"id",Oe),h(lt,`@@ −${ke(r(S)),f(()=>r(S).oldStart)??""},${ke(r(S)),f(()=>r(S).oldLines)??""} +${ke(r(S)),f(()=>r(S).newStart)??""},${ke(r(S)),f(()=>r(S).newLines)??""} @@`)},[()=>(ke(r(S)),f(()=>E("hunk",r(S).id)))]),Ve("click",De,X),R(fe,qe)};me(ce,fe=>{r(S)&&fe(Me)})}R(O,ee)},na=O=>{var S=Ro(),ee=o(S),ce=o(ee);D(()=>h(ce,(r(n),f(()=>r(n).empty)))),R(O,S)};me(Js,O=>{r(v)?O(ea):r(d)?O(ta,1):O(na,-1)})}D(O=>{V(P,"data-status",(r(i),f(()=>r(i).status))),h(re,(r(i),f(()=>r(i).status))),h(bs,(r(n),f(()=>r(n).visualGap))),h(xs,(r(i),f(()=>r(i).reportId))),h(Es,(r(n),f(()=>r(n).queue))),h(Ss,(r(n),f(()=>r(n).search))),V(Mr,"aria-label",(r(n),f(()=>r(n).queue))),h(Ls,`Overview / ${r(i),f(()=>r(i).status)??""}`),h(Is,(r(n),f(()=>r(n).summary))),h(qs,(r(i),f(()=>r(i).summary.statement))),h(Ds,(r(n),f(()=>r(n).files))),h(Os,(r(i),f(()=>r(i).summary.filesChanged))),h($s,(r(n),f(()=>r(n).additions))),h(Ps,`+${r(i),f(()=>r(i).summary.additions)??""}`),h(Hs,(r(n),f(()=>r(n).deletions))),h(js,`−${r(i),f(()=>r(i).summary.deletions)??""}`),h(Bs,(r(n),f(()=>r(n).changes))),h(zs,(r(i),f(()=>r(i).changes.length))),h(Gs,(r(n),f(()=>r(n).lowSignal))),h(Ks,O),h(Xs,(r(n),f(()=>r(n).inventory)))},[()=>(r(i),f(()=>r(i).files.filter(O=>O.lowSignal).length))]),fo(Ts,()=>r(c),O=>q(c,O)),R(y,C)},ys=y=>{var C=Io(),M=o(C);D(()=>{V(C,"role",r(a)?"alert":"status"),h(M,(r(a),f(()=>r(a)||s.en.loading)))}),R(y,C)};me(gs,y=>{r(i)?y(ms):y(ys,-1)})}R(e,Cr),$i()}Bl(["click"]);const Si=document.querySelector("[data-utsuri-app]");Si&&Kl(Mo,{target:Si});\n';
var reportUiCss = ":root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Hiragino Sans,Yu Gothic UI,sans-serif;font-size:16px;--paper: #f2efe7;--paper-raised: #fffdf7;--ink: #171a1f;--ink-muted: #61656d;--line: #c9c4b8;--line-strong: #7c7b77;--rail: #e4e0d6;--blue: #1558d6;--blue-soft: #dce7ff;--coral: #b73f2d;--coral-soft: #fae1db;--green: #176948;--green-soft: #d8eee3;--amber: #805400;--amber-soft: #f5e7bf;--focus: #0066ff;--code-bg: #20242b;--code-text: #f5f2e9;--code-muted: #a9afb9;--addition: #123d2e;--deletion: #4d2524;--word-addition: #297553;--word-deletion: #9c4139;--radius: .25rem;--shadow: 0 1px 0 rgb(23 26 31 / 8%), 0 12px 34px rgb(23 26 31 / 7%)}@media (prefers-color-scheme: dark){:root{--paper: #15171a;--paper-raised: #1e2126;--ink: #f4f0e7;--ink-muted: #b3b5ba;--line: #3b3f45;--line-strong: #71757c;--rail: #1a1d21;--blue: #80a9ff;--blue-soft: #25395f;--coral: #ff9b89;--coral-soft: #542e2a;--green: #76d4ac;--green-soft: #1c4637;--amber: #f0c66c;--amber-soft: #4b3b1c;--focus: #8ab4ff;--code-bg: #0c0e11}}*{box-sizing:border-box}html{background:var(--paper);color:var(--ink);scroll-behavior:smooth}body{margin:0;min-width:320px;background-image:linear-gradient(rgb(23 26 31 / 3%) 1px,transparent 1px);background-size:100% 2rem}button,input{font:inherit}button,a,summary{-webkit-tap-highlight-color:transparent}a{color:inherit}:focus-visible{outline:3px solid var(--focus);outline-offset:3px}.skip-link{position:fixed;inset:0 auto auto 0;z-index:100;transform:translateY(-120%);padding:.75rem 1rem;background:var(--paper-raised);color:var(--ink)}.skip-link:focus{transform:translateY(0)}.report-shell{display:grid;grid-template-columns:clamp(17rem,23vw,22rem) minmax(0,1fr);grid-template-rows:4.5rem minmax(calc(100vh - 4.5rem),auto);min-height:100vh}.report-header{position:sticky;top:0;z-index:20;grid-column:1 / -1;display:grid;grid-template-columns:clamp(17rem,23vw,22rem) 1fr auto;align-items:stretch;min-height:4.5rem;border-bottom:1px solid var(--line-strong);background:color-mix(in srgb,var(--paper-raised) 94%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}.wordmark{display:flex;align-items:center;gap:.8rem;padding:0 1.25rem;border-right:1px solid var(--line-strong);text-decoration:none}.wordmark>span{display:grid;width:2rem;height:2rem;place-items:center;border-radius:50%;background:var(--ink);color:var(--paper-raised);font-size:.68rem;font-weight:800;letter-spacing:-.08em}.wordmark strong{font-size:1.05rem;letter-spacing:-.025em}.report-state{display:flex;align-items:center;gap:.65rem;padding:0 1.5rem;font-size:.78rem;font-weight:760;letter-spacing:.075em}.report-state small{color:var(--ink-muted);font-size:.75rem;font-weight:500;letter-spacing:0}.state-mark{width:.72rem;height:.72rem;border:2px solid currentColor;transform:rotate(45deg)}.report-state[data-status=UNCOVERED],.report-state[data-status=INCOMPLETE]{color:var(--amber)}.report-id{align-self:center;margin:0;padding:0 1.25rem;color:var(--ink-muted);font:.7rem/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}.review-rail{position:sticky;top:4.5rem;align-self:start;height:calc(100vh - 4.5rem);overflow-y:auto;border-right:1px solid var(--line-strong);background:color-mix(in srgb,var(--rail) 96%,transparent)}.rail-heading,.queue-search,.queue-section h3{padding-right:1.25rem;padding-left:1.25rem}.rail-heading{padding-top:1.6rem;padding-bottom:1rem}.kicker{margin:0 0 .55rem;color:var(--ink-muted);font-size:.69rem;font-weight:750;letter-spacing:.12em;text-transform:uppercase}.rail-heading h2,.decision-summary h1,.focused-change h2,.section-heading h3{margin:0;letter-spacing:-.04em}.rail-heading h2{font-size:1.55rem}.queue-search{display:grid;gap:.42rem;padding-bottom:1.4rem;color:var(--ink-muted);font-size:.72rem;font-weight:650}.queue-search input{width:100%;border:1px solid var(--line-strong);border-radius:var(--radius);padding:.72rem .8rem;background:var(--paper-raised);color:var(--ink)}.queue-section{border-top:1px solid var(--line)}.queue-section h3{display:flex;align-items:center;justify-content:space-between;margin:0;padding-top:.75rem;padding-bottom:.75rem;color:var(--ink-muted);font-size:.7rem;letter-spacing:.055em;text-transform:uppercase}.count{min-width:1.7rem;border:1px solid var(--line);border-radius:1rem;padding:.12rem .38rem;text-align:center}.queue-section ol{margin:0;padding:0;list-style:none}.queue-section a{display:grid;grid-template-columns:2rem minmax(0,1fr);gap:.65rem;padding:.9rem 1.25rem;border-top:1px solid color-mix(in srgb,var(--line) 70%,transparent);text-decoration:none}.queue-section a:hover,.queue-section a[aria-current=page]{background:var(--paper-raised)}.queue-section a[aria-current=page]{box-shadow:inset .24rem 0 var(--blue)}.queue-index{padding-top:.08rem;color:var(--ink-muted);font:.68rem/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}.queue-copy{min-width:0}.queue-copy strong{display:block;overflow:hidden;font-size:.84rem;line-height:1.35;text-overflow:ellipsis}.queue-copy>span:not(.badges){color:var(--ink-muted);font-size:.7rem}.badges{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.48rem}.badges span,.change-badges span{border:1px solid var(--line);border-radius:99px;padding:.16rem .45rem;color:var(--ink-muted);font-size:.63rem;font-weight:700}main{min-width:0;padding:clamp(1.25rem,3vw,3rem)}.decision-summary,.focused-change{width:min(100%,90rem);margin:0 auto;border:1px solid var(--line-strong);background:var(--paper-raised);box-shadow:var(--shadow)}.decision-summary{display:grid;grid-template-columns:minmax(15rem,1fr) minmax(28rem,1.25fr);gap:clamp(1.5rem,4vw,4rem);padding:clamp(1.4rem,3vw,2.6rem)}.decision-summary h1{font-size:clamp(1.9rem,4vw,3.6rem);line-height:.98}.decision-statement{max-width:44rem;margin:1.25rem 0 0;color:var(--ink-muted);font-size:clamp(1rem,1.6vw,1.25rem);line-height:1.55}.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-self:end;margin:0;border-top:1px solid var(--line-strong);border-bottom:1px solid var(--line-strong)}.metrics div{min-width:0;padding:.85rem .65rem;border-right:1px solid var(--line)}.metrics div:last-child{border-right:0}.metrics dt{min-height:2.2em;color:var(--ink-muted);font-size:.65rem}.metrics dd{margin:.35rem 0 0;font:700 clamp(1.25rem,2vw,1.8rem)/1 ui-monospace,SFMono-Regular,Menlo,monospace}.positive{color:var(--green)}.negative{color:var(--coral)}.file-inventory{grid-column:1 / -1;border-top:1px solid var(--line);padding-top:1rem}.file-inventory summary,.more-evidence summary{cursor:pointer;font-size:.78rem;font-weight:720}.file-inventory ul{display:grid;gap:0;margin:.8rem 0 0;padding:0;list-style:none}.file-inventory li{display:grid;grid-template-columns:6rem minmax(0,1fr) auto;gap:1rem;padding:.48rem 0;border-top:1px solid var(--line);color:var(--ink-muted);font-size:.72rem}.file-inventory code{overflow-wrap:anywhere;color:var(--ink)}.file-status{font-weight:750;text-transform:uppercase}.focused-change{margin-top:1.4rem;padding:clamp(1.4rem,3vw,2.6rem)}.back-link,.anchor-button{border:0;padding:0;background:transparent;color:var(--blue);cursor:pointer;font-size:.75rem;font-weight:720}.change-header{display:flex;align-items:end;justify-content:space-between;gap:2rem;margin-top:1.8rem;padding-bottom:1.5rem;border-bottom:2px solid var(--ink)}.change-header h2{max-width:50rem;font-size:clamp(1.8rem,4vw,3.25rem);line-height:1.04}.change-badges{display:flex;flex-wrap:wrap;justify-content:end;gap:.4rem}.change-badges span[data-queue=action-required]{border-color:var(--coral);background:var(--coral-soft);color:var(--coral)}.change-badges span[data-queue=needs-confirmation]{border-color:var(--amber);background:var(--amber-soft);color:var(--amber)}.change-badges span[data-queue=no-issue]{border-color:var(--green);background:var(--green-soft);color:var(--green)}.explanation-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-bottom:1px solid var(--line-strong)}.explanation-grid section{min-width:0;padding:1.5rem 1.5rem 1.5rem 0;border-bottom:1px solid var(--line)}.explanation-grid section:nth-child(2n){padding-right:0;padding-left:1.5rem;border-left:1px solid var(--line)}.explanation-grid h3{margin:0 0 .7rem;font-size:.74rem;letter-spacing:.08em;text-transform:uppercase}.explanation-grid p,.explanation-grid li{font-size:.9rem;line-height:1.62}.explanation-grid ul{margin:0;padding-left:1.1rem}.technical{color:var(--ink-muted)}.risk-block{box-shadow:inset .22rem 0 var(--coral);padding-left:1.2rem!important}.gap-block{background:var(--amber-soft);box-shadow:inset .22rem 0 var(--amber)}.evidence-section,.diff-section{padding-top:2.2rem}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:1.5rem;margin-bottom:1rem}.section-heading h3{font-size:clamp(1.35rem,2.5vw,2rem)}.evidence-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;margin:0;padding:0;list-style:none}.evidence-list li{min-width:0;border:1px solid var(--line);padding:1rem;background:color-mix(in srgb,var(--blue-soft) 35%,transparent)}.evidence-list span{display:block;color:var(--blue);font-size:.64rem;font-weight:780;letter-spacing:.08em;text-transform:uppercase}.evidence-list strong{display:block;overflow-wrap:anywhere;margin-top:.55rem;font:.77rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}.evidence-list p{margin:.55rem 0 0;color:var(--ink-muted);font-size:.78rem;line-height:1.45}.more-evidence{margin-top:.8rem}.segmented-control{display:inline-flex;border:1px solid var(--line-strong);border-radius:var(--radius);overflow:hidden}.segmented-control button{border:0;border-right:1px solid var(--line-strong);padding:.48rem .72rem;background:transparent;color:var(--ink-muted);cursor:pointer;font-size:.7rem;font-weight:700}.segmented-control button:last-child{border-right:0}.segmented-control button[aria-pressed=true]{background:var(--ink);color:var(--paper-raised)}.hunk{overflow:hidden;margin-top:1rem;border:1px solid #555c66;border-radius:var(--radius);background:var(--code-bg);color:var(--code-text)}.hunk.active-hunk{box-shadow:0 0 0 4px var(--focus)}.hunk>header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem 1rem;border-bottom:1px solid #555c66;background:#292e36}.hunk>header p,.hunk>header h4,.hunk>header h3{margin:0;overflow-wrap:anywhere;font:.72rem/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}.hunk>header p{color:#d6d9de;font-weight:760}.hunk>header h4{color:var(--code-muted);font-weight:500}.anchor-button{min-width:2rem;min-height:2rem;color:#9bbaff;font:700 1rem/1 ui-monospace,SFMono-Regular,Menlo,monospace}.diff-table{overflow-x:auto;font:.76rem/1.55 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-variant-ligatures:none}.diff-line{display:grid;grid-template-columns:3.4rem 3.4rem 1.4rem minmax(max-content,1fr);min-height:1.55rem}.diff-line.addition{background:var(--addition)}.diff-line.deletion{background:var(--deletion)}.diff-line.no-newline{color:var(--code-muted);font-style:italic}.line-number{padding:0 .65rem;border-right:1px solid rgb(255 255 255 / 8%);color:var(--code-muted);text-align:right;-webkit-user-select:none;user-select:none}.line-sign{color:var(--code-muted);text-align:center;-webkit-user-select:none;user-select:none}.diff-line code{padding:0 .75rem 0 0;white-space:pre}.word-change{border-radius:.12rem;background:var(--word-addition);box-shadow:0 0 0 .08rem var(--word-addition)}.deletion .word-change{background:var(--word-deletion);box-shadow:0 0 0 .08rem var(--word-deletion)}.context-fold{width:100%;border:0;border-top:1px solid #3a4049;border-bottom:1px solid #3a4049;padding:.4rem;background:#252a31;color:#a9c0ef;cursor:pointer;font:inherit;text-align:center}.split-row{display:grid;grid-template-columns:repeat(2,minmax(max-content,1fr));border-bottom:1px solid rgb(255 255 255 / 5%)}.split-row .diff-line{grid-template-columns:3.4rem 1.4rem minmax(max-content,1fr)}.split-row .diff-line:first-child{border-right:1px solid #555c66}.empty-side{background:#171a1f!important}.hunk-back{margin:.75rem 1rem;color:#9bbaff}.loading{margin:3rem;color:var(--ink-muted)}.empty-focus{min-height:12rem}@media (max-width: 1100px){.report-shell{grid-template-columns:16rem minmax(0,1fr)}.report-header{grid-template-columns:16rem 1fr}.report-id{display:none}.decision-summary{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(5,minmax(5rem,1fr));overflow-x:auto}.evidence-list{grid-template-columns:1fr}}@media (max-width: 760px){.report-shell{display:block}.report-header{position:sticky;display:flex;min-height:3.75rem}.wordmark{border-right:0}.report-state{margin-left:auto;padding-right:1rem}.report-state small{display:none}.review-rail{position:static;width:100%;height:auto;max-height:26rem;border-right:0;border-bottom:1px solid var(--line-strong)}main{padding:.8rem}.decision-summary,.focused-change{box-shadow:none}.change-header{display:block}.change-badges{justify-content:start;margin-top:1rem}.explanation-grid{display:block}.explanation-grid section,.explanation-grid section:nth-child(2n){padding:1.15rem 0;border-left:0}.risk-block,.gap-block{padding-left:1rem!important}.section-heading{display:block}.segmented-control{margin-top:.8rem}.file-inventory li{grid-template-columns:1fr;gap:.25rem}}@media (prefers-reduced-motion: reduce){*,*:before,*:after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important}}@media print{.review-rail,.segmented-control,.back-link,.anchor-button{display:none!important}.report-shell,.report-header{display:block}main{padding:0}.decision-summary,.focused-change{border:0;box-shadow:none}}\n";

// packages/report-builder/src/native-publish.ts
import { spawn as spawn2 } from "node:child_process";
import { closeSync, constants, fstatSync, openSync } from "node:fs";
import { access, lstat as lstat2 } from "node:fs/promises";
import path8 from "node:path";
import { fileURLToPath } from "node:url";
var helperExit = {
  destinationExists: 65,
  identityMismatch: 66,
  unsupported: 67
};
async function resolveNativeHelper() {
  const target = `${process.platform}-${process.arch}`;
  const moduleDirectory = path8.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path8.join(moduleDirectory, "native", target, "utsuri-fs-ops"),
    path8.resolve(moduleDirectory, "../../..", ".artifacts/native", target, "utsuri-fs-ops")
  ];
  for (const candidate of candidates) {
    try {
      const candidateStat = await lstat2(candidate);
      if (!candidateStat.isFile() || candidateStat.isSymbolicLink()) continue;
      await access(candidate, constants.X_OK);
      return candidate;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new UtsuriError(
    "REPORT_ATOMIC_PUBLISH_UNAVAILABLE",
    `The atomic publication helper is unavailable for ${target}`,
    ExitCode.Environment
  );
}
async function runNativeHelper(helper, args, parentDescriptor) {
  return await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn2(helper, args, {
        shell: false,
        stdio: ["ignore", "ignore", "pipe", parentDescriptor]
      });
    } finally {
      closeInheritedDescriptor(parentDescriptor);
    }
    let stderr = "";
    const errorStream = child.stderr;
    if (!errorStream) {
      reject(new Error("Atomic publication helper stderr is unavailable"));
      return;
    }
    errorStream.setEncoding("utf8");
    errorStream.on("data", (chunk) => {
      if (stderr.length < 8192) stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stderr: stderr.trim() }));
  });
}
function duplicateDirectoryDescriptor(parentHandle, parentIdentity) {
  const descriptorPath = `${process.platform === "linux" ? "/proc/self/fd" : "/dev/fd"}/${parentHandle.fd}`;
  const duplicate = openSync(descriptorPath, constants.O_RDONLY);
  const duplicateIdentity = fstatSync(duplicate, { bigint: true });
  if (!duplicateIdentity.isDirectory() || String(duplicateIdentity.dev) !== String(parentIdentity.dev) || String(duplicateIdentity.ino) !== String(parentIdentity.ino)) {
    closeSync(duplicate);
    throw new UtsuriError(
      "REPORT_PUBLISH_IDENTITY_CHANGED",
      "The retained report publication directory changed before helper execution",
      ExitCode.Security
    );
  }
  return duplicate;
}
function closeInheritedDescriptor(descriptor) {
  try {
    closeSync(descriptor);
  } catch (error) {
    if (error.code !== "EBADF") throw error;
  }
}
async function publishDirectoryNoReplace(parentHandle, parentIdentity, sourceName, destinationName, sourceIdentity) {
  const helper = await resolveNativeHelper();
  const inheritedDescriptor = duplicateDirectoryDescriptor(parentHandle, parentIdentity);
  const result2 = await runNativeHelper(
    helper,
    [
      sourceName,
      destinationName,
      String(parentIdentity.dev),
      String(parentIdentity.ino),
      String(sourceIdentity.dev),
      String(sourceIdentity.ino)
    ],
    inheritedDescriptor
  );
  if (result2.code === 0) return;
  if (result2.code === helperExit.destinationExists) {
    throw new UtsuriError(
      "REPORT_IMMUTABLE",
      "The immutable report destination appeared during generation",
      ExitCode.Artifact
    );
  }
  if (result2.code === helperExit.identityMismatch) {
    throw new UtsuriError(
      "REPORT_PUBLISH_IDENTITY_CHANGED",
      "The report publication namespace or validated staging directory changed",
      ExitCode.Security
    );
  }
  if (result2.code === helperExit.unsupported) {
    throw new UtsuriError(
      "REPORT_ATOMIC_PUBLISH_UNAVAILABLE",
      result2.stderr || "The filesystem does not support atomic no-replace publication",
      ExitCode.Environment
    );
  }
  throw new UtsuriError(
    "REPORT_ATOMIC_PUBLISH_FAILED",
    result2.stderr || `The atomic publication helper exited with ${result2.signal ?? result2.code ?? "unknown"}`,
    ExitCode.Environment
  );
}

// schemas/context-pack.schema.json with { type: 'json' }
var context_pack_schema_default2 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/context-pack/v1.1",
  title: "ContextPack",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "reportId",
    "batchId",
    "itemId",
    "baseSha",
    "headSha",
    "anchor",
    "question",
    "code",
    "images",
    "evidenceRefs",
    "priorThreadMessages",
    "redactions",
    "contextHash"
  ],
  properties: {
    schemaVersion: { const: "1.1" },
    reportId: { type: "string" },
    batchId: { type: "string" },
    itemId: { type: "string" },
    baseSha: { type: "string" },
    headSha: { type: "string" },
    anchor: { $ref: "#/$defs/anchor" },
    question: { type: "string", minLength: 1 },
    semanticChange: {
      type: "object",
      additionalProperties: false,
      required: ["id", "title", "summary", "intent", "risk"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        summary: { type: "string" },
        intent: {
          type: "object",
          additionalProperties: false,
          required: ["text", "source", "evidenceRefs"],
          properties: {
            text: { type: "string" },
            source: { enum: ["declared", "supported-inference", "weak-inference", "unknown"] },
            evidenceRefs: { type: "array", items: { type: "string" } }
          }
        },
        risk: {
          type: "object",
          additionalProperties: false,
          required: ["level", "reasons"],
          properties: {
            level: { enum: ["critical", "high", "medium", "low", "info"] },
            reasons: { type: "array", items: { type: "string" } }
          }
        }
      }
    },
    code: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "startLine", "endLine", "textRef"],
        properties: {
          path: { type: "string" },
          startLine: { type: "integer", minimum: 1 },
          endLine: { type: "integer", minimum: 1 },
          textRef: { type: "string" }
        }
      }
    },
    images: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "assetRef"],
        properties: {
          role: { enum: ["before", "after", "diff"] },
          assetRef: { type: "string" },
          crop: { $ref: "#/$defs/region" }
        }
      }
    },
    evidenceRefs: { type: "array", items: { type: "string" }, uniqueItems: true },
    priorThreadMessages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "text"],
        properties: {
          role: { enum: ["human", "agent"] },
          text: { type: "string" }
        }
      }
    },
    redactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "ref"],
        properties: {
          category: { type: "string" },
          ref: { type: "string" }
        }
      }
    },
    contextHash: { type: "string", minLength: 8 }
  },
  $defs: {
    anchor: {
      type: "object",
      additionalProperties: false,
      required: ["type", "ref", "fingerprint"],
      properties: {
        type: {
          enum: [
            "change",
            "file",
            "hunk",
            "line-range",
            "visual-target",
            "visual-region",
            "finding",
            "verification-gap"
          ]
        },
        ref: { type: "string" },
        path: { type: "string" },
        side: { enum: ["before", "after", "diff"] },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
        targetRef: { type: "string" },
        region: { $ref: "#/$defs/region" },
        selectorHint: { type: "string" },
        fingerprint: { type: "string", minLength: 8 }
      }
    },
    region: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "width", "height"],
      properties: {
        x: { type: "number", minimum: 0 },
        y: { type: "number", minimum: 0 },
        width: { type: "number", exclusiveMinimum: 0 },
        height: { type: "number", exclusiveMinimum: 0 }
      }
    }
  }
};

// schemas/review-answer.schema.json with { type: 'json' }
var review_answer_schema_default2 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/review-answer/v1",
  title: "ReviewAnswer",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "batchId",
    "itemId",
    "directAnswer",
    "evidence",
    "uncertainty",
    "suggestedNextActions",
    "metadata"
  ],
  properties: {
    schemaVersion: { const: "1.0" },
    batchId: { type: "string", minLength: 1 },
    itemId: { type: "string", minLength: 1 },
    directAnswer: { type: "string" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "explanation"],
        properties: {
          ref: { type: "string" },
          explanation: { type: "string" }
        }
      }
    },
    uncertainty: { type: "array", items: { type: "string" } },
    suggestedNextActions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "label"],
        properties: {
          type: { enum: ["inspect", "test", "recapture", "propose-patch", "none"] },
          label: { type: "string" },
          anchorRef: { type: "string" }
        }
      }
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["host", "contextHash"],
      properties: {
        host: { enum: ["codex", "claude-code", "unknown"] },
        originSessionRef: { type: "string" },
        answerTurnRef: { type: "string" },
        contextHash: { type: "string", minLength: 8 }
      }
    }
  }
};

// schemas/review-state.schema.json with { type: 'json' }
var review_state_schema_default2 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/review-state/v1.3",
  title: "ReviewState",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "reportId",
    "reportFingerprint",
    "revision",
    "updatedAt",
    "viewed",
    "judgments",
    "threadIds",
    "orphanedThreadIds"
  ],
  properties: {
    schemaVersion: { const: "1.3" },
    reportId: { type: "string", minLength: 1 },
    reportFingerprint: { type: "string", minLength: 8 },
    revision: { type: "integer", minimum: 0 },
    updatedAt: { type: "string", format: "date-time" },
    viewed: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["anchor", "state", "updatedAt"],
        properties: {
          anchor: { $ref: "#/$defs/reviewAnchor" },
          state: { enum: ["unseen", "viewed", "stale"] },
          updatedAt: { type: "string", format: "date-time" }
        }
      }
    },
    judgments: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["changeId", "state", "updatedAt"],
        properties: {
          changeId: { type: "string" },
          state: { enum: ["unreviewed", "reviewed", "follow-up", "blocked", "stale"] },
          updatedAt: { type: "string", format: "date-time" }
        }
      }
    },
    threadIds: { type: "array", items: { type: "string" }, uniqueItems: true },
    orphanedThreadIds: { type: "array", items: { type: "string" }, uniqueItems: true }
  },
  $defs: {
    reviewAnchor: {
      type: "object",
      additionalProperties: false,
      required: ["type", "ref", "fingerprint"],
      properties: {
        type: {
          enum: [
            "change",
            "file",
            "hunk",
            "line-range",
            "visual-target",
            "visual-region",
            "finding",
            "verification-gap"
          ]
        },
        ref: { type: "string", minLength: 1 },
        path: { type: "string" },
        side: { enum: ["before", "after", "diff"] },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
        targetRef: { type: "string" },
        region: { $ref: "#/$defs/region" },
        selectorHint: { type: "string" },
        fingerprint: { type: "string", minLength: 8 }
      }
    },
    region: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "width", "height"],
      properties: {
        x: { type: "number", minimum: 0 },
        y: { type: "number", minimum: 0 },
        width: { type: "number", exclusiveMinimum: 0 },
        height: { type: "number", exclusiveMinimum: 0 }
      }
    }
  }
};

// schemas/review-thread.schema.json with { type: 'json' }
var review_thread_schema_default2 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://utsu-ri.dev/schemas/review-thread/v1",
  title: "ReviewThread",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "reportId",
    "anchor",
    "kind",
    "state",
    "messages",
    "agentAttention",
    "createdAt",
    "updatedAt"
  ],
  properties: {
    id: { type: "string", pattern: "^thread[-:]" },
    reportId: { type: "string" },
    anchor: { $ref: "#/$defs/reviewAnchor" },
    kind: { enum: ["note", "question", "finding", "change-request"] },
    state: { enum: ["open", "answered", "resolved", "stale", "orphaned"] },
    messages: { type: "array", items: { $ref: "#/$defs/message" } },
    agentAttention: {
      type: "object",
      additionalProperties: false,
      required: ["state"],
      properties: {
        state: {
          enum: ["none", "requested", "batched", "submitted", "acknowledged", "answered", "stale"]
        },
        batchId: { type: "string" },
        updatedAt: { type: "string", format: "date-time" }
      }
    },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" }
  },
  $defs: {
    reviewAnchor: {
      type: "object",
      additionalProperties: false,
      required: ["type", "ref", "fingerprint"],
      properties: {
        type: {
          enum: [
            "change",
            "file",
            "hunk",
            "line-range",
            "visual-target",
            "visual-region",
            "finding",
            "verification-gap"
          ]
        },
        ref: { type: "string" },
        path: { type: "string" },
        side: { enum: ["before", "after", "diff"] },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
        targetRef: { type: "string" },
        region: {
          type: "object",
          additionalProperties: false,
          required: ["x", "y", "width", "height"],
          properties: {
            x: { type: "number", minimum: 0 },
            y: { type: "number", minimum: 0 },
            width: { type: "number", exclusiveMinimum: 0 },
            height: { type: "number", exclusiveMinimum: 0 }
          }
        },
        selectorHint: { type: "string" },
        fingerprint: { type: "string", minLength: 8 }
      }
    },
    message: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "author", "body", "createdAt"],
      properties: {
        id: { type: "string" },
        kind: { enum: ["human-note", "agent-answer", "system"] },
        author: {
          type: "object",
          additionalProperties: false,
          required: ["type", "label"],
          properties: {
            type: { enum: ["human", "agent", "system"] },
            label: { type: "string" }
          }
        },
        body: { type: "string" },
        feedbackItemId: { type: "string" },
        evidenceRefs: { type: "array", items: { type: "string" } },
        createdAt: { type: "string", format: "date-time" }
      }
    }
  }
};

// packages/report-builder/src/schema-assets.ts
var reportSchemaFiles = [
  "review-state.schema.json",
  "review-thread.schema.json",
  "context-pack.schema.json",
  "review-answer.schema.json"
];
var schemaDocuments = {
  "context-pack.schema.json": context_pack_schema_default2,
  "review-answer.schema.json": review_answer_schema_default2,
  "review-state.schema.json": review_state_schema_default2,
  "review-thread.schema.json": review_thread_schema_default2
};
var reportSchemaAssets = Object.freeze(
  Object.fromEntries(
    reportSchemaFiles.map((filename) => [
      filename,
      `${JSON.stringify(schemaDocuments[filename], null, 2)}
`
    ])
  )
);

// packages/report-builder/src/index.ts
var reportCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'"
].join("; ");
var statusIconSvg = '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="status" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="currentColor"/></symbol></svg>\n';
var reportArtifactPaths = /* @__PURE__ */ new Set([
  "assets/app.css",
  "assets/app.js",
  "assets/icons.svg",
  "context-pack.schema.json",
  "diagnostics/summary.json",
  "index.html",
  "report.json",
  "review-answer.schema.json",
  "review-state.schema.json",
  "review-thread.schema.json"
]);
var maximumArtifactBytes = 16 * 1024 * 1024;
function sha2562(bytes) {
  return createHash2("sha256").update(bytes).digest("hex");
}
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function indexHtml(report) {
  const summary = escapeHtml(report.summary.statement);
  const status = escapeHtml(report.status);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${reportCsp}">
  <title>Utsuri review — ${status}</title>
  <link rel="stylesheet" href="./assets/app.css">
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to review</a>
  <main id="main-content" data-static-fallback tabindex="-1">
    <p>Utsuri review · ${status}</p>
    <h1>Review summary</h1>
    <p>${summary}</p>
    <p>Interactive data is available when this report is served locally.</p>
  </main>
  <div data-utsuri-app></div>
  <script type="module" src="./assets/app.js"></script>
</body>
</html>
`;
}
async function readRegularBytes(filename) {
  let handle;
  try {
    handle = await open(filename, constants2.O_RDONLY | constants2.O_NOFOLLOW | constants2.O_NONBLOCK);
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") throw error;
    if (code === "ELOOP" || code === "ENXIO") {
      throw new UtsuriError(
        "REPORT_SPECIAL_FILE",
        `Artifact is not a regular non-symlink file: ${path9.basename(filename)}`,
        ExitCode.Security
      );
    }
    throw error;
  }
  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) {
      throw new UtsuriError(
        "REPORT_SPECIAL_FILE",
        `Artifact is not a regular file: ${path9.basename(filename)}`,
        ExitCode.Security
      );
    }
    if (fileStat.size > maximumArtifactBytes) {
      throw new UtsuriError(
        "REPORT_FILE_TOO_LARGE",
        `Artifact exceeds ${maximumArtifactBytes} bytes: ${path9.basename(filename)}`,
        ExitCode.Artifact
      );
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
async function readRegularText(filename) {
  return (await readRegularBytes(filename)).toString("utf8");
}
async function readOptionalJson(filename) {
  try {
    const content = await readRegularText(filename);
    try {
      return JSON.parse(content);
    } catch {
      throw new UtsuriError(
        "ARTIFACT_JSON_INVALID",
        `${path9.basename(filename)} is not valid JSON`,
        ExitCode.Artifact
      );
    }
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function assertReferenceResult(id, result2) {
  if (!result2.ok) throw new UtsuriError(id, result2.errors.join("; "), ExitCode.Artifact);
}
function inferredKind(paths) {
  const extensions = new Set(paths.map((entry) => path9.extname(entry).toLowerCase()));
  if ([...extensions].some((extension) => [".css", ".scss", ".sass", ".less"].includes(extension))) {
    return "visual";
  }
  if ([...extensions].every((extension) => [".md", ".txt"].includes(extension))) return "content";
  if ([...extensions].some(
    (extension) => [".html", ".svelte", ".vue", ".tsx", ".jsx"].includes(extension)
  )) {
    return "mixed";
  }
  return "unknown";
}
function createCandidateChanges(diff, plan) {
  const filesById = new Map(diff.files.map((file) => [file.id, file]));
  return plan.candidates.map((candidate) => {
    const paths = candidate.fileRefs.map((reference) => filesById.get(reference)).filter((file) => file !== void 0).map((file) => file.newPath ?? file.oldPath ?? "unknown");
    const lowSignalOnly = candidate.hunkRefs.every(
      (reference) => diff.hunks.find((hunk) => hunk.id === reference)?.lowSignal
    );
    return {
      id: candidate.id,
      title: candidate.title,
      kind: inferredKind(paths),
      summary: `${candidate.hunkRefs.length} hunk${candidate.hunkRefs.length === 1 ? "" : "s"} across ${paths.length} file${paths.length === 1 ? "" : "s"}.`,
      intent: {
        text: "Intent has not been declared.",
        source: "unknown",
        evidenceRefs: candidate.evidenceRefs,
        missingEvidence: ["User request, specification, or commit rationale"]
      },
      implementation: `Git changes were collected for ${paths.join(", ")}.`,
      userImpact: [],
      technicalImpact: paths.map((entry) => `Changed ${entry}`),
      risk: {
        level: lowSignalOnly ? "info" : "low",
        reasons: lowSignalOnly ? ["Only low-signal or generated evidence is present."] : ["Runtime and visual effects have not been exercised."]
      },
      hunkRefs: candidate.hunkRefs,
      targetRefs: [],
      findingRefs: [],
      verification: {
        verified: ["Git patch structure and cross-references were validated."],
        gaps: ["Visual behavior was not captured.", "Runtime behavior was not executed."]
      }
    };
  });
}
function createCodeOnlyReport(input, diff, evidenceIndex, plan, annotations) {
  const sourceChanges = annotations?.changes.length ? annotations.changes : createCandidateChanges(diff, plan);
  const changes = sourceChanges.map((change) => ({
    ...change,
    verification: {
      verified: change.verification.verified,
      gaps: [
        .../* @__PURE__ */ new Set([
          ...change.verification.gaps,
          "Visual behavior was not captured.",
          "Runtime behavior was not executed."
        ])
      ]
    }
  }));
  const classified = new Set(changes.flatMap((change) => change.hunkRefs));
  const unclassifiedHunkRefs = diff.hunks.map((hunk) => hunk.id).filter((reference) => !classified.has(reference));
  const reportId = `report-${stableHash({ input, diff, evidenceIndex, plan, annotations }).slice(0, 16)}`;
  return {
    schemaVersion: "1.0",
    reportId,
    status: "UNCOVERED",
    summary: {
      statement: "Code changes were collected and grouped. Visual and runtime behavior remain unverified.",
      filesChanged: diff.summary.filesChanged,
      additions: diff.summary.additions,
      deletions: diff.summary.deletions
    },
    files: diff.files.map((file) => ({
      id: file.id,
      status: file.status,
      oldPath: file.oldPath,
      newPath: file.newPath,
      additions: file.additions,
      deletions: file.deletions,
      binary: file.binary,
      submodule: file.submodule,
      oldMode: file.oldMode,
      newMode: file.newMode,
      oldOid: file.oldOid,
      newOid: file.newOid,
      lowSignal: file.lowSignal,
      lowSignalReasons: file.lowSignalReasons,
      hunkRefs: file.hunkRefs
    })),
    hunks: diff.hunks,
    evidence: evidenceIndex.evidence,
    unclassifiedHunkRefs,
    changes,
    targets: [],
    findings: [],
    coverage: {
      knownUsages: null,
      verifiedUsages: 0,
      unknownPossible: true,
      planned: 0,
      succeeded: 0,
      failed: 0
    },
    origin: {
      host: "unknown",
      projectFingerprint: diff.repository.fingerprint,
      reportId,
      bindingMode: "unbound",
      createdAt: (/* @__PURE__ */ new Date(0)).toISOString()
    },
    diagnostics: {
      incompleteReasons: ["visual-capture-not-run", "runtime-not-executed"],
      blockedRequestCount: 0
    }
  };
}
async function createInitialReport(runDirectory, annotationsValue = null) {
  const input = await readOptionalJson(path9.join(runDirectory, "input.json"));
  const diffValue = await readOptionalJson(path9.join(runDirectory, "diff.json"));
  if (annotationsValue !== null) assertArtifact("annotations", annotationsValue);
  const annotations = annotationsValue;
  if (diffValue !== null) {
    assertArtifact("diff", diffValue);
    const diff = diffValue;
    assertReferenceResult("DIFF_REFERENCE_INVALID", validateDiffReferences(diff));
    const evidenceValue = await readOptionalJson(path9.join(runDirectory, "evidence-index.json"));
    const planValue = await readOptionalJson(path9.join(runDirectory, "review-plan.json"));
    if (evidenceValue === null || planValue === null) {
      throw new UtsuriError(
        "COLLECT_ARTIFACT_MISSING",
        "A collected diff requires evidence-index.json and review-plan.json",
        ExitCode.Artifact
      );
    }
    assertArtifact("evidence-index", evidenceValue);
    assertArtifact("review-plan", planValue);
    const evidenceIndex = evidenceValue;
    const plan = planValue;
    assertReferenceResult(
      "REVIEW_PLAN_INVALID",
      validateReviewPlanReferences(plan, diff, evidenceIndex)
    );
    const report = createCodeOnlyReport(input, diff, evidenceIndex, plan, annotations);
    assertReferenceResult("REPORT_REFERENCE_INVALID", validateReportReferences(report));
    return report;
  }
  if (annotations?.changes.length) {
    throw new UtsuriError(
      "ANNOTATIONS_REQUIRE_DIFF",
      "Non-empty annotations require a collected diff",
      ExitCode.Artifact
    );
  }
  const reportId = `report-${stableHash({ input }).slice(0, 16)}`;
  return {
    schemaVersion: "1.0",
    reportId,
    status: "SKIPPED",
    summary: {
      statement: "No code diff was supplied; visual verification was skipped.",
      filesChanged: 0,
      additions: 0,
      deletions: 0
    },
    files: [],
    hunks: [],
    evidence: [],
    unclassifiedHunkRefs: [],
    changes: [],
    targets: [],
    findings: [],
    coverage: {
      knownUsages: null,
      verifiedUsages: 0,
      unknownPossible: true,
      planned: 0,
      succeeded: 0,
      failed: 0
    },
    origin: {
      host: "unknown",
      projectFingerprint: stableHash({ cwd: path9.basename(runDirectory), input }).slice(0, 16),
      reportId,
      bindingMode: "unbound",
      createdAt: (/* @__PURE__ */ new Date(0)).toISOString()
    },
    diagnostics: {
      incompleteReasons: ["no-input"],
      blockedRequestCount: 0
    }
  };
}
async function listFiles(directory, prefix = "") {
  const result2 = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name)
  )) {
    const relative = path9.posix.join(prefix, entry.name);
    const absolute = path9.join(directory, entry.name);
    const entryStat = await lstat3(absolute);
    if (entryStat.isSymbolicLink()) {
      throw new UtsuriError(
        "REPORT_SYMLINK",
        `Report contains a symbolic link: ${relative}`,
        ExitCode.Security
      );
    }
    if (entryStat.isDirectory()) result2.push(...await listFiles(absolute, relative));
    else if (entryStat.isFile()) result2.push(relative);
    else {
      throw new UtsuriError(
        "REPORT_SPECIAL_FILE",
        `Report contains a non-regular file: ${relative}`,
        ExitCode.Security
      );
    }
  }
  return result2;
}
async function writeJson(filename, value) {
  await writeFile2(filename, `${JSON.stringify(value, null, 2)}
`, { flag: "wx" });
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(value, expected) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}
function validateManifest(value) {
  const errors = [];
  if (!isRecord(value)) return { manifest: null, errors: ["manifest.json must be an object"] };
  if (!hasExactKeys(value, [
    "schemaVersion",
    "reportId",
    "toolVersion",
    "generatedAt",
    "semanticHash",
    "assetHashes",
    "privacy",
    "incompleteReasons"
  ])) {
    errors.push("manifest.json has missing or unknown fields");
  }
  if (value.schemaVersion !== "1.0") errors.push("Manifest schemaVersion is invalid");
  if (typeof value.reportId !== "string" || !/^report-[a-f0-9]{16}$/u.test(value.reportId)) {
    errors.push("Manifest reportId is invalid");
  }
  if (typeof value.toolVersion !== "string" || value.toolVersion.length === 0) {
    errors.push("Manifest toolVersion is invalid");
  }
  if (typeof value.generatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
    value.generatedAt
  ) || Number.isNaN(Date.parse(value.generatedAt))) {
    errors.push("Manifest generatedAt is invalid");
  }
  if (typeof value.semanticHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.semanticHash)) {
    errors.push("Manifest semanticHash is invalid");
  }
  if (!isRecord(value.assetHashes)) {
    errors.push("Manifest assetHashes must be an object");
  } else {
    for (const [relative, digest] of Object.entries(value.assetHashes)) {
      if (!relative || relative === "manifest.json" || relative.startsWith("/") || relative.includes("\\") || path9.posix.normalize(relative) !== relative || relative.split("/").includes("..")) {
        errors.push(`Manifest asset path is invalid: ${relative}`);
      }
      if (typeof digest !== "string" || !/^[a-f0-9]{64}$/u.test(digest)) {
        errors.push(`Manifest asset hash is invalid: ${relative}`);
      }
    }
  }
  if (!isRecord(value.privacy) || !hasExactKeys(value.privacy, [
    "includesAbsolutePaths",
    "includesRawEnvironment",
    "includesRawDom"
  ]) || value.privacy.includesAbsolutePaths !== false || value.privacy.includesRawEnvironment !== false || value.privacy.includesRawDom !== false) {
    errors.push("Manifest privacy declaration is invalid");
  }
  if (!Array.isArray(value.incompleteReasons) || value.incompleteReasons.some((reason) => typeof reason !== "string")) {
    errors.push("Manifest incompleteReasons is invalid");
  }
  return {
    manifest: errors.length === 0 ? value : null,
    errors
  };
}
async function optionalLstat(filename) {
  return lstat3(filename).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}
async function assertProtectedPublicationPath(runDirectory, runIdentity) {
  if (typeof process.getuid !== "function") {
    throw new UtsuriError(
      "REPORT_PUBLICATION_PLATFORM_UNSUPPORTED",
      "Secure report publication requires POSIX user ownership",
      ExitCode.Environment
    );
  }
  const currentUid = BigInt(process.getuid());
  const paths = [];
  for (let current = runDirectory; ; current = path9.dirname(current)) {
    paths.push(current);
    if (current === path9.dirname(current)) break;
  }
  let childIdentity;
  for (const [index, current] of paths.entries()) {
    const identity = index === 0 ? runIdentity : await lstat3(current, { bigint: true });
    if (!identity.isDirectory() || identity.isSymbolicLink()) {
      throw new UtsuriError(
        "REPORT_PUBLICATION_PATH_INVALID",
        "Every report publication ancestor must be a real directory",
        ExitCode.Security
      );
    }
    if (identity.uid !== currentUid && identity.uid !== 0n) {
      throw new UtsuriError(
        "REPORT_PUBLICATION_ANCESTOR_OWNER",
        "The report publication path has an ancestor controlled by another user",
        ExitCode.Security
      );
    }
    const sharedWritable = (identity.mode & 0o022n) !== 0n;
    if (index === 0 && sharedWritable) {
      throw new UtsuriError(
        "REPORT_RUN_DIRECTORY_PERMISSIONS",
        "The run directory must not be writable by group or other users",
        ExitCode.Security
      );
    }
    if (index > 0 && sharedWritable) {
      const sticky = (identity.mode & 0o1000n) !== 0n;
      if (!sticky || childIdentity?.uid !== currentUid) {
        throw new UtsuriError(
          "REPORT_PUBLICATION_ANCESTOR_PERMISSIONS",
          "The report publication path has an ancestor that another user can rename",
          ExitCode.Security
        );
      }
    }
    childIdentity = identity;
  }
}
function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}
async function assertDirectoryIdentity(directory, expected, label) {
  const current = await lstat3(directory, { bigint: true }).catch(() => null);
  if (!current?.isDirectory() || !sameIdentity(current, expected)) {
    throw new UtsuriError(
      "REPORT_PUBLICATION_PATH_CHANGED",
      `${label} directory identity changed during publication`,
      ExitCode.Security
    );
  }
}
async function readJsonForValidation(filename, label, errors) {
  try {
    return JSON.parse(await readRegularText(filename));
  } catch (error) {
    if (error instanceof UtsuriError) {
      errors.push(error.message);
      return null;
    }
    errors.push(
      error.code === "ENOENT" ? `${label} is missing` : `${label} is not valid JSON`
    );
    return null;
  }
}
async function populateReportDirectory(directory, report, options) {
  await mkdir2(path9.join(directory, "assets"), { recursive: true });
  await mkdir2(path9.join(directory, "diagnostics"), { recursive: true });
  await writeFile2(path9.join(directory, "index.html"), indexHtml(report), { flag: "wx" });
  await writeJson(path9.join(directory, "report.json"), report);
  await writeFile2(path9.join(directory, "assets/app.js"), reportUiJavaScript, { flag: "wx" });
  await writeFile2(path9.join(directory, "assets/app.css"), reportUiCss, { flag: "wx" });
  await writeFile2(path9.join(directory, "assets/icons.svg"), statusIconSvg, { flag: "wx" });
  await writeJson(path9.join(directory, "diagnostics/summary.json"), report.diagnostics);
  for (const schemaFile of reportSchemaFiles) {
    await writeFile2(path9.join(directory, schemaFile), reportSchemaAssets[schemaFile], {
      flag: "wx"
    });
  }
  const assetHashes = {};
  for (const relative of await listFiles(directory)) {
    assetHashes[relative] = sha2562(await readRegularBytes(path9.join(directory, relative)));
  }
  const manifest = {
    schemaVersion: "1.0",
    reportId: report.reportId,
    toolVersion: options.toolVersion ?? "0.1.0",
    generatedAt: (options.now ?? /* @__PURE__ */ new Date()).toISOString(),
    semanticHash: stableHash({ report, assetHashes }),
    assetHashes,
    privacy: {
      includesAbsolutePaths: false,
      includesRawEnvironment: false,
      includesRawDom: false
    },
    incompleteReasons: report.diagnostics.incompleteReasons
  };
  await writeJson(path9.join(directory, "manifest.json"), manifest);
  return manifest;
}
async function buildReport(runInput, report, options = {}) {
  assertArtifact("report", report);
  const references = validateReportReferences(report);
  if (!references.ok) {
    throw new UtsuriError(
      "REPORT_REFERENCE_INVALID",
      references.errors.join("; "),
      ExitCode.Artifact
    );
  }
  const runDirectory = await realpath4(runInput);
  const runHandle = await open(
    runDirectory,
    constants2.O_RDONLY | constants2.O_DIRECTORY | constants2.O_NOFOLLOW
  );
  try {
    const runIdentity = await runHandle.stat({ bigint: true });
    if (!runIdentity.isDirectory()) {
      throw new UtsuriError(
        "REPORT_RUN_DIRECTORY_INVALID",
        "The run path must remain a directory during publication",
        ExitCode.Security
      );
    }
    await assertProtectedPublicationPath(runDirectory, runIdentity);
    await assertDirectoryIdentity(runDirectory, runIdentity, "Run");
    const reportDirectory = path9.join(runDirectory, "report");
    const existingStat = await optionalLstat(reportDirectory);
    if (existingStat) {
      if (existingStat.isSymbolicLink()) {
        throw new UtsuriError(
          "REPORT_SYMLINK",
          "The immutable report destination must not be a symbolic link",
          ExitCode.Security
        );
      }
      if (!existingStat.isDirectory()) {
        throw new UtsuriError(
          "REPORT_IMMUTABLE",
          "The immutable report destination already exists and is not a directory",
          ExitCode.Artifact
        );
      }
      await listFiles(reportDirectory);
      const existing = await readOptionalJson(path9.join(reportDirectory, "report.json"));
      if (existing && canonicalJson(existing) === canonicalJson(report)) {
        const validation2 = await validateReportDirectory(reportDirectory, { strict: true });
        if (!validation2.ok) {
          throw new UtsuriError(
            "REPORT_REUSE_INVALID",
            `Existing report failed strict validation: ${validation2.errors.join("; ")}`,
            ExitCode.Artifact
          );
        }
        const manifestResult = validateManifest(
          await readOptionalJson(path9.join(reportDirectory, "manifest.json"))
        );
        if (manifestResult.manifest) {
          await assertDirectoryIdentity(runDirectory, runIdentity, "Run");
          return { reportDirectory, manifest: manifestResult.manifest, reused: true };
        }
      }
      throw new UtsuriError(
        "REPORT_IMMUTABLE",
        "An immutable report destination already exists with different or incomplete content",
        ExitCode.Artifact
      );
    }
    const stagingName = `.report-${randomUUID()}.tmp`;
    const stagingDirectory = path9.join(runDirectory, stagingName);
    await mkdir2(stagingDirectory, { recursive: false, mode: 448 });
    const stagingIdentity = await lstat3(stagingDirectory, { bigint: true });
    const manifest = await populateReportDirectory(stagingDirectory, report, options);
    const validation = await validateReportDirectory(stagingDirectory, { strict: true });
    if (!validation.ok) {
      throw new UtsuriError(
        "REPORT_BUILD_INVALID",
        validation.errors.join("; "),
        ExitCode.Artifact
      );
    }
    await assertDirectoryIdentity(runDirectory, runIdentity, "Run");
    await assertDirectoryIdentity(stagingDirectory, stagingIdentity, "Staging");
    await publishDirectoryNoReplace(runHandle, runIdentity, stagingName, "report", stagingIdentity);
    await assertDirectoryIdentity(runDirectory, runIdentity, "Run");
    await assertDirectoryIdentity(reportDirectory, stagingIdentity, "Published report");
    return { reportDirectory, manifest, reused: false };
  } finally {
    await runHandle.close();
  }
}
function validateHtml(html) {
  const errors = [];
  if (!html.includes(`Content-Security-Policy" content="${reportCsp}`))
    errors.push("CSP is missing or changed");
  if (/<script(?![^>]*\bsrc=)[^>]*>/iu.test(html)) errors.push("Inline script is forbidden");
  if (/\son[a-z]+\s*=/iu.test(html)) errors.push("Inline event handlers are forbidden");
  if (/javascript:|data:text\/html/iu.test(html)) errors.push("Active URL scheme is forbidden");
  if (/(?:src|href)=["']https?:\/\//iu.test(html)) errors.push("External URL is forbidden");
  const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/gu)].map((match) => match[1]));
  for (const match of html.matchAll(/\bhref=["']#([^"']+)["']/gu)) {
    if (!ids.has(match[1])) errors.push(`Broken anchor: #${match[1]}`);
  }
  return errors;
}
async function validateReportDirectory(input, options = {}) {
  const errors = [];
  let directory;
  try {
    const inputStat = await lstat3(input);
    if (inputStat.isSymbolicLink()) {
      return { ok: false, errors: ["Report directory must not be a symbolic link"] };
    }
    if (!inputStat.isDirectory()) {
      return { ok: false, errors: ["Report path must be a directory"] };
    }
    directory = await realpath4(input);
  } catch {
    return { ok: false, errors: ["Report directory is missing or inaccessible"] };
  }
  let files;
  try {
    files = await listFiles(directory);
    for (const relative of files) {
      await resolveContainedPath(directory, relative);
    }
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
  const manifestRaw = await readJsonForValidation(
    path9.join(directory, "manifest.json"),
    "manifest.json",
    errors
  );
  const reportRaw = await readJsonForValidation(
    path9.join(directory, "report.json"),
    "report.json",
    errors
  );
  const manifestValidation = validateManifest(manifestRaw);
  errors.push(...manifestValidation.errors);
  const manifest = manifestValidation.manifest;
  let report = null;
  if (reportRaw !== null) {
    try {
      assertArtifact("report", reportRaw);
      report = reportRaw;
      errors.push(...validateReportReferences(report).errors);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (manifest) {
    const actualAssets = files.filter((relative) => relative !== "manifest.json").sort();
    const declaredAssets = Object.keys(manifest.assetHashes).sort();
    if (JSON.stringify(actualAssets) !== JSON.stringify(declaredAssets)) {
      for (const relative of actualAssets.filter((item) => !declaredAssets.includes(item))) {
        errors.push(`Unregistered asset: ${relative}`);
      }
      for (const relative of declaredAssets.filter((item) => !actualAssets.includes(item))) {
        errors.push(`Missing declared asset: ${relative}`);
      }
    }
    for (const [relative, expected] of Object.entries(manifest.assetHashes)) {
      try {
        const file = await resolveContainedPath(directory, relative);
        const actual = sha2562(await readRegularBytes(file));
        if (actual !== expected) errors.push(`Hash mismatch: ${relative}`);
      } catch {
        errors.push(`Missing asset: ${relative}`);
      }
    }
    if (report) {
      if (manifest.reportId !== report.reportId) errors.push("Manifest reportId mismatch");
      if (manifest.semanticHash !== stableHash({ report, assetHashes: manifest.assetHashes })) {
        errors.push("Manifest semanticHash mismatch");
      }
      if (canonicalJson(manifest.incompleteReasons) !== canonicalJson(report.diagnostics.incompleteReasons)) {
        errors.push("Manifest incompleteReasons mismatch");
      }
    }
  }
  try {
    errors.push(...validateHtml(await readRegularText(path9.join(directory, "index.html"))));
  } catch {
    errors.push("index.html is missing");
  }
  if (options.strict) {
    const actualAssets = files.filter((relative) => relative !== "manifest.json").sort();
    const expectedAssets = [...reportArtifactPaths].sort();
    if (JSON.stringify(actualAssets) !== JSON.stringify(expectedAssets)) {
      errors.push("Strict report artifact inventory mismatch");
    }
    for (const [relative, expected] of [
      ["index.html", report ? indexHtml(report) : null],
      ["assets/app.js", reportUiJavaScript],
      ["assets/app.css", reportUiCss],
      ["assets/icons.svg", statusIconSvg],
      ...reportSchemaFiles.map((filename) => [filename, reportSchemaAssets[filename]])
    ]) {
      if (expected === null) continue;
      try {
        if (await readRegularText(path9.join(directory, relative)) !== expected) {
          errors.push(`Bundled asset mismatch: ${relative}`);
        }
      } catch {
        errors.push(`Bundled asset is missing: ${relative}`);
      }
    }
    if (reportUiJavaScript.length === 0) errors.push("Report UI build asset is empty");
    if (report) {
      try {
        const diagnostics = JSON.parse(
          await readRegularText(path9.join(directory, "diagnostics/summary.json"))
        );
        if (canonicalJson(diagnostics) !== canonicalJson(report.diagnostics)) {
          errors.push("Diagnostic summary does not match report.json");
        }
      } catch {
        errors.push("diagnostics/summary.json is invalid");
      }
    }
  }
  return { ok: errors.length === 0, errors, reportId: report?.reportId };
}
async function isWritableDirectory(directory) {
  try {
    let target = path9.resolve(directory);
    for (; ; ) {
      const current = await stat(target).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (current) {
        if (!current.isDirectory()) return false;
        await access2(target, 2);
        return true;
      }
      const parent = path9.dirname(target);
      if (parent === target) return false;
      target = parent;
    }
  } catch {
    return false;
  }
}

// packages/cli/src/arguments.ts
var valueOptions = /* @__PURE__ */ new Set([
  "--annotations",
  "--batch",
  "--base",
  "--config",
  "--format",
  "--head",
  "--input",
  "--merge-base",
  "--output",
  "--patch",
  "--run",
  "--status"
]);
var booleanOptions = /* @__PURE__ */ new Set([
  "--help",
  "--interactive",
  "--json",
  "--open",
  "--strict",
  "--version",
  "--worktree"
]);
function parseArguments(argv) {
  const options = /* @__PURE__ */ new Map();
  const positionals = [];
  let command = null;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value) continue;
    if (value.startsWith("--")) {
      const separator = value.indexOf("=");
      const name = separator === -1 ? value : value.slice(0, separator);
      const inline = separator === -1 ? void 0 : value.slice(separator + 1);
      if (options.has(name)) {
        throw new UtsuriError(
          "CLI_DUPLICATE_OPTION",
          `${name} may be provided only once`,
          ExitCode.Arguments
        );
      }
      if (booleanOptions.has(name)) {
        if (inline !== void 0)
          throw new UtsuriError(
            "CLI_BOOLEAN_VALUE",
            `${name} does not accept a value`,
            ExitCode.Arguments
          );
        options.set(name, true);
      } else if (valueOptions.has(name)) {
        const next = inline ?? argv[index + 1];
        if (!next || inline === void 0 && next.startsWith("--")) {
          throw new UtsuriError(
            "CLI_MISSING_VALUE",
            `${name} requires a value`,
            ExitCode.Arguments
          );
        }
        options.set(name, next);
        if (inline === void 0) index += 1;
      } else {
        throw new UtsuriError("CLI_UNKNOWN_OPTION", `Unknown option: ${name}`, ExitCode.Arguments);
      }
    } else if (!command) command = value;
    else positionals.push(value);
  }
  return { command, positionals, options, json: options.has("--json") };
}
function optionString(arguments_, name) {
  const value = arguments_.options.get(name);
  return typeof value === "string" ? value : void 0;
}

// packages/cli/src/doctor.ts
var import_yaml = __toESM(require_dist2(), 1);
import { access as access3, readFile as readFile2 } from "node:fs/promises";
import { constants as constants3 } from "node:fs";
import { spawnSync } from "node:child_process";
import path10 from "node:path";
import { platform } from "node:os";
function run(command, args) {
  const result2 = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return result2.status === 0 ? result2.stdout.trim() : null;
}
async function isExecutable(filename) {
  try {
    await access3(filename, constants3.X_OK);
    return true;
  } catch {
    return false;
  }
}
async function browserCheck() {
  if (process.env.UTSURI_BROWSER_EXECUTABLE && await isExecutable(process.env.UTSURI_BROWSER_EXECUTABLE)) {
    return { id: "browser", status: "pass", detail: "explicit executable" };
  }
  if (platform() === "darwin") {
    for (const [name, executable] of [
      ["Google Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
      ["Chromium", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    ]) {
      if (await isExecutable(executable)) return { id: "browser", status: "pass", detail: name };
    }
  }
  for (const name of ["chromium", "chromium-browser", "google-chrome"]) {
    if (run("which", [name])) return { id: "browser", status: "pass", detail: name };
  }
  return { id: "browser", status: "optional", detail: "No existing Chrome or Chromium found" };
}
async function configCheck(cwd, configName) {
  const filename = path10.resolve(cwd, configName);
  try {
    const value = (0, import_yaml.parse)(await readFile2(filename, "utf8"));
    const result2 = validateArtifact("config", value);
    return result2.ok ? { id: "config", status: "pass", detail: configName } : { id: "config", status: "invalid", detail: result2.errors.join("; ") };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { id: "config", status: "optional", detail: `${configName} not present` };
    }
    return {
      id: "config",
      status: "invalid",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}
async function doctor(cwd, configName = "utsuri.yml") {
  const gitVersion = run("git", ["--version"]);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const container = run("docker", ["--version"]) ?? run("podman", ["--version"]);
  const gitRoot = run("git", ["rev-parse", "--show-toplevel"]);
  const outputPath = path10.join(cwd, ".artifacts", "utsuri");
  const checks = [
    {
      id: "git",
      status: gitVersion ? "pass" : "missing",
      detail: gitVersion ?? "Git is unavailable"
    },
    {
      id: "node",
      status: nodeMajor >= 22 ? "pass" : "invalid",
      detail: process.versions.node
    },
    await browserCheck(),
    {
      id: "container",
      status: container ? "pass" : "optional",
      detail: container ?? "Docker and Podman are unavailable"
    },
    {
      id: "repository",
      status: gitRoot ? "pass" : "invalid",
      detail: gitRoot ? "Git repository detected" : "Git repository root could not be resolved"
    },
    await configCheck(cwd, configName),
    {
      id: "output",
      status: await isWritableDirectory(outputPath) ? "pass" : "invalid",
      detail: "Artifact parent directory"
    },
    {
      id: "dependencies",
      status: await access3(path10.join(cwd, "node_modules")).then(() => true).catch(() => false) ? "pass" : "optional",
      detail: "Existing dependency directory"
    }
  ];
  return {
    ok: checks.every((check) => check.status !== "missing" && check.status !== "invalid"),
    command: "doctor",
    version: "0.1.0",
    checks
  };
}

// packages/cli/src/cli.ts
async function readArtifactJson(filename, label) {
  const content = await readFile3(filename, "utf8");
  try {
    return JSON.parse(content);
  } catch {
    throw new UtsuriError("ARTIFACT_JSON_INVALID", `${label} is not valid JSON`, ExitCode.Artifact);
  }
}
var help = `Utsuri 0.1.0

Usage: utsuri <command> [options]

Commands:
  doctor                 Inspect prerequisites without changing the environment
  collect                Collect a Git diff into a review run
  finalize --run <path>  Build an immutable report
  validate <report>      Validate report schema, CSP, assets, and hashes

Global options:
  --json                  Emit one strict JSON value
  --help                  Show this help
  --version               Show the version
`;
async function executeCli(argv, cwd = process.cwd()) {
  let json = argv.includes("--json");
  try {
    const args = parseArguments(argv);
    json = args.json;
    if (args.options.has("--version") || args.command === "version") {
      return { exitCode: 0, data: { version: "0.1.0" }, human: "0.1.0", json };
    }
    if (args.options.has("--help") || !args.command || args.command === "help") {
      return { exitCode: 0, data: { help }, human: help, json };
    }
    if (args.command === "doctor") {
      const data = await doctor(cwd, optionString(args, "--config"));
      return {
        exitCode: data.ok ? ExitCode.Success : ExitCode.Environment,
        data,
        human: data.ok ? "Environment checks passed" : "Environment checks failed",
        json
      };
    }
    if (args.command === "collect") {
      const output = optionString(args, "--output");
      if (!output) {
        throw new UtsuriError(
          "CLI_OUTPUT_REQUIRED",
          "collect requires --output",
          ExitCode.Arguments
        );
      }
      const collected = await collectGit({
        cwd,
        output,
        patch: optionString(args, "--patch"),
        worktree: args.options.has("--worktree"),
        base: optionString(args, "--base"),
        head: optionString(args, "--head"),
        mergeBase: optionString(args, "--merge-base")
      });
      const runDirectory = path11.relative(cwd, collected.runDirectory).replaceAll(path11.sep, "/") || ".";
      const data = {
        ok: true,
        command: "collect",
        mode: collected.diff.input.mode,
        runDirectory,
        filesChanged: collected.diff.summary.filesChanged,
        additions: collected.diff.summary.additions,
        deletions: collected.diff.summary.deletions,
        hunks: collected.diff.hunks.length,
        lowSignalFiles: collected.diff.summary.lowSignalFiles
      };
      return { exitCode: 0, data, human: `Collected review input: ${runDirectory}`, json };
    }
    if (args.command === "finalize") {
      const runValue = optionString(args, "--run");
      if (!runValue)
        throw new UtsuriError("CLI_RUN_REQUIRED", "finalize requires --run", ExitCode.Arguments);
      const runDirectory = await resolveContainedPath(cwd, runValue);
      const annotationsValue = optionString(args, "--annotations");
      let annotations = null;
      if (annotationsValue) {
        const filename = await resolveContainedPath(cwd, annotationsValue);
        annotations = await readArtifactJson(filename, "annotations");
        assertArtifact("annotations", annotations);
      }
      const report = await createInitialReport(runDirectory, annotations);
      const built = await buildReport(runDirectory, report, { toolVersion: "0.1.0" });
      const relative = path11.relative(cwd, built.reportDirectory).replaceAll(path11.sep, "/");
      const data = {
        ok: true,
        command: "finalize",
        reportId: built.manifest.reportId,
        reportDirectory: relative,
        reused: built.reused
      };
      return { exitCode: 0, data, human: `Report ready: ${relative}`, json };
    }
    if (args.command === "validate") {
      const reportValue = args.positionals[0];
      if (!reportValue)
        throw new UtsuriError(
          "CLI_REPORT_REQUIRED",
          "validate requires a report path",
          ExitCode.Arguments
        );
      const reportDirectory = await resolveContainedPath(cwd, reportValue);
      const result2 = await validateReportDirectory(reportDirectory, {
        strict: args.options.has("--strict")
      });
      return {
        exitCode: result2.ok ? 0 : ExitCode.Artifact,
        data: { command: "validate", ...result2 },
        human: result2.ok ? `Report valid: ${result2.reportId}` : result2.errors.join("\n"),
        json
      };
    }
    throw new UtsuriError(
      "CLI_UNKNOWN_COMMAND",
      `Unknown command: ${args.command}`,
      ExitCode.Arguments
    );
  } catch (error) {
    const normalized = toUtsuriError(error);
    return {
      exitCode: normalized.exitCode,
      data: {
        ok: false,
        error: {
          id: normalized.diagnosticId,
          message: normalized.message,
          exitCode: normalized.exitCode
        }
      },
      human: `${normalized.diagnosticId}: ${normalized.message}`,
      json
    };
  }
}

// packages/cli/src/main.ts
var result = await executeCli(process.argv.slice(2));
if (result.json) process.stdout.write(`${JSON.stringify(result.data)}
`);
else process.stdout.write(result.human.endsWith("\n") ? result.human : `${result.human}
`);
process.exitCode = result.exitCode;
