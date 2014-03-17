"use strict";

var Stream = require('stream').Stream;

/**
 * Writable Stream that accumulates data in buffer
 *
 * usage:
 * var StreamBuffer = require('streambuffer').StreamBuffer;
 * var streamBuff = new StreamBuffer();
 * request.on('end', function() { var rawPostData = streamBuff.getBuffer(); ... });
 * request.pipe(streamBuff);
 *
 */
var StreamBuffer = exports.StreamBuffer = function StreamBuffer() {
    Stream.call(this);

    this.writable = true;

    this._buffers = [];
    this._size = 0;
};

StreamBuffer.prototype = {
    __proto__: Stream.prototype,

    getBuffer: function() {

        if (!this._size)
            return new Buffer(0);

        var buffer = new Buffer(this._size);
        this.copyToBuffer(buffer);

        return buffer;
    },

    getSize: function() {
        return this._size;
    },

    copyToBuffer: function(buffer, start) {

        start = start || 0;
        if (start >= buffer.length)
            throw new Error('start position is out of bounds');
        if (start + this._size > buffer.length)
            throw new Error('insufficient buffer size');

        this._buffers.forEach(function(buf) {
            buf.copy(buffer, start);
            start += buf.length;
        });

        return start;
    },

    write: function(data, encoding) {

        if (!Buffer.isBuffer(data))
            data = new Buffer(data, encoding);

        this._buffers.push(data);
        this._size += data.length;

        return true;
    },

    end: function(data, encoding) {

        if (data) this.write(data, encoding);
        this.destroy();
    },

    destroy: function() {

        this.writable = false;
        process.nextTick(this.emit.bind(this, "close"));
    },

    destroySoon: function() {
        this.destroy();
    }

};
