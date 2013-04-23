var ind = 0;
var names = ['John', 'Fred', 'Paul', 'Jagger', 'George', 'Bob', 'Ringo'];
var beatle = [true, false, true, false, true, false, true];
var inBand = [true, false, true, true, true, false, true];
var band = ['Beatles', undefined, 'Beatles', 'Rolling Stones', 'Beatles', undefined, 'Beatles'];
var test = [{a:2,b:1,c:false}, {a:1,b:2,c:true}];

var model = new Backbone.Model({
	name: 'fred',
	beatle: false,
	names: names
});

var view = new Backbone.View({
	model: model
});

rivets.configure({
  adapter: {
    subscribe: function(obj, keypath, callback) {
    if (!obj.on)
    return;
      obj.on('change:' + keypath, callback);
      return obj.get(keypath);
    },
    unsubscribe: function(obj, keypath, callback) {
      if (!obj.off)
    return;
      obj.off('change:' + keypath, callback)
    },
    read: function(obj, keypath) {
      var path = keypath.split('.');
      if (path[path.length - 1] == 'this')
        return obj;
      if (obj.get)
        var val = obj.get(path.shift());
      else
        val = obj;
      while(path.length && keypath)
        val = val[path.shift()];
      return val;
    },
    publish: function(obj, keypath, value) {
      if (!obj.set)
        return obj;
      obj.set(keypath, value)
    }
  }
});

getTemplate(view.el, view.model);

view.$el.appendTo(document.body);



// rivets.bind(view.el, model);

setInterval(function() {
	model.set({
    a:1,
    b:2,
		name: names[(++ind) % names.length],
		beatle: beatle[(ind) % beatle.length],
		inBand: inBand[(ind) % inBand.length],
		band: band[(ind) % band.length],
    test: test
	});
}, 2000);