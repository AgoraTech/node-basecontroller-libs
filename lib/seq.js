/**
 * @fileoverview
 * Run callbacks in sequence passing the next callback to as the first parameter
 * 
 * Every callback is executed in the context of the seq object.
 * The next callback function is passed as the first argument.
 * 
 * @author Michal Czapracki <michal.czapracki@agora.pl>
 * @package Encoder-Controller
 */

var Seq = module.exports = function Seq() {
	this._steps = [];
	this._proxies = [];
	this._data = {};
};

Seq.Seq = Seq;

Seq.get = function(arr, callback, handler) {
	return (new Seq()).concat(arr).get(callback, handler);
};

Seq.run = function(arr, callback, handler) {
	return Seq.get(arr, callback, handler)();
};

Seq.defer = function(next) {
	process.nextTick(next);
};

Seq.delay = function(time) {
	return function(next) {
		setTimeout(next, time);
	};
};

Seq.throwarg = function(argn) {
	return function(next) {
		if (arguments[argn] instanceof Error)
			throw arguments[argn];
		else
			next(this, arguments);
	};
};

Seq.prototype.push = function(func) {
	this._steps.push(func);
	return this;
};

function stepHandler(step, nextstep, stepnum){
	return function() {
		var arg = new Array();
		arg.push(nextstep);
		
		for (var i=0; i<arguments.length; i++) {
			arg.push(arguments[i]);
		}
		try {
			if (step.apply(this, arg) === nextstep) {
				nextstep();
			}
		} catch(e) {
			if (this._handler) {
				this._handler(stepnum, e);
			} else {
				throw e;
			}
		}
	};
};

Seq.prototype.get = function(callback, handler) {
	callback = callback || function(){};
	
	this._handler = handler;
	if (!this._steps || !this._steps.length)
		return callback;
	
	for (var i = this._steps.length - 1; i >= 0; i--)
		this._proxies.unshift(stepHandler(this._steps[i], this._proxies[0] || callback, i).bind(this));
	
	return this._proxies[0];
};

Seq.prototype.concat = function(arr) {
	for (var i = 0; i<arr.length; i++) {
		this.push(arr[i]);
	}
	return this;
};

