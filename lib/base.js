/**
 * @fileoverview
 * BaseController Class
 * 
 * @author Michal Czapracki <michal.czapracki@agora.pl>
 */

var EventEmitter = require('events').EventEmitter,
    fs = require('fs'),
    os = require('os'),
    util = require('util'),
    http = require('http'),
    net = require('net'),
    url = require('url'),
    path = require('path'),
    Logger = require('basecontroller-logger'),
    ASync = require('basecontroller-libs').ASync,
    Seq = require('basecontroller-libs').Seq,
    initial_mem_usage = 0;

/**
 * BaseController constructor.
 */
function BaseController() {
    EventEmitter.call(this);
};
util.inherits(BaseController, EventEmitter);

/**
 * Registers the inter process communication channel.
 */
BaseController.prototype.registerIPC = function(ipc, proc) {
    this.ipc = ipc;
    this.ipc.setProcess(proc || process);

    ipc.on('init', this.init.bind(this));
    ipc.on('shutdown', this.shutdown.bind(this));
    ipc.on('kill', this.kill.bind(this));
    ipc.on('reopen', this.reopen.bind(this));

    ipc.send('ready', {
        pid: process.pid,
        name: this.toString()
    });
};

/**
 * Initializes the BaseController object with specific configuration object.
 */
BaseController.prototype.init = function(cfg) {
    var ref = this;
    
    /**
    * Configuration specs.
    * @type Object 
    */
    this.cfg = cfg;
    this.services = {};
    this._exitstatus = 1;
    
    this.initLog();
    
    if (!this.initialized) {
    
        if (cfg.init) {
            Seq.run([
                function(next) { process.nextTick(next); },
                this.initBeforeConfig.bind(this),
                this.initConfig.bind(this),
                function(next) {
                    ref.logger.log('== Configuration initialized! ==');
                    ref.emit('config');
                    return next;
                },
                this.initBeforeServices.bind(this),
                this.initServices.bind(this),
                function(next) {
                    ref.logger.log('== Services initialized! ==');
                    ref.emit('services');
                    return next;
                },
                this.initBeforeHandlers.bind(this),
                this.initHandlers.bind(this),
                function(next) {
                    ref.logger.log('== Handlers initialized! ==');
                    ref.emit('handlers');
                    return next;
                },
                this.initBeforeDone.bind(this)
            ], function() {
                ref.emit('init');
                ref.logger.log('== Initialization complete! ==');
                ref.initialized = true;
                ref.ipc.send('init');
            }, function(step, e){
                ref.logger.error('== Initialization failed! ==');
                ref.logger.debug('Failure on (' + step + ') step', e);
                
                if (!cfg.failok)
                ref.shutdown();
            
            });
        } else {
            ref.logger.log('== Initialization omitted! ==');
            this.initialized = true;
            ref.ipc.send('init');
        }
    }
    
    this.begin();
    
    return this;
};

BaseController.prototype.initLog = function() {

    this.logger = this.logger || Logger.getInstance(this.toString());
    this.logger.level(this.cfg.loglevel || 1);
    
    if (this.cfg.logfile) {
        this.logger.file(this.cfg.logfile);
    }
    
    var logger = this.logger;
    this.addCleanup(function(cb) {
        process.nextTick(function() {
            logger.warn('Closing log');
            logger.close(cb);
        });
    });
    
    this.logger.error('=== Initializing ===');

};

BaseController.prototype.initBeforeConfig = function(callback) {
    return callback;
};

BaseController.prototype.initConfig = function(callback) {
    
    this._basepath = this._basepath || this.cfg.basepath;
    
    if (this.cfg.services) {
        this.services = this.cfg.services;
    }
    
    if (this.cfg.loggers) {
        for (var id in this.cfg.loggers) {
            Logger.getInstance(id).level(+this.cfg.loggers[id] || 0);
        }
    }
    
    return callback;
};

BaseController.prototype.initBeforeServices = function(callback) {
    return callback;
};

BaseController.prototype.initServices = function(callback) {
    var async = new ASync();
    
    for (var name in this.services) {
        var svcp = '';
        
        if (this._basepath) {
            try {
                svcp = require.resolve(path.resolve(this._basepath, 'services/', name));
            } catch(e) {
            }
        }

        if (!svcp || !this._basepath || !path.existsSync(svcp)) {
            try {
                svcp = require.resolve('./services/' + name);
            } catch(e) {
            }
        }
        
        if (!svcp) {
            svcp = require.resolve('basecontroller-svc-' + name);
        }
        
        this.logger.log('Initializing service ' + name + ' from ' + svcp);
        
        require(svcp).call(this, this.services[name], async.getHandler());
    }
    
    async.wait(callback);
};

BaseController.prototype.initBeforeHandlers = function(callback) {
    return callback;
};

BaseController.prototype.initHandlers = function(callback) {
    if (!this.services.http)
        return callback;
    
    var ref = this;
    
    this.addHandler('http', 'stats', function(req, data, callback){
        callback(ref.stats(req.pathname, req.strippedPath));
        return true;
    });
        
    return callback;
};

