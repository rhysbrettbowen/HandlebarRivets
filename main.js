var fs = require('fs');
var util = require('util');


// tokens
var tokens = [/{{\s*else\s*}}/i, '{{{', '}}}', '{{#', '{{/', '{{', '}}', '</', '<', '/>', '>', '\'', '"', '=', /\s+/];

// elements that don't have children
var selfClose = [
	'hr',
	'img',
	'input',
	'br'
];

// save the derived functions
var custom = {};
// to help create derived function names
custFN = 0;

/****************
** CREATE TREE **
****************/

// take the HTML and return a transformed tree
var parseHtml = function(str) {
	str = cleanString(str);
	var head = buildTree(str);
	// console.log('########## first pass tree ##########');
	// printTree(head);
	cleanTree(head);
	// console.log('\n\n########## cleaned tree ##########\n\n');
	// printTree(head);
	// console.log(attrFn(head.children[0].attrs[0]));
	transformBindings(head);
	// console.log('\n\n########## finished tree ##########\n\n');
	// printTree(head);
	return head;
};

var cleanString = function(str) {
	return str.replace(/{{\s+/g, '{{').replace(/\s+}}/g, '}}');
};

// get the next toek in a string
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

// splits the string up in to tokens and changes to a tree
var buildTree = function(str) {
	var head = new FragmentNode();
	var node = head;
	while(str.length) {
		var token = getNextToken(str);
		str = str.substring(token.length);
		var temp = node;
		node = node.handleToken(token);
	};
	return head;
};

// prints a tree
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

// will run a function from the leaves up
var depthFirst = function(node, fn) {
	if (node)
		fn(node);
	if (node.attrs)
		node.attrs.forEach(function(child) {
			depthFirst(child, fn);
		});
  if (!node.children)
    return;
	node.children.forEach(function(child) {
		depthFirst(child, fn);
	});
};

// cleans the tree after initial pass
var cleanTree = function(head) {
	depthFirst(head, mergeTextChildren);
	depthFirst(head, removeBlankTextChildren);
	return head;
};

// remove null nodes
var removeBlankTextChildren = function(node) {
	node.children = node.children.filter(function(child) {
		if (!(child instanceof TextNode)) return true;
		if (!child.val.replace(/\s/g, '').length && child.val.indexOf('\n') > -1)
			return false;
    child.val = child.val.replace(/[\n\r\t]/g, '').replace(/\s+/g, ' ');
		return !!child.val.length;
	});
};

// HTMLerize whitespace
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

// special transforms to handle templates
var transformBindings = function(head) {
  depthFirst(head, putNecessaryEls);
  // depthFirst(head, putEachTemplatesInEls);
	depthFirst(head, addBindForOnlyTempate);
  depthFirst(head, addInIf);
  depthFirst(head, putEachInEls);
  depthFirst(head, handleEach);
  // depthFirst(head, removeElse);
  // depthFirst(head, handleComputedNodes);
};

var putEachTemplatesInEls = function(node) {
	if (!node instanceof TemplateNode) return;
	if (inString(node)) return;
	if (!isInEach(node)) return;
	if (node.parent.children.length <= 1) return;
	putInElement(node, 'span');
};

// puts the each control in a span element
var putEachInEls = function(node) {
	if (node instanceof ControlTemplateNode &&
      !inString(node) &&
      node.val == 'each' &&
      node.containsType(ElementNode) &&
      !(node.parent instanceof ElementNode)) {
		putInElement(node, 'span');
	}
};

// will set the attribute for an each
var handleEach = function(node) {
  if (node instanceof ControlTemplateNode &&
      !inString(node) &&
      node.val == 'each' &&
      node.containsType(ElementNode)) {
  	if ((!(node.parent instanceof ElementNode) ||
  			node.parent.children.length > 1)) {
  		putInElement(node, 'span');
  	}
  	if (node.parent instanceof ElementNode) {
	    node.parent.attrs.push(makeAttritbue('data-each-this', 'm.' + node.test));
	    node.flatten();
	  }
  }
};

// removes an else node
var removeElse = function(node) {
  if (node instanceof ElseNode)
    node.remove();
};

