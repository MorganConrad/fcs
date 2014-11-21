/**
 * @author Morgan Conrad
 * Copyright(c) 2013
 * This software is released under the MIT license  (http://opensource.org/licenses/MIT)
 *
 * This is an extremely basic http server.
 * Any FCS file received with a PUT or POST
 *    will be read by FCS,
 *    and echoed back in JSON
 *
 *  most query params are sent as options to fcs
 *  the exception is that o=blah are used to select a small subset of the result
 */

var fs = require('fs');
var http=require('http');
var url=require('url');

// depending on your setup, edit the following two lines
var FCS=require('../fcs');
var port = 3000;



http.createServer(function (req, res) {
   if (('PUT' === req.method) || ('POST' === req.method))
      handlePut(req, res);

   // provide basic instructions in case they do a normal GET (or anything else)
    else {
       var fileStream = fs.createReadStream('./fcshttp.html');
       fileStream.pipe(res);
   }
}).listen(port);


function handlePut(req, res) {
    var options = { encoding: "binary" };

    var url_parts = url.parse(req.url, true);

    var onlys = url_parts.query.o;

    for (var p in url_parts.query ) {
        if ('o' !== p) {
            options[p] = url_parts.query[p];
        }
    }

    var chunks = [];
   
   var fcs = new FCS(options);
   var fws = fcs.prepareWriteableStream(function(err,fcs) {
      var json;
      if (onlys)
         json = JSON.stringify(fcs.getOnly(onlys), null, 2);
      else
         json = fcs.toJSON();

      res.writeHead(200, {
         'Content-Type': 'application/json',
         'Content-Length': json.length
      });

      res.write(json);
      res.end();
      
      console.log(json);
   }, req);
   
   req.pipe(fws);

   /*
    req.addListener("data", function(chunk) {
       chunks.push(chunk);
    });
    req.addListener("end", function() {
        var buffer = Buffer.concat(chunks);
        try {
           var fcs = new FCS(options, buffer);
           var json;
           if (onlys)
              json = JSON.stringify(fcs.getOnly(onlys), null, 2);
           else
              json = fcs.toJSON();
			  
           res.writeHead(200, {'Content-Type': 'application/json' });

           res.write(json);
		     res.end();
        }
       
        catch (error) {
           console.log(error);
           res.end(JSON.stringify(error, null, 2));
        }
    });


    // minor tests for error conditions...
    var foobar = function(err) {
        err = err || 'An error occurred';
        res.statusCode = 500;
        res.end(err);
    }

    req.addListener("error", function(err) {
        foobar(err);
    });
    req.addListener("close", function(err) {
        foobar('Connection closed');
    });
    
    */
}