BaseController.prototype.initBeforeDone = function(callback) {
    return callback;
};

/**
 * 
 * @param {String} base
 * @param {Function} handler
 */
BaseController.prototype.addHandler = function(service, base, handler) {
    this._handlers = this._handlers || {};
    this._handlers[service] = this._handlers[service] || {};
    this._handlers[service][base] = handler;

    this.logger.info('Added new handler for base "' + base + '" on service "' + service + '"');

    return this;
};

/**
* Called by a specific service
* 
* @param {String} base
* @param {Location} request
* @param {Function} response
*/
BaseController.prototype._handleRequest = function(service, base, resource, data, context, callback) {
    if (!this._handlers || !this._handlers[service] || !this._handlers[service][base])
        return false;
    
    // TODO: access logs
    this.logger.msg(9, 'Handling request: ' + service + '::' + base + '::' + (resource && resource.pathname));
    
    return this._handlers[service][base].call && this._handlers[service][base].call(context, resource, data, callback);
};

/**
* Request restart from parent over IPC. 
*/
BaseController.prototype.restart = function() {
    this.ipc.send('restart');
};

/**
* Releases lock.
*/
BaseController.prototype.kill = function() {
    this.releaseLock();
    process.exit(0);
};

/**
* Sets exit status to 3 - "graceful shutdown" and exits after all files had finished.
*/
BaseController.prototype.shutdown = function(force) {
    if (this._exitstatus >= 3) {
        if (!force) return;
    } else {
        force = false;
    }

    this._exitstatus = 3;
    this.logger.error('Graceful shutdown requested...');

    this.cleanup(this.kill.bind(this), true);
};

/**
* Override this method to do anything you wish on reopen signal.
*/
BaseController.prototype.beforeReopen = function() {};

BaseController.prototype.reopen = function() {
    this.logger.warn('Reopen issued');
    this.beforeReopen();
    this.logger.reopen && this.logger.reopen();
};

/**
* Returns lock status.
* You should override this method and implement your own lock methods here.
* 
* @return {Boolean} 
*/
BaseController.prototype.isLocked = function() {
    try {
        var lockfile = (this.lockfile || this._lockFile());
        return !fs.statSync(lockfile); 
    } catch(e) {
        return false;
    }
};

BaseController.prototype._lockFile = function() {
    return this.cfg.lockFile && this.cfg.lockFile + '.lock' || '';
};

/**
* Creates lock file
* @return {Boolean} success state
*/
BaseController.prototype.setLock = function() {

    if (this.isLocked()) 
        return false;
    
    if (this._lockFile()) {
    
        this._is_locking = true;
        this.lockfile = this._lockFile();
        
        fs.writeFileSync(this.lockfile, '' + process.pid);
    
    }
    return true;
};

/**
* Deletes lock file
* @return {Boolean} success state
*/
BaseController.prototype.releaseLock = function() {
    if (!this._is_locking)
        return false;
    
    this._is_locking = false;
    
    this.logger.log('lock released!');
    try {
        fs.unlinkSync(this.lockfile);
    } catch (e) {
        this.logger.error('NO LOCK FILE!');
    }
    return true;
};

/**
* Initializes BaseController operation.
* If lock is set, this will fail and be repeated in 10 seconds.
* 
* @return {Boolean}
*/
BaseController.prototype.begin = function() {

    if (this.isLocked()) {
        var ref = this;
        
        /**
        * Indicates locked state.
        * @type Boolean
        */
        this.locked = true;
        
        setTimeout(function(){
            ref.begin();
            ref.handleSelfCheck();
        }, 10000);
        
        return false;
    }
    
    this.setLock();
    
    this._exiting = false;
    
    this.interval_selfCheck = setInterval(this.handleSelfCheck.bind(this), 10 * 60 * 1000);
    this.interval_tick = setInterval(this.handleTick.bind(this), 1 * 1000);
    
    this.handleSelfCheck();
    
    return true;
};

/**
* Standard tick callback
*/
BaseController.prototype.handleTick = function() {
    this.run();
};

BaseController.prototype._idleCheck = function() {
    return false;
};

/**
* Self check callback
* 
* Issues autorestart when maximum mem usage is reached.
*/
BaseController.prototype.handleSelfCheck = function() {
    var rss = process.memoryUsage().rss;
    
    if (!initial_mem_usage) {
        initial_mem_usage = this.cfg.maxiumum_memory_usage || 768 * 1024 * 1024;
    }
    
    if (rss >= initial_mem_usage) {
        this.logger.warn('memory usage limit exceeded - issue autorestart...');
        this.restart();
    } else if (2 * rss >= initial_mem_usage && this._idleCheck && this._idleCheck()) {
        this.logger.warn('memory usage exceeded half of the limit and controller is idle - issue autorestart...');
        this.restart();
    }
};

