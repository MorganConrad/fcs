#fcs

Javascript / node.js code to read FCS flow cytometry data.  Will read all of the HEADER, TEXT, and ANALYSIS sections into key/value pairs.  Reads raw (likely uncompensated) data as well, either into numeric arrays for further analysis, or as Strings for quickly scanning the data. 

##basic usage

1. Get the FCS file into a Buffer
2. Create a new FCS(theBuffer, options)

e.g. to read from a file asynchronously

```javascript
 var FCS = require('fcs');
 FS.readFile(filename, function(err, databuf) {
        if (err) {
            console.error(err);
            }
            else {
           var fcs = new FCS(options, databuf);
           // do something with fcs
            }
   });
```

###see fcscli.js or fcshttp.js in the examples folder for usage examples

##options (default in bold)

* dataFormat:   'asNumber', '**asString**', 'asBoth', or 'asNone'
* groupBy:       '**byEvent**', 'byParameter'
* decimalsToPrint: **2**
* eventsToRead:    **1000**   // an integer, -1 means "all events"
* maxPerLine:      **10**
* eventSkip:   **0**  if eventsToRead is less than the events in the file, this allows you to more randomly sample.  A value of 'true' has them equally distributed.  0 means read the first events from the file.

Any additional options are ignored, but will be printed under a "meta" section in the JSON.  For example, you might want to include a date, your laboratory, etc...

#api

##creational

###var myFCS = new FCS(options, buffer)
Constructor.  Both arguments are optional.
If buffer is present it will be read, otherwise you need to call readBuffer() later

###myFCS.options(options)
Set or add options.

###myFCS.readBuffer(buffer, moreOptions)
Read data from buffer.  moreOptions are optional.


##retrieving the data

###text(keyword, additionalKeywords...)
Returns the value from the TEXT section.  
  *e.g.* `text('$P3N') might return 'FL1-H'
If additionalKeywords are provided, it stops at the first "hit", but this is useful if different vendors use different keywords.

###$PnX(x)
Return an array of all N keywords.  The 0th value will be empty.
  *e.g.* `$PnX('N') might return ['', 'FSC, 'SSC', 'FL1-H', ...]

###analysis(keyword, additionalKeywords...)
Returns the value from the ANALYSIS section.

###numericData(oneBasedIndex)
Returns an array of Numbers for the respective event or parameter.

###stringData(oneBasedIndex)
Returns an array of Strings for the respective event or parameter.


##fields

### .text 
  Holds all the TEXT

### .headers 
  Holds the version and offsets

### .analysis 
  Holds all the analysis, if there was any

### .meta
  Holds all he options, plus a bit more
