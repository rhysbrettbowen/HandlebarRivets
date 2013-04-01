var fs = require('fs');
var util = require('util');

process.argv.forEach(function(val, index) {
	if (index < 2)
		return;
	console.log(val);
});

var tokens = ['{{#', '{{/', '{{', '}}', '</', '<', '/>', '>', '\'', '"', '=', /\s+/];

var selfClose = [
	'hr',
	'img',
	'input',
	'br'
]

var parseHtml = function(str) {
	var head = buildTree(str);
	cleanTree(head);
	transformBindings(head);
	return head.print();
};

var getNextToken = function(str) {
	var ind = Infinity;
	var tok = null;
	tokens.forEach(function(token) {
		var tokenIndex = token instanceof RegExp ?
			str.search(token) :
			str.indexOf(token);
		if (tokenIndex > -1 && tokenIndex < ind) {
			tok = token instanceof RegExp ?
				str.match(token)[0] :
				token;
			ind = tokenIndex;
		}
	});
	return ind ? str.substring(0, ind) : tok;
};

var buildTree = function(str) {
	var head = new FragmentNode();
	var node = head;
	while(str.length) {
		var token = getNextToken(str);
		str = str.substring(token.length);
		node = node.handleToken(token);
	};
	return head;
};

var depthFirst = function(node, fn) {
	if (node)
		fn(node);
	if (node.attrs)
		node.attrs.forEach(function(child) {
			depthFirst(child, fn);
		});
	node.children.forEach(function(child) {
		depthFirst(child, fn);
	});
};

var cleanTree = function(head) {
	depthFirst(head, mergeTextChildren);
	depthFirst(head, removeBlankTextChildren);
	return head;
};

var transformBindings = function(head) {
	depthFirst(head, putTemplatesInEls);
	depthFirst(head, addBindForOnlyTempate);
};

var removeBlankTextChildren = function(node) {
	node.children = node.children.filter(function(child) {
		if (!(child instanceof TextNode)) return true;
		return !!child.val.replace(/^\s+|\s+$/g, '').length;
	});
};

var mergeTextChildren = function(node) {
	var child = node.firstChild();
	while (child) {
		if (child instanceof TextNode && child.nextSibling() instanceof TextNode) {
			child.val += child.nextSibling().val;
			child.nextSibling().remove();
		} else
			child = child.nextSibling();
	}
};

var putTemplatesInEls = function(node) {
	if (node instanceof TemplateNode &&
			!node.isIn(AttributeNode) &&
			(node.prevSibling() instanceof TextNode ||
				node.nextSibling() instanceof TextNode)) {
		var el = new ElementNode();
		el.setVal('span');
		node.parent.children.splice(node.parent.children.indexOf(node), 1, el);
		el.addChild(node);
		el.addChild(new EndElementNode(el));
	}
};

var addBindForOnlyTempate = function(node) {
	if (node instanceof ElementNode &&
			((node.children.length == 1 && node.selfClose) ||
				(node.children.length == 2 && !node.selfClose)) &&
			node.children[0] instanceof TemplateNode) {
		var attr = new AttributeNode('data-text');
		var qs = new QuotedNode("'")
		qs.addChild(node.children[0].children[0]);
		attr.addChild(qs);
		node.attrs.push(attr);
		node.children[0].remove();
	}

	if (node instanceof QuotedNode &&
			node.children.length == 1 &&
			node.children[0] instanceof TemplateNode) {
		var el = node.parent.parent;
		var attr = new AttributeNode('data-attr-' + node.parent.val);
		el.attrs.splice(el.attrs.indexOf[
			node.parent
		], 1);
		var text = new TextNode(node.children[0].children[0].val);
		node.children[0].remove();
		node.addChild(text);
		attr.addChild(node);
		el.attrs.push(attr);
	}
};

var Node = function() {
	this.val = '';
	this.parent = null;
	this.children = [];
};

Node.prototype.setVal = function(val) {
	this.val = val;
};

Node.prototype.handleToken = function(tok) {
	throw new Error('should not call');
};

Node.prototype.addChild = function(child) {
	if (this.children.indexOf(child) < 0)
		this.children.push(child);
	child.parent = this;
};

Node.prototype.toString = function() {
	console.log(this.val + '\n');
};

Node.prototype.getParent = function() {
	return this.parent;
};

Node.prototype.nextSibling = function() {
	if (!this.parent)
		return;
	return this.parent.children[this.parent.children.indexOf(this) + 1];
};

Node.prototype.prevSibling = function() {
	if (!this.parent)
		return;
	return this.parent.children[this.parent.children.indexOf(this) - 1];
};

Node.prototype.firstChild = function() {
	return this.children[0];
};

Node.prototype.remove = function() {
	if (!this.parent)
		return;
	this.parent.children.splice(this.parent.children.indexOf(this), 1);
};

Node.prototype.print = function() {
	return this.children.reduce(function(memo, child) {
		return memo + child.print();
	}, '');
};

