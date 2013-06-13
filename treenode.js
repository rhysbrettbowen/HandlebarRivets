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

Node.prototype.containsType = function(type) {
	if (this instanceof type)
		return true;
	return this.children.reduce(function(memo, child) {
		return memo || child.containsType(type);
	}, false);
};

exports = Node;