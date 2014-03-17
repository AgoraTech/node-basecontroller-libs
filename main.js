
var libs = module.exports;

libs.__defineGetter__('IPC', require.bind(null, './lib/ipc'));
libs.__defineGetter__('ASync', require.bind(null, './lib/async'));
libs.__defineGetter__('Seq', require.bind(null, './lib/seq'));
libs.__defineGetter__('cors', require.bind(null, './lib/cors'));
libs.__defineGetter__('StreamBuffer', require.bind(null, './lib/streambuffer'));