/**
* Returns stats for HTTP Status.
* @return {Object}
*/
BaseController.prototype.stats = function() {

    try {
        mem = process.memoryUsage();
        return {
            locked: this.locked,
            load: os.loadavg(),
            exiting: (this._exiting ? true : false),
            uptime: process.uptime(),
            mem: mem
        };
    } catch(e) {
        this.logger.error(e);
        return { locked: true, err: 1 };
    }
};

/**
* Sets callback for exit when all files are done.
* @param {Function{Boolean}} callback
*/
BaseController.prototype.exitOnDone = function(callback) {
    this._exiting = callback;
    this.logger.warn('waiting for all operations to finish...');
};

BaseController.prototype.addTick = function(callback) {
    this._ticks = this._ticks || [];
    this._ticks.push(callback);
    return this;
};

/**
* Runs operations (deferred)
*/
BaseController.prototype.run = function() {

    if (this._runTimeout) return;
    this._runTimeout = true;
    process.nextTick(this.exec.bind(this));

};

BaseController.prototype.addCleanup = function(callback) {

    this._cleanups = this._cleanups || [];
    this._cleanups.push(callback);
    return this;

};

BaseController.prototype.cleanup = function(callback, graceful) {
    var sync = new ASync();
    
    if (!this._cleanups)
        return callback();
    
    for (var i=0; i < this._cleanups.length; i++) {
        this._cleanups[i](sync.getHandler(), graceful);
    }
    
    sync.wait(callback);
    sync.error(callback);
};

/**
* Executes operations.
*/
BaseController.prototype.exec = function() {

    var sync = new ASync(), ref = this;
    for (var id in this._ticks)
        this._ticks[id](sync.getHandler());
    
    sync.wait(function(){
        ref._runTimeout = false;
    }).error(function(){
        ref.logger.error('An error occured on tick');
        ref.logger.trace('Error stack');
        ref._runTimeout = false;
    });
    
    if (this._exiting) {
        // TOCHECK: there is currently no condition that holds exit.
        if (!this.cleaned_up) {
            this._exiting();
        }
        return;
    }
    
};

BaseController.prototype.toString = function() {
    return '[BaseController]';
};

BaseController.prototype.favicon = 
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAwZJREFUWIXt"+
    "l89LJEcUxz/V0z39Y6MscQiGnZlLDuoiC3rI7h+R2xyDPUQRvEzwkIOCnj0EBiHg0YtnMf/A5uBBlj2M"+
    "CIJ7CooGDx4kMk1PTbf9clknYXWma1xzSr6Xoqu+fN/3Fe9VV8F/HcqUuLi4+LPW+icTrm3bP25vb//y"+
    "eFufYGFhYW5lZaV9e3sreYjjWBqNRrter39vop27A3Nzc69933/bbDafua6L1nog33Vdbm5uWF1djeM4"+
    "/m5nZ+e3QXwr16FS79bW1p75vp8bHEBrzejoKOvr675S6m0e385VBCqVCldXV2RZZkIniiLK5bIR18gA"+
    "wP7+vikVgFqt9rQGAOOsLi4ujDVza+DfxlA7MExmT25gZmYGz/OMuEoZn2/mBg4PD41F4f8i/Bubm5vv"+
    "ms3mi37rNkCj0XiZJMkr4Bul1POP8wXAjqKoR35MEU5PT3/barXeLy0t/WpZVioiqW3bfzqO87vjOPu2"+
    "iKiDg4Oi53lZEARaKaWTJFFa62Kapu7W1tad0NDBAaamptTR0dH4/Py87bpuUiwWu57nkWXZF9fX14Gt"+
    "lJJardYRkSxJkoKIOJZl2Uopy7IsNTIyAoCI9ETb7TZnZ2d9g7quy8TEBAAnJyeitb7a2NhQIlIQERtI"+
    "i8XidaFQiGyA3d3dD8CHh8TCMPwB4PT0lPPzcyqVCqVSCd/3GRsbu8fvdDqkadr7Pj4+fu95Xm1vb++P"+
    "h/SNu+Dy8pLZ2VlardaDgftheXn5zaB1YwPj4+O0Wi3K5TIiQhzHfYsyCAJjg8YGqtUq1Wq19z05OYlS"+
    "iiAIcF0Xx3GMgz7KwB1EBKVUryjb7TZRFJFlWW9eKUWpVDLSMz6IRAQRodPpoJS6N2qtsSzL6Nb02QaA"+
    "geM/W/bJDNyh2+1iWdbAcRgMbUBr3dvyfuNTGrh3AXiEga+GcvQJvg7DMPcx0g9hGArwEujbo3ltWACo"+
    "1+ufk4TDgAdQ3t3pS+AFMMqALPqgC9wCF8CD/wETA3wM/pzhC7YLRMAN0Lcv/wJr8q3E3GomUQAAAABJ"+
    "RU5ErkJggg==";

BaseController.BaseController = BaseController;

module.exports = BaseController;