Node.prototype.isIn = function(type) {
	var node = this;
	while (node.parent && !(node.parent instanceof type))
		node = node.parent;
	return node.parent instanceof type;
};

/**
 * Top level fragment node
 * looks for start of element or adds as text
 */
var FragmentNode = function() {
	Node.call(this);
};
util.inherits(FragmentNode, Node);

FragmentNode.prototype.handleToken = function(tok) {
	var node = this;
	if (tok == '</') {
		node = new EndElementNode(this);
		this.addChild(node);
	} else if (tok == '<') {
		node = new ElementNode();
		this.addChild(node);
	} else if (tok == '{{') {
		node = new TemplateNode();
		this.addChild(node);
	} else {
		this.addChild(new TextNode(tok));
	}
	return node;
};

/**
 * text node
 * simple node that holds the value passed
 */
var TextNode = function(val) {
	Node.call(this);
	this.val = val || ''
};
util.inherits(TextNode, Node);

TextNode.prototype.handleToken = function(tok) {
	throw Error('should not run on text node');
};

TextNode.prototype.print = function() {
	return this.val;
};

/**
 * template node for mustache nodes
 */
var TemplateNode = function() {
	Node.call(this);
};
util.inherits(TemplateNode, Node);

TemplateNode.prototype.handleToken = function(tok) {
	var node = this;
	if (tok == '}}') {
		node = this.parent;
	} else {
		this.addChild(new TextNode(tok));
	}
	return node;
};

TemplateNode.prototype.print = function() {
	return '{T}' + Node.prototype.print.call(this) + '{/T}';
};

/**
 * Node that is an element, holds attributes and children.
 */
var ElementNode = function(val) {
	FragmentNode.call(this);
	this.selfClose = false;
	this.attrs = [];
	this.inEl = true;
	if (val)
		this.setVal();
};
util.inherits(ElementNode, FragmentNode);

ElementNode.prototype.setVal = function(val) {
	if (selfClose.indexOf(val) > -1)
		this.selfClose = true;
	this.val = val;
	this.inEl = true;
};

ElementNode.prototype.handleToken = function(tok) {
	var node = this;
	if (!this.val) {
		if (tok)
			this.setVal(tok);
		return this;
	}
	if (tok == '/>' || tok == '>' && this.selfClose) {
		return this.parent;
	} else if (tok == '>') {
		this.inEl = false;
		return node;
	}
	if (!this.inEl)
		return FragmentNode.prototype.handleToken.call(this, tok);
	if (!tok.match(/\s+/)) {
		node = new AttributeNode(tok);
		this.attrs.push(node)
		node.parent = this;
	}
	return node;
};

ElementNode.prototype.print = function() {
	return '<' + this.val + this.attrs.reduce(function(memo, child) {
		return memo + child.print();
	}, ' ') + (this.selfClose ? '/>' : '>') +
	this.children.reduce(function(memo, child) {
		return memo + child.print();
	}, '');
};

/**
 * a node that marks the end of the element
 */
var EndElementNode = function(parent) {
	Node.call(this);
	this.parent = parent;
	this.val = parent.val;
};
util.inherits(EndElementNode, Node);

EndElementNode.prototype.handleToken = function(tok) {
	if (tok == '>')
		return this.parent.parent;
	//this.val += tok;
	return this;
};

EndElementNode.prototype.print = function() {
	return '</ ' + this.val + '>';
};

/**
 * an attribute node
 */
var AttributeNode = function(val) {
	Node.call(this);
	this.val = val;
};
util.inherits(AttributeNode, Node);

AttributeNode.prototype.handleToken = function(tok) {
	var node = this;
	if (tok == '\'' || tok == '"') {
		node = new QuotedNode(tok);
		this.addChild(node);
	} if (tok == ' ') {
		node = this.parent;
	} if (tok == '>' || tok == '/>') {
		return this.parent.handleToken(tok)
	}
	return node;
};

AttributeNode.prototype.print = function() {
	return this.val + (this.children.length ? '=' : '') +
		this.children.reduce(function(memo, child) {
			return memo + child.print();
		}, '') + ' ';
};

var QuotedNode = function(val) {
	this.quote = val;
	Node.call(this);
}
util.inherits(QuotedNode, Node);

QuotedNode.prototype.handleToken = function(tok) {
	var node = this;
	if (tok == this.quote && this.val.charAt(this.val.length - 1) != '\\') {
		node = this.parent;
	} else if (tok == '{{') {
		node = new TemplateNode();
		this.addChild(node);
	} else {
		node = new TextNode(tok);
		this.addChild(node);
	}
	return node;
};

QuotedNode.prototype.print = function() {
	return this.quote +
		this.children.reduce(function(memo, child) {
			return memo + child.print();
		}, '') +
		this.quote;
};

console.log(parseHtml('<div class="{{myClass}}">h<input>i <a disabled>{{there}}</a> <b>text with {{templte}} and such</b></div>'));