// wraps fragments in spans if needed
var putNecessaryEls = function(node) {

  if (!(node instanceof ElementNode))
    return;
  if (node.children.length <= 1)
  	return;
  if (!node.containsType(ElementNode))
  	return;

  var ind = 0;
  var newChildren = [];
  var oldChildren = node.children.slice(0);

  while(ind < oldChildren.length) {
  	var newEl = new ElementNode();
  	newEl.val = 'span';
  	newEl.parent = node;

	  while(oldChildren[ind] && (oldChildren[ind] instanceof ElementNode ||
		  	oldChildren[ind].containsType(ElementNode))) {
	  	if (!(oldChildren[ind] instanceof ElementNode)) {
	  		newEl.addChild(oldChildren[ind]);
		  	newChildren.push(newEl);
		  	newEl = new ElementNode('span');
		  	newEl.val = 'span';
		  	newEl.parent = node;
	  	} else {
		  	newChildren.push(oldChildren[ind]);
		  }
		  ind++;
	  }

	  while(oldChildren[ind] && !(oldChildren[ind] instanceof ElementNode) && !oldChildren[ind].containsType(ElementNode)) {
	  	newEl.addChild(oldChildren[ind]);
	 		ind++;
	  }
	  newChildren.push(newEl)
	};

	if (!newChildren[newChildren.length - 1].children.length)
		newChildren.pop();

	node.children = newChildren;

};

// handles simple case of a template as the only child of an element
var addBindForOnlyTempate = function(node) {
  if (node instanceof ElementNode &&
      node.children.length == 1 &&
      node.children[0] instanceof TemplateNode) {
  	if (node.children[0].children[0].val != "this" && !isInEach(node))
	  	node.children[0].children[0].val = 'm.' + node.children[0].children[0].val;
    else if (node.children[0].children[0].val != "this" && isInEach(node))
    	node.children[0].children[0].val = 'this.' + node.children[0].children[0].val;
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
    var text = new TextNode('m.' + getKeypath(node) + node.children[0].children[0].val);
    node.children[0].remove();
    node.addChild(text);
    attr.addChild(node);
    el.attrs.push(attr);
  }
};

