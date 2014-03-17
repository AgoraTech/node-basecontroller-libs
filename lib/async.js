/**
 * @fileoverview
 * ASync class allows developer to initiate multiple asynchronous operations and wait for all to finish.
 *  
 */

var seq = 0;

/**
 * ASync class constructor
 */
var ASync = module.exports = function ASync() {
    this._waits = [];
    this._args = [];
};

ASync.ASync = ASync

/**
 * Returns a handler callback function
 * @param {Object} ctx optional context on which the function should be called.
 * @param {Object} fn the function to call.
 * @return {Function}
 */
ASync.prototype.getHandler = function(ctx, fn) {
    if (this.callback)
        throw new Error('Syncronization task added while waiting!');

    if (typeof ctx == 'function' && !fn)
    {
        fn = ctx;
        ctx = null;
    }

    var ref = this,
        id = seq++,
        func = function() {
            try {
				if (fn) fn.apply(ctx, arguments);
			} catch(e) {
				ref.cancel(fn, e);
			}
            ref._waits.splice(ref._waits.indexOf(id), 1);
            ref._progress();
        };
    this._waits.push(id);
    return func;
};

/**
 * Cancels asynchronous operation
 * 
 * @param {Object} fn
 * @param {Object} error
 */
ASync.prototype.cancel = function(fn, error) {
	this._error = error;
	this.handler && this.handler(fn, error);
};

/**
 * Sets error handler function
 * 
 * @param {Object} ctx
 * @param {Function} fn
 */
ASync.prototype.error = function(ctx, fn) {
	if (typeof ctx == 'function') {
        this.handler = ctx;
    } else {
		if (typeof fn == 'function')	
            this.handler = function() {
                fn.apply(ctx, arguments);
            };
    }
	
	(this._error) && this.handler();
    return this;
};

/**
 * Sets success handler function
 * 
 * @param {Object} ctx
 * @param {Function} fn
 */
ASync.prototype.wait = ASync.prototype.success = function(ctx, fn) {
	if (typeof ctx == 'function') {
        this.callback = ctx;
    } else {
		if (typeof fn == 'function')	
            this.callback = function() {
                fn.apply(ctx, arguments);
            };
    }
	
    (!this._error && !this._waits.length) && this.callback() && (this._done = true);
    return this;
};

ASync.prototype._progress = function() {
	if (!this._error && !this._waits.length)
        if (!this.callback || this.callback())
            this._done = true;
};

