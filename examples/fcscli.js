/*
   Example Command line FCS reader
*/

var FCS = require('../fcs');
var FS = require('fs');

var options = {};
var filenames = [];

for (var a=2; a<process.argv.length; a++) {
   // test for --foo=bar format
   if ('--' == process.argv[a].substring(0,2)) {
      var s = process.argv[a].substring(2);  // remove --
      var ss = s.split('=');
	  options[ss[0]] = ss[1] || 'true';
   }
   else
      filenames.push(process.argv[a]);
}

if (filenames.length == 0) {
    console.error('usage: node fcscli filename [filenames] [--arg=value]');
    process.exit(1);
}


var fileExt = options['ext'];

for (var f=0; f<filenames.length; f++) {
   var filename = filenames[f]
   options.filename = filename;

   FS.readFile(filename, function(err, databuf) {
        if (err) {
            console.error(err);
	    }
	    else {
           var fcs = new FCS(options, databuf);
           if (fileExt) {  // write out individual files with new file extension (typically json)
	          var lastDot = filename.lastIndexOf('.');
		      if (lastDot > 0)
		         filename = filename.substring(0, lastDot+1);
              FS.writeFile(filename + fileExt, fcs.toJSON(), function (err) {
		          if (err)
			          console.error(err);
		      });
            }			  
			else
			   console.log(fcs.toJSON());
		 }
	 
    });
	
};