// handles the IF
var addInIf = function(node) {
  var head = node;
  for (var i = 0; i < head.children.length; i++) {
    node = head.children[i];
    if (node instanceof ControlTemplateNode && node.val == 'if' && node.containsType(ElementNode)) {
      if (!inString(node)) {
        node.children.forEach(function(child) {
          if(child instanceof TextNode)
            putInElement(child, 'span');
          if (child instanceof ControlTemplateNode)
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
        if (head.parent.val == 'class' && node.children.length == 1 &&
            node.children[0] instanceof TextNode) {
          el.attrs.push(makeAttritbue('data-class-' + node.children[0].print(), node.test));
          head.children.splice(head.children.indexOf(node), 1);
        }

      }
    }
  }
};

/**************
** UTILITIES **
**************/

// wheter we're in an each node
var isInEach = function(node) {
	while (node.parent) {
		if (node.parent &&
				node.parent instanceof ControlTemplateNode &&
				node.parent.val == 'each')
			return true;
		if (node.parent.attrs &&
				node.parent.attrs.reduce(function(memo, attr) {
					return memo || attr.val == 'data-each-this';
				}, false))
			return true;
		node = node.parent;
	}
	return false;
};

// the keypath created by each nodes
var getKeypath = function(node) {
	var findeach = function(arr) {
		return arr.reduce(function(memo, attr) {
			return memo || (attr.val == 'data-each-this' ? attr : undefined);
		}, undefined);
	};

	var path = [];
	while (node.parent) {
		if (node.parent &&
				node.parent instanceof ControlTemplateNode &&
				node.parent.val == 'each')
			path.push(node.test);
		if (node.parent.attrs &&
				node.parent.attrs.reduce(function(memo, attr) {
					return memo || attr.val == 'data-each-this';
				}, false))
			path.push(findeach(node.parent.attrs).children[0].children[0].print().replace(/^m\./, ''));
		node = node.parent;
	}
	return path.filter(function(str) {return str != 'this';}).reverse().join('.');
};

// place a node in an element
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
  return el;
};

// whether a node is in a (attribute) string
var inString = function(node) {
	while (node.parent && !(node instanceof QuotedNode))
		node = node.parent
	return node instanceof QuotedNode;
};

// create an attribute node
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

/**********
** NODES **
**********/

// Base node to inherit from
var Node = function Node() {
	this.val = '';
	this.parent = null;
	this.children = [];
};

Node.prototype.setVal = function(val) {
	this.val = val;
};

// nodes handle the next token passed to them
Node.prototype.handleToken = function(tok) {
	throw new Error('should not call');
};

// when adding a child change it's parent
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

Node.prototype.prevSibling = function() {
	if (!this.parent)
		return;
	return this.parent.children[this.parent.children.indexOf(this) - 1];
};

// can remove the node and add it's children to the parent
Node.prototype.flatten = function() {
	this.children.forEach(function(child) {
		this.parent.children.splice(this.parent.children.indexOf(this), 0, child);
		child.parent = this.parent;
	}, this);
	this.remove();
};

Node.prototype.firstChild = function() {
	return this.children[0];
};

// removing a node removes it from it's parent
Node.prototype.remove = function() {
	if (!this.parent)
		return;
	this.parent.children.splice(this.parent.children.indexOf(this), 1);
};

// the HTML output for the node
Node.prototype.print = function() {
	return this.children.reduce(function(memo, child) {
		return memo + child.print();
	}, '');
};

// test it the node is in a certain type
Node.prototype.isIn = function(type) {
	var node = this;
	while (node.parent && !(node.parent instanceof type))
		node = node.parent;
	return node.parent instanceof type;
};

// test if a certain type is in the node
Node.prototype.containsType = function(type) {
	return this.children.reduce(function(memo, child) {
		return memo || child instanceof type || child.containsType(type);
	}, false);
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

/**
 * Ifs and Elses
 */
ControlTemplateNode = function ControlTemplateNode() {
	ElementNode.call(this);
	this.selfClose = false;
	this.skipSpace = false;
};
util.inherits(ControlTemplateNode, Node);

ControlTemplateNode.prototype.setVal = function(val) {
	if (selfClose.indexOf(val) > -1)
		this.selfClose = true;
	this.val = val;
	this.test = '';
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

ControlTemplateNode.prototype.getElseIndex = function() {
	var isElse = function(node) {return node instanceof ElseNode};
	var ind = 0;
	while (ind < this.children.length && !isElse(this.children[ind]))
		ind++;
	return ind;
}

ControlTemplateNode.prototype.getTrueChildren = function() {
	return this.children.slice(0, this.getElseIndex());
};

ControlTemplateNode.prototype.getFalseChildren = function() {
	return this.children.slice(this.getElseIndex() + 1);
};

ControlTemplateNode.prototype.print = function() {
	return '{{#' + this.val + '}}' +
	this.children.reduce(function(memo, child) {
		return memo + child.print();
	}, '') + '{{/' + this.val + '}}';
};

/**
 * a node that marks the end of the if or else
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
	if (this.containsType(TemplateNode) || this.containsType(ControlTemplateNode))
		this.val = 'data-' + this.val;
	return this.val + (this.children.length ? '=' : '') +
		this.children.reduce(function(memo, child) {
			return memo + child.print();
		}, '') + ' ';
};

/**
 * contains a string
 */
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
	if (this.children.length == 1)
		return this.quote +
			this.children.reduce(function(memo, child) {
				return memo + child.print();
			}, '') +
			this.quote;
};

// adds in custom node for elements
var handleComputedNodes = function(node, req) {
  if (!(node instanceof ElementNode))
    return;
  if (node.containsType(ElementNode))
    return;
  if (node.children.length <= 1 &&
    !(node.children[0] instanceof ControlTemplateNode))
    return;
  var req = [];
  var fnInternal = printQS(node, req);
  req = req.reduce(function(memo, req) {
  	if (memo.indexOf(req) == -1)
  		memo.push(req);
  	return memo;
  }, []);
  var fnName = addToCustom(fnInternal, req.map(function(a) {return a.replace(/^this\.?/, '');}));
  node.attrs.push(makeAttritbue('data-html', 'c:' + fnName + ' <' + req.map(function(prop) {return ' ' + (prop.match(/this\.?/) ?  prop: (isInEach(node) ? 'this.' : 'm.') + prop);}).join('')));
  node.children = [];
};

// adds in custom function for attributes
var attrFn = function(node) {
	if (node instanceof ElementNode) {
		node.attrs.forEach(function(node) {
			if (node.children[0].children.length == 1)
				return;
			var fnName = node.parent.val.replace(/-/g, '') + (new Date()).getTime();
			var req = [];
			var str = printQS(node, req);

		  var fnInternal = printQS(node, req);
		  req = req.reduce(function(memo, req) {
		  	if (memo.indexOf(req) == -1)
		  		memo.push(req);
		  	return memo;
		  }, []);
		  var fnName = addToCustom(fnInternal, req.map(function(a) {return a.replace(/^this\.?/, '');}));
		  node.children[0].children = [new TextNode('c:' + fnName + ' <' + req.map(function(prop) {return ' ' + (prop.match(/this\.?/) ?  prop: (isInEach(node) ? 'this.' : 'm.') + prop);}).join(''))];
		  node.val = 'data-attr-' + node.val;
		})
	};
};

var addToCustom = function(fnStr, args) {
	args = args.map(function(arg) {
		if (!arg) return 'that';
		return arg;
	});
	for (var i in custom) {
		if (custom[i] == 'function('+args.join(',')+'){return ' + fnStr + ';}')
			return i;
	}
	var name = 'c' + (custFN++);
	custom[name] = 'function('+args.join(',')+'){return ' + fnStr + ';}';
	return name;
};

// works out hte current path
var resolvePath = function(keypath, val) {
	if (val && keypath)
		val = keypath + '.' + val;
	else if (!val)
		val = keypath;
	val = val.replace(/^this\./, '').replace(/\.this$/, '').replace(/\.this\./, '.');
	return val;
}

// creates custom functions
var printQS = function(node, required, inEach) {
	keypath = getKeypath(node);
	if (node instanceof TextNode) {
		var val = node.val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
		if (!(node.parent instanceof TemplateNode)) {
			val = '"' + val + '"';
		} else {
			if (!inEach){
				if (isInEach(node)) {
					if (node.val == 'this') {
						val = 'that';
						required.push(node.val);
					} else {
						required.push('this.' + node.val);
					}
				} else {
					required.push(keypath + node.val);
				}
			}
		}
		return val;
	}
	if (node instanceof ControlTemplateNode && node.val == 'if') {
		if (!inEach) {
			required.push(node.test);
		}
		return '(' + node.test + '?' +
			node.getTrueChildren().reduce(function(memo, node) {
				return memo.push(printQS(node, required, inEach, keypath)), memo;
			}, ['""']).join('+') + ':' +
			node.getFalseChildren().reduce(function(memo, node) {
				return memo.push(printQS(node, required, inEach, keypath)), memo;
			}, ['""']).join('+') + ')';
	}
	if (node instanceof ControlTemplateNode && node.val == 'each') {
		if (!inEach) {
			required.push(node.test);
		}
		var arr = resolvePath(keypath, node.test);
		return arr + '.map(function(item){return ' +
			node.children.reduce(function(memo, node) {
				return memo.push(printQS(node, required, true, arr)), memo;
			}, ['""']).join("+") +
		';}).join("")';
	}


	return node.children.reduce(function(memo, node) {
		return memo.push(printQS(node, required, inEach)), memo;
	}, []).join("+");
};

// constructs the output
var printFull = function(node) {
	depthFirst(node, attrFn);
	depthFirst(node, handleComputedNodes);
	var str = 'getTemplate = (function(){var c={';
	for (i in custom) {
		str += i + ':' + custom[i] + ',';
	}
	str = str.replace(/,$/, '');
	str += '};n=document.createElement("div"),f=document.createDocumentFragment();n.innerHTML="' +
		node.print().replace(/"/g, '\\"') +
		'";while(n.childNodes.length){f.appendChild(n.childNodes[0]);};' +
		'return function(el,m){r=rivets.config.adapter.read;el.appendChild(f.cloneNode(true));return rivets.bind(el,{m:m,c:c});}})()';
	console.log(str);
}


/**
 * Entry point for program, reads files from command line
 */
process.argv.forEach(function(val, index) {
	if (index < 2)
		return;
	fs.readFile(val, 'utf8', function(err, data) {
		var node = parseHtml(data);
		printFull(node);
	});
});