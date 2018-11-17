[![Build Status](https://secure.travis-ci.org/MorganConrad/fcs.png)](http://travis-ci.org/MorganConrad/fcs)
[![License](http://img.shields.io/badge/license-MIT-A31F34.svg)](https://github.com/MorganConrad/fcs)
[![NPM Downloads](http://img.shields.io/npm/dm/fcs.svg)](https://www.npmjs.org/package/fcs)
[![Known Vulnerabilities](https://snyk.io/test/npm/fcs/badge.svg)](https://snyk.io/test/npm/fcs)
[![Coverage Status](https://coveralls.io/repos/github/MorganConrad/fcs/badge.svg)](https://coveralls.io/github/MorganConrad/fcs)

# fcs

Javascript / node.js code to read FCS flow cytometry data.  Will read all of the HEADER, TEXT, and ANALYSIS segments into key/value pairs.  Reads raw (likely uncompensated) data as well, either into numeric arrays for further analysis, or as Strings for quickly scanning the data.

## basic usage

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

### see fcscli.js or fcshttp.js in the examples folder for usage examples

## options (default in bold)

* dataFormat:   'asNumber', '**asString**', 'asBoth', or 'asNone'
* groupBy:       '**byEvent**', 'byParameter'
* decimalsToPrint: **2**
* eventsToRead:    **1000**   // an integer, -1 means "all events"
* maxPerLine:      **10**
* eventSkip:   **0**  if eventsToRead is less than the events in the file, this allows you to more randomly sample.  A value of 'true' has them equally distributed.  0 means read the first events from the file.

Any additional options are ignored, but will be printed under a "meta" segment in the JSON.  For example, you might want to include a date, your laboratory, etc...

# api

## creational

### var myFCS = new FCS(options, buffer)
Constructor.  Both arguments are optional.
If buffer is present it will be read, otherwise you need to call **readBuffer()** or **readStreamAsync()** later

### myFCS.options(options)
Set or add options.

### myFCS.readBuffer(buffer, moreOptions)
Read data from buffer.  moreOptions are optional.  Hopefully by now you've set them all! :-)

### myFCS.readStreamAsync(readStream, moreOptions, callback)
Reads data asynchronously from a readStream.  moreOptions is optional.  When complete, calls `callback(err, fcs)`.

### myFCS.prepareWriteableStream(callback, readableStream)
The readableStream arg is optional.  Creates a writeableStream ready to parse an FCS format file.  e.g.

    var fws = fcs.prepareWriteableStream(callback, readableStream);
    readableStream.pipe(fws);

When piping is complete, will call `callback(err, fcs)`.

## retrieving the data

### get(segment, keywords...)
segment should be one of  ('text', 'analysis', or, more rarely, 'header', 'meta').
If no keywords are provided, returns that entire segment
otherwise, returns a single value, stopping at the first match to the keyword.
Returns null if none were found.

### getText(keywords...)
Equivalent to get('text', keywords)
  *e.g.* `text('$P3N') might return 'FL1-H'

### get$PnX(x)
Return an array of all N keywords for that P.X combination.  The 0th value will be empty.
  *e.g.* `get$PnX('N') might return ['', 'FSC, 'SSC', 'FL1-H', ...]

### getAnalysis(keyword, additionalKeywords...)
Equivalent to get('analysis', keywords)

### getNumericData(oneBasedIndex)
Returns an array of Numbers for the respective event or parameter, iff you requested numeric data.

### getStringData(oneBasedIndex)
Returns an array of Strings for the respective event or parameter, iff you requested string data.

### getOnly(onlys)
Returns a subset of the JSON, based upon onlys, an array of dot delimited Strings
  *e.g.* getOnlys(['meta','text.$P1N') would return all of meta, plus parameter 1 name

## fields

### .header
  Holds the HEADER segment (first 256 bytes).  The version is header.FCSVersion

### .text
  Holds all the TEXT segment

### .analysis
  Holds all the ANALYSIS segment.  If none, is an empty object {}

### .meta
  Holds all the options, plus a bit more

## Todos and Gotchas [official bugs here](https://github.com/MorganConrad/fcs/issues)

 - doesn't handle $BEGINSTEXT, $ENDSTEXT
 - could do more with Millipore's XML ANALYSIS

## Changelog

 - v0.1.0  17 Nov 2018 partly converted to use ES6 features
