BaseControler Core
====================

A node.js server framework that takes care of daemonizing, logging, configuration etc. designed to run node.js application on premises.

This documentation explains what you can use to build your application using node-basecontroller system.



Initialization
----------------

When you override any of the init sequence function **remember to call or return the callback function***. Otherwise the config will not go any further.

The initialization task is handled by the `BaseController:init` method which calls the following methods in order:

    this.initLog()                      // creates and sets up logger
    
    this.initBeforeConfig(callback)     // You can override this function to perform tasks before the config is parsed
    this.initConfig(callback)           // Creates additional loggers, initializes service configuration, sets controller basepath
    
    this.initBeforeServices(callback)   // You can override this function to perform tasks before the services are loaded
    this.initServices(callback)         // Loads services according to the configuration
    
    this.initBeforeHandlers(callback)   // You can override this function to perform tasks before the services are loaded
    this.initHandlers(callback)         // Loads handlers (currently loads the "stats" handler on "http" service)

### Initializing Services

For now services are the only way of using BaseController that you can consider stable.

Service is basically anything you want your application to do - start a HTTP Server, a socket server or anything else you like. Starting multiple services within one will allow you to host multiple applications within one process.

BaseController services are not separated from the controller -- they're not safe to use as say seaparate hosting for node.js application, but you could easily provide third party users with a single BaseController process. That coupled with a unix user and proper permissions should be enough for such use. 

To initialize a service you simply need to create a node.js module in:
* /path/to/where/your/**basecontroller**/is/services/name
* /path/you/specify/as/basepath/in/your/config/name
* install a basecontroller-svc-name module

The service module needs to export a function that will be called in context of controller:

    module.exports = function(config, callback) {
        ...
        callback(); // run this when your service is initialized and controller init may go on.
    }

Then you just specify your service in the configuration:

    {...
        "services": {
            "myservice": {
                "some": "configuration directive",
                "and": {"another: 4}
            }
        }
    ...}

Anything you declare in the "myservice" object will be your service configuration. It will be overridable through command line as well as flavours.

Try the [basecontroller-svc-http](https://github.com/AgoraTech/basecontroller-svc-http) repo for an example how a service could be used.

### Handlers

Handlers are meant to be used by services to implement specific methods used by services.

To see how handlers work - see how stats handler is added on service HTTP in BaseController core.

You can add handlers by calling:

    controller.addHandler('service-name', 'handler-name', function(callback) {
        return true;
    });

The handler must return true to tell the service that the request will be handled. Anything you will call your callback function with will be passed to the service.

Since handlers are not considered stable and sensibly designed it's probably best you avoid using them...

Shutdown
----------

### Cleanups

Before the controller is gracefully shut down you can tell it to perform some tasks.

To add a cleanup:

    controller.addCleanup(function(callback) {
        // shutdown http server or whatever else
        // and call callback when you're done.
    });

Always call the callback function otherwise the controller won't stop unless killed.


License
---------

BaseController is released on the BSD 2-clause license. The product is not suitable for consumer use.

You can get the license in "license.txt" file available in this repository.
