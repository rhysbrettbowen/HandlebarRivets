var fs = require('fs');
var util = require('util');



var tokens = [/{{\s*else\s*}}/i, '{{{', '}}}', '{{#', '{{/', '{{', '}}', '</', '<', '/>', '>', '\'', '"', '=', /\s+/];

var selfClose = [
	'hr',
	'img',
	'input',
	'br'
];

var parseHtml = function(str) {
	var head = buildTree(str);
	// console.log('########## first pass tree ##########');
	// printTree(head);
	cleanTree(head);
	// console.log('\n\n########## cleaned tree ##########\n\n');
	// printTree(head);
	transformBindings(head);
	// console.log('\n\n########## finished tree ##########\n\n');
	// printTree(head);
	return head;
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

var printTree = function(node, level) {
	level = level || 0;
	var str = '';
	for (var i = 0; i <= level; i++)
		str += '|   ';
	console.log(str.substring(0, str.length - 3) + '---' + node.constructor.name + ': ' + node.val.replace(/[\r\n]/g, ''));
	if (node.test)
		console.log(node.test);
	if (node.attrs)
		for (i = 0; i < node.attrs.length; i++)
			printTree(node.attrs[i], level + 1);
	for (i = 0; i < node.children.length; i++)
		printTree(node.children[i], level + 1);
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
	depthFirst(head, putEachInEls);
	depthFirst(head, handleEach);
	depthFirst(head, addBindForOnlyTempate);
	depthFirst(head, addInIf);
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

var putEachInEls = function(node) {
	if (node instanceof ControlTemplateNode &&
			node.val == 'each' &&
			(node.prevSibling() || node.nextSibling()))
		putInElement(node, 'span');
};

var putTemplatesInEls = function(node) {
	if (node instanceof TemplateNode &&
			!node.isIn(AttributeNode) &&
			(!(node.prevSibling() instanceof ElementNode) ||
				!(node.nextSibling() instanceof ElementNode))) {
		putInElement(node, 'span');
	}
};

var handleEach = function(node) {
	if (node instanceof ControlTemplateNode &&
			!inString(node) &&
			node.val == 'each') {
		node.parent.attrs.push(makeAttritbue('data-each-model', node.test));
		node.flatten();
	}
};

var addBindForOnlyTempate = function(node) {
	if (node instanceof ElementNode &&
			node.children.length == 1 &&
			node.children[0] instanceof TemplateNode) {
		node.attrs.push(makeAttritbue('data-' + (node.children[0].triple ? 'html' : 'text'), node.children[0].children[0]));
		node.children[0].remove();
	}

	if (node instanceof QuotedNode &&
			node.children.length == 1 &&
			node.children[0] instanceof TemplateNode) {
		var el = node.parent.parent;
		var attr = new AttributeNode('data-attr-' + node.parent.val);
		var temp = [];
		for (var i = 0; i < el.attrs.length; i++) {
			if (el.attrs[i] != node.parent)
				temp.push(el.attrs[i]);
		}
		el.attrs = temp;
		var text = new TextNode(node.children[0].children[0].val);
		node.children[0].remove();
		node.addChild(text);
		attr.addChild(node);
		el.attrs.push(attr);
	}
};

var addInIf = function(node) {
	var head = node;
	for (var i = 0; i < head.children.length; i++) {
		node = head.children[i];
		if (node instanceof ControlTemplateNode && node.val == 'if') {
			if (!inString(node)) {
				node.children.forEach(function(child) {
					if(child instanceof TextNode)
						putInElement(child, 'span');
					if (child instanceof ControlTemplateNode &&
							child.val == 'if')
						putInElement(child, 'span');
					if (child instanceof TemplateNode)
						putInElement(child, 'span');
					addBindForOnlyTempate(child.parent);
				});
				var elseFound = null;
				node.children.forEach(function(child) {
					if (child instanceof ElseNode) {
						elseFound = child;
						return;
					}
					var attr = new AttributeNode();
					attr.val = 'data-' + (elseFound ? 'hide' : 'show');
					var q = new QuotedNode("'");
					var test = new TextNode(node.test);
					attr.addChild(q);
					q.addChild(test);
					child.attrs.push(attr);
				});
				if (elseFound)
					elseFound.remove();
				node.flatten();
				i--;
			} else {
				var el = head.parent.parent;
				if (head.parent.val == 'class') {
					el.attrs.push(makeAttritbue('data-class-' + node.children[0].print(), node.test));
					head.children.splice(head.children.indexOf(node), 1);
				}

			}
		}
	}
};

var putInElement = function(node, element, attrs) {
	var el = new ElementNode();
	el.val = element;
	for (i in attrs) {
		var attr = new AttributeNode();
		attr.val = i;
		var q = new QuotedNode("'");
		var text = new TextNode(attrs[i]);
		q.addChild(text);
		attr.addChild(q);
		el.attrs.push(attr);
	};
	node.parent.children.splice(node.parent.children.indexOf(node), 0, el);
	el.parent = node.parent;
	el.addChild(node);
};

var inString = function(node) {
	while (node.parent && !(node instanceof QuotedNode))
		node = node.parent
	return node instanceof QuotedNode;
};

var makeAttritbue = function(name, text) {
	var attr = new AttributeNode();
	attr.val = name;
	var q = new QuotedNode("'");
	if (!(text instanceof TextNode))
		text = new TextNode(text);
	q.addChild(text);
	attr.addChild(q);
	return attr;
};

var Node = function Node() {
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
	if (child.parent)
		child.parent.children.splice(child.parent.children.indexOf(child), 1);
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

Node.prototype.flatten = function() {
	this.children.forEach(function(child) {
		this.parent.children.splice(this.parent.children.indexOf(this), 0, child);
		child.parent = this.parent;
	}, this);
	this.remove();
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
var FragmentNode = function FragmentNode() {
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
	} else if (tok == '{{' || tok=="{{{") {
		node = new TemplateNode();
		this.addChild(node);
	} else if (tok == '{{#') {
		node = new ControlTemplateNode();
		this.addChild(node);
	} else if (tok == '{{/') {
		node = new EndControlTemplateNode(this);
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
var TextNode = function TextNode(val) {
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

var ElseNode = function ElseNode() {
	Node.call(this);
	this.val = 'else'
};
util.inherits(ElseNode, Node);

ElseNode.prototype.handleToken = function(tok) {
	throw Error('should not run on else node');
};

ElseNode.prototype.print = function() {
	return '';
};

/**
 * template node for mustache nodes
 */
var TemplateNode = function TemplateNode(tok) {
	Node.call(this);
	this.addChild(new TextNode('model.'));
};
util.inherits(TemplateNode, Node);

TemplateNode.prototype.handleToken = function(tok) {
	var node = this;
	if (tok == '}}' || tok == '}}}') {
		if (tok == '}}}')
			this.triple = true;
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
var ElementNode = function ElementNode(val) {
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
	}, ' ').replace(/ $/, '') + (this.selfClose ? '/>' : '>') +
	this.children.reduce(function(memo, child) {
		return memo + child.print();
	}, '') + (this.selfClose ? '' : '</' + this.val + '>');
};

/**
 * a node that marks the end of the element
 */
var EndElementNode = function EndElementNode(parent) {
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


ControlTemplateNode = function ControlTemplateNode() {
	ElementNode.call(this);
	this.selfClose = false;
	this.skipSpace = false;
};
util.inherits(ControlTemplateNode, ElementNode);

ControlTemplateNode.prototype.setVal = function(val) {
	if (selfClose.indexOf(val) > -1)
		this.selfClose = true;
	this.val = val;
	this.test = 'model.';
	this.inEl = true;
	if (val == 'else') {
		return this.parent;
	}
	return this;
}

ControlTemplateNode.prototype.handleToken = function(tok) {
	if (tok == '}}') {
		this.inEl = false;
		return this;
	}
	if (this.inEl) {
		if (!this.val) {
			this.skipSpace = true;
			return this.setVal(tok);
		} else if (!this.skipSpace) {
			this.test += tok;
		}
		this.skipSpace = false;
		return this;
	}
	if (tok.match(/{{\s*else\s*}}/i)) {
		this.addChild(new ElseNode());
		return this;
	}
	return FragmentNode.prototype.handleToken.call(this, tok);
};

ControlTemplateNode.prototype.print = function() {
	return '{{#' + this.val + '}}' +
	this.children.reduce(function(memo, child) {
		return memo + child.print();
	}, '') + '{{/' + this.val + '}}';
};

/**
 * a node that marks the end of the element
 */
var EndControlTemplateNode = function EndControlTemplateNode(parent) {
	Node.call(this);
	this.parent = parent;
	this.val = parent.val;
};
util.inherits(EndControlTemplateNode, Node);

EndControlTemplateNode.prototype.handleToken = function(tok) {
	if (tok == '}}')
		return this.parent.parent;
	//this.val += tok;
	return this;
};

EndControlTemplateNode.prototype.print = function() {
	return '{#et} ' + this.val + '{/et}';
};


/**
 * an attribute node
 */
var AttributeNode = function AttributeNode(val) {
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

var QuotedNode = function QuotedNode(val) {
	this.quote = val;
	Node.call(this);
}
util.inherits(QuotedNode, Node);

QuotedNode.prototype.handleToken = function(tok) {
	var node = this;
	if (tok == this.quote && this.val.charAt(this.val.length - 1) != '\\') {
		node = this.parent.parent;
	} else if (tok == '{{' || tok=="{{{") {
		node = new TemplateNode();
		this.addChild(node);
	} else if (tok == '{{#') {
		node = new ControlTemplateNode();
		this.addChild(node);
	} else if (tok == '{{/') {
		node = new EndControlTemplateNode(this);
		this.addChild(node);
	} else {
		this.addChild(new TextNode(tok));
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

process.argv.forEach(function(val, index) {
	if (index < 2)
		return;
	fs.readFile(val, 'utf8', function(err, data) {
		var node = parseHtml(data);
		console.log("function getTemplate() { return '" + node.print().replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "';};");
	});
});