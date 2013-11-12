/**
 * hup: helpful utility package
 * Created by Morgan Conrad on 11/11/13.
 */


module.exports.ReadStreamToBuffer = ReadStreamToBuffer;


function ReadStreamToBuffer(inOptions) {
    "use strict";
    // allow "static" usage, save user from misuse...
    if (!(this instanceof ReadStreamToBuffer))
        return new ReadStreamToBuffer(inOptions);

    this.options = inOptions || { };

    this.callbacks = {
        readable: this.options.readable,
        error: this.options.error || function(err) {
            throw err;
        },
        close: this.options.close
    };

}


ReadStreamToBuffer.prototype.read = function(readableStream, onEndCallback) {

   this.bufs = [];  // clear old results
   var self = this;

    // register all but 'end' callbacks
   for (var callback in this.callbacks) {
       if (this.callbacks[callback])
          readableStream.on(callback, this.callbacks[callback]);
   }

   readableStream.on('end', function() {
       var buf = Buffer.concat(self.bufs);
 //      console.log('end');
       var done = (self.options.end) && self.options.end(buf, options);
       if (!done)
           onEndCallback(buf, self.options);
   });

   readableStream.on('data', function(data) {
   //    console.log('data ' + data);
        self.bufs.push(data);
        if (self.options.data)
            self.options.data(data);
   });
}


ReadStreamToBuffer.prototype.readSync = function(readableStream) {
    this.bufs = [];  // clear old results

    var chunks = [];
    var chunk = readableStream.read();

    while (chunk) {
        chunks.push(chunk);
        chunk = readableStream.read();
    }

    return Buffer.concat(chunks);
}