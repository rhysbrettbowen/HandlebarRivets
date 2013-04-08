var ind = 0;
var names = ['John', 'Fred', 'Paul', 'Jagger', 'George', 'Bob', 'Ringo'];
var beatle = [true, false, true, false, true, false, true];
var inBand = [true, false, true, true, true, false, true];
var band = ['Beatles', undefined, 'Beatles', 'Rolling Stones', 'Beatles', undefined, 'Beatles'];

var model = new Backbone.Model({
	name: 'fred',
	beatle: false,
	names: names
});

var view = new Backbone.View({
	model: model
});

view.$el.append(getTemplate());

view.$el.appendTo(document.body);

rivets.configure({
  adapter: {
    subscribe: function(obj, keypath, callback) {
	  if (!obj.on)
		return;
      obj.on('change:' + keypath, callback)
    },
    unsubscribe: function(obj, keypath, callback) {
    	if (!obj.off)
		return;
      obj.off('change:' + keypath, callback)
    },
    read: function(obj, keypath) {
    if (!obj.get)
    	return obj;
      return obj.get(keypath)
    },
    publish: function(obj, keypath, value) {
    	if (!obj.set)
    		return obj;
      obj.set(keypath, value)
    }
  }
});

rivets.bind(view.$el, {model: model});

setInterval(function() {
	model.set({
		name: names[(++ind) % names.length],
		beatle: beatle[(ind) % beatle.length],
		inBand: inBand[(ind) % inBand.length],
		band: band[(ind) % band.length]
	});
}, 2000);