/*
   Example Command line FCS reader

   usage: node fcscli filename [filenames] [--arg=value]

   command line options affecting affect this reader.

   --ext=xxx           send output to a file with that extension (typically json) instead of stdout
   --o=xxx            (may be multiples)  only print out those fields.  e.g. --o=header --o=text.$P1N
   --addFilename=fff  add the filename to the fcs.meta section under the key fff.
                      fff is optional, defaults to "filename"
   --addDate=ddd      add the current date (ISO-8601 format) to the fcs.meta section under the key ddd.
                      ddd is optional, defaults to "current_date"

   all other arguments are passed into the fcs object as options.
*/

var FCS = require('../fcs');
var FS = require('fs');

var options = {};
var filenames = [];
var onlys = [];
var fileExt;
var addDateKey;
var addFilenameKey;

for (var a=2; a<process.argv.length; a++) {
   // test for --foo=bar format
   if ('--' == process.argv[a].substring(0,2)) {
      var s = process.argv[a].substring(2);  // remove --
      var ss = s.split('=');
       if ('o' === ss[0])   // special "only" option to get a subset of the results...
         onlys.push(ss[1]);
       else if ('ext' === ss[0])
         fileExt = ss[1];
       else if ('addDate' === ss[0])
           addDateKey = ss[1] || 'current_date';
       else if ('addFilename' === ss[0])
           addFilenameKey = ss[1] || 'filename';
       else
	     options[ss[0]] = ss[1] || 'true';
   }
   else
      filenames.push(process.argv[a]);
}

if (filenames.length == 0) {
    console.error('usage: node fcscli filename [filenames] [--arg=value]');
   filenames = ['C:\Work\FCSFiles\FCSRepository\BD - FACS Aria II - Compensation Controls_G710 Stained Control.fcs'];
    // process.exit(1);
}


for (var f=0; f<filenames.length; f++) {
   var filename = filenames[f];
    if (addDateKey)
        options[addDateKey] = new Date();
    if (addFilenameKey)
       options[addFilenameKey] = filename;

   FS.readFile(filename, function(err, databuf) {
        if (err) {
            console.error(err);
	    }
	    else {
           var fcs = new FCS(options, databuf);
           var fcsResponse = (onlys && onlys.length) ?
               JSON.stringify(fcs.getOnly(onlys), null, 1) : fcs.toJSON();
           if (fileExt) {  // write out individual files with new file extension (typically json)
	          var lastDot = filename.lastIndexOf('.');
		      if (lastDot > 0)
		         filename = filename.substring(0, lastDot+1);
              FS.writeFile(filename + fileExt, fcsResponse, function (err) {
		          if (err)
			          console.error(err);
		      });
            }			  
			else
			   console.log(fcsResponse);
		 }
	 
    });
	
};

