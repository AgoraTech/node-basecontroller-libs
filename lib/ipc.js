"use strict";

var util = require('util'),
    EventEmitter = require('events').EventEmitter;

var IPC = function(proc) {
        EventEmitter.call(this);
        if (proc) this.setProcess(proc);
    };

util.inherits(IPC, EventEmitter);

IPC.prototype.setProcess = function(proc) {
    this._process = proc;
    this._process.on('message', function(msg) {
        this.emit.apply(this, msg);
    }.bind(this));
    this._process.on('close', function() {
        this.emit('close');
    }.bind(this));
};

IPC.prototype.send = function() {
    if (!this._process) return;
    var msg = Array.prototype.slice.apply(arguments);
    this._process.send(msg);
};

module.exports = IPC;
