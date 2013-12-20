/**
 * @author Morgan Conrad
 * Copyright(c) 2013
 * This software is released under the MIT license  (http://opensource.org/licenses/MIT)
 */


/**
 * Constructor
 * @param options   options,  {}, optional argument
 * @param buffer   if present, read it.  (Otherwise, call readFCS() later)
 * @constructor
 */
function FCS( /* optional */ options, buffer) {
   "use strict";

    // allow "static" usage, save user from misuse...
    if (!(this instanceof FCS))
       return new FCS(options, databuf);

    // important options to always have in meta so they get remembered
   this.meta =  {
       dataFormat: FCS.DEFAULT_VALUES.dataFormat,
       groupBy:    FCS.DEFAULT_VALUES.groupBy
   };

   this.header = {};
   this.text = {};
   this.analysis = {};

   this.dataAsStrings = this.dataAsNumbers = null;

   this.options(options);

   if (buffer) {
       if (Buffer.isBuffer(buffer))
           this.readBuffer(buffer);
       else
           throw "only Buffers supported for now";
   }


    // override the toJSON() method
    this.toJSON = function() {
        var json = '{\n "meta": ';
        json += JSON.stringify(this.meta, null, 2);
        json += ',\n "header": ';
        json += JSON.stringify(this.header, null, 2);
        json += ',\n "text": ';
        json += JSON.stringify(this.text, null, 2);
        json += ',\n "analysis": ';
        json += JSON.stringify(this.analysis, null, 2);
        json += ',\n "data": \n';
        if (this.dataAsStrings) {
            // for clarity, an extra CRLF after groupByParam data
            var delim = (FCS.OPTION_VALUES.byParam === this.meta.groupBy) ? ',\n\n' : ',\n';
            json += '[';
            for (var i=0; i<this.dataAsStrings.length; i++) {
                if (i > 0)
                    json += delim;
                json += this.dataAsStrings[i];
            }
            json += ']';
        }
        else if (this.dataAsNumbers)
           json += JSON.stringify(this.dataAsNumbers, null, 2);

        json += '\n}';  // close
        return json;
    };
}

/*
 * Constants for possible incoming option/meta values
 * Also see the defaults below in FCS.DEFAULT_VALUES
 */
FCS.OPTION_VALUES = {

    // .dataFormat should hold one of the following:
    asNumber: 'asNumber',   // collect data in large numeric arrays
    asString: 'asString',  // default, just collect data as a String (e.g. all you want is JSON back)
    asBoth:   'asBoth',    // both
    asNone:   'asNone',    // skip all the data

    // .groupBy   should hold one of the following:
    byEvent:  'byEvent',   // data values for each event are grouped together
    byParam:  'byParam',    // data values for each parameter are grouped together

    /*
          Other option keys that we use are

          .decimalsToPrint   0 means "all events", default = 1000

          .eventsToLoad      0 means none, negative means all

          .maxPerLine        affects printing in byParam for readability

          .encoding          should always be 'utf8' for FCS format


          All other options are ignored by this code, but will be placed into meta.
          So you will see them in the JSON.  In this way you can add your own metadata
          such as the date, laboratory, the filename, error status, etc...
     */

};


/*
 * Default values for the options we use.  In general, you should treat these as constants,
 * but if you really want to change the default behavior I can't stop you...
 */
FCS.DEFAULT_VALUES = {
        decimalsToPrint: 2,            // 0 means "all events"
        encoding:        'utf8',
        eventsToRead:    1000,         // an integer, 0 means "all events"
        maxPerLine:      10,           // only applies in byParam mode
        dataFormat:      'asString',   // alternatives are 'asNumber', 'asBoth', 'asNone'
        groupBy:         'byEvent'     // alternative is 'byParam'
};

FCS.SEGMENT = {
    META:     'meta',
    HEADER:   'header',
    TEXT:     'text',
    ANALYSIS: 'analysis',
};


/**
 * Adds properties from options to our meta data, overwriting if necessary
 * @param options   if absent nothing happens.
 * @returns {FCS}   for convenience
 */
FCS.prototype.options = function(options) {
    "use strict";

    // static usage is impossible currently, but in case we change the "classiness" in the future...
    if (!(this instanceof FCS))
        return new FCS(options);

    if (options)
        for (var prop in options)
            if (options.hasOwnProperty(prop))
                this.meta[prop] = options[prop];

    return this;
};



/**
 * Main method at creation, reads an FCS format file from a databuf
 *
 * @param databuf       required
 * @param moreOptions   optional
 * @returns {FCS}       for convenience
 */
FCS.prototype.readBuffer = function (databuf, /* optional */ moreOptions) {
    "use strict";

    // static usage is impossible currently, but in case we change the "classiness" in the future...
    if (!(this instanceof FCS))
        return new FCS(moreOptions, databuf);

    // add any moreOptions,  meta is now "complete"
    this.options(moreOptions);

    var encoding = this.meta.encoding || FCS.DEFAULT_VALUES.encoding;
    this.header = this._readHeader(databuf, encoding);

    var textSegment = databuf.toString(encoding, this.header.beginText, this.header.endText);
    this.text = this._readTextOrAnalysis(textSegment);

    this._adjustHeaderBasedUponText(this.text);
    
    if (this.header.beginAnalysis) {
        var analysisSegment = databuf.toString(encoding, this.header.beginAnalysis, this.header.endAnalysis);
        this.analysis = this._readTextOrAnalysis(analysisSegment);
    }

    // TODO  supplemental text, e.g. $BEGINSTEXT, $ENDSTEXT

    this.dataAsNumbers = this.dataAsStrings = null;

    this._readData(databuf);
    
    return this;
};


// here follow the public "getters/accessor" methods


/**
 * All purpose get, called by the other methods
 * @param segment   one of FCS.SEGMENT  (typically 'text',analysis', more rarely 'meta','header')
 * @param key       if none, returns the entire segment
 *                  otherwise, return first property match
 * @returns         {} if no-arg, else String, null if none were found.
 */
FCS.prototype.get = function(segment, key /*...*/) {
    "use strict";
    var theSegment = this[segment];
    if (!key)
       return theSegment;
  
    var result = theSegment[key];
    var idx = 2;
    while (!result && (idx < arguments.length))
        result = theSegment[arguments[idx++]];

    return result;    
}

/**
 * intermediate code to handle adding the segment to the array-like arguments
 * @param segment
 * @param argsAL  array-like, typically arguments  null returns entire segment
 * @returns {*}
 */

FCS.prototype.getAL = function(segment, argsAL) {
    "use strict";
    if (argsAL && argsAL.length) {
        // magic code to add segment at the start of the arguments
        [].unshift.call(arguments, segment);
        return this.get.apply(this, arguments);
    }
    
    else
        return this[segment];
}

/**
 * If no arguments are provided, returns *all* the ANALYSIS segment (may be {})
 * Otherwise, returns a single value from the ANALYSIS segment.
 *    e.g.   analysis('GATE1 count') ->  '1234'
 * @param keys     varargs, returns first "hit"
 * @returns       {} if no-arg, else String, null if none were found.
 */
FCS.prototype.getAnalysis = function(keys /*...*/ ) {
    "use strict";
    return this.getAL(FCS.SEGMENT.HEADER, keys);
};


/**
 * If no arguments are provided, returns *all* the TEXT segment.
  *Otherwise, returns a single value from the TEXT segment.
 *    e.g.   getText('$CYT') ->  'FACSort'
 * @param keys     varargs,  returns first "hit"
 * @returns       {} if no-arg, else String, null if none were found.
 */
FCS.prototype.getText = function(keys /*...*/ ) {
    "use strict";
    return this.getAL(FCS.SEGMENT.TEXT, keys);
};


/**
 * Returns an entire array of values from the text segment,
 * The returned array has 1 based indexing
 *    e.g.   get$PnX('N') => [,'FSC-H','SSC-H','FL1-H', etc...]
 * @param x
 * @returns {Array}
 */
FCS.prototype.get$PnX = function(x) {
    "use strict";
    var result = [];
    result[0] = null;
    for (var p=1; p<= this.meta.$PAR; p++)
       result[p] = this.text['$P' + p + x];

    return result;
};


/**
 * Returns numeric data if it was collected   (i.e. meta.dataFormat was asNumber or asBoth)
 * Whether this is the event[idx] or the parameter[idx] depends on meta.groupBy.
 * @param idx   1-based.
 * @returns {[]} of Numbers
 */
FCS.prototype.getNumericData = function(idx) {
    "use strict";
    if (this.dataAsNumbers)
       return this.dataAsNumbers[idx-1];
    else
       return null;
};


/**
 * Returns string data if it was collected   (i.e. meta.dataFormat was asString or asBoth)
 * Whether this is the event[idx] or the parameter[idx] depends on meta.groupBy.
 * @param idx   1-based.
 * @returns {[]}  of Strings
 */
FCS.prototype.getStringData = function(idx) {
    "use strict";
    if (this.dataAsStrings)
        return this.dataAsStrings[idx-1];
    else
        return null;
};


/**
 * Return an shallow copy object of a smallish subset of us
 * @param onlys[]   dot delimited Strings, e.g. 'meta' to get all of meta, 'text.$P1N' to get parameter 1 name
 * @returns {{}}    will be empty if onlys is empty
 */
FCS.prototype.getOnly = function(onlys) {
    "use strict";
    // if only one, force to an array...
    if (!Array.isArray(onlys))
        onlys = [onlys];
    var result = {};
    for (var i=0; i<onlys.length; i++) {
        var s = onlys[i].split('.',2);  // we only go 1 or 2 deep
        var s0 = s[0];
        if (s.length == 1) {  // copy everything
           result[s0] = this[s0];
        }
        else {
            if (!result[s0])
               result[s0] = {};
            result[s0][s[1]] = this[s0][s[1]];
        }
    }

    return result;
};



// here follow private methods


/**
 * Decides various parameters and methods based upon our options
 * @param databuf
 * @returns {{asNumber: boolean, asString: boolean, decimalsToPrint: number, bigSkip: number}}
 * @private
 */
FCS.prototype._prepareReadParameters = function (databuf) {
    "use strict";
    var isBE;
    if ('4,3,2,1' === this.text.$BYTEORD)
       isBE = true;
    else if ('1,2,3,4' === this.text.$BYTEORD)
        isBE = false;
    else
       throw 'cannot handle $BYTEORD= ' + this.text.$BYTEORD;

    var options = this.meta;

    var readParameters = {
        asNumber: (FCS.OPTION_VALUES.asNumber === options.dataFormat) || (FCS.OPTION_VALUES.asBoth === options.dataFormat),
        asString: (FCS.OPTION_VALUES.asString === options.dataFormat) || (FCS.OPTION_VALUES.asBoth === options.dataFormat),
        decimalsToPrint:  Number(options.decimalsToPrint || FCS.DEFAULT_VALUES.decimalsToPrint),
        bigSkip: 0
    };

    readParameters.eventsToRead = Number(options.eventsToRead || FCS.DEFAULT_VALUES.eventsToRead);
    if ((readParameters.eventsToRead <= 0) ||  (readParameters.eventsToRead> this.meta.eventCount))
        readParameters.eventsToRead = this.meta.eventCount;

    switch (this.text.$DATATYPE) {
        case 'D':
            readParameters.fn = isBE ? databuf.readDoubleBE : databuf.readDoubleLE;
            readParameters.bytes = 8;
            break;
        case 'F':
            readParameters.fn = isBE ? databuf.readFloatBE : databuf.readFloatLE;
            readParameters.bytes = 4;
            break;
        case 'I':
            var bits = Number(this.text['$P1B']);
            if (bits > 16) {
                readParameters.fn = isBE ? databuf.readUInt32BE : databuf.readUInt32LE;
                readParameters.bytes = 4;
            } else {
                readParameters.fn = isBE ? databuf.readUInt16BE : databuf.readUInt16LE;
                readParameters.bytes = 2;
            }
            break;
        default:  throw "oops";
    }

    readParameters.bytesPerEvent = readParameters.bytes * this.meta.$PAR;

    if (options.skip && (readParameters.eventsToRead < this.meta.eventCount)) {
        var events2Skip;
        if (isFinite(options.skip))
            events2Skip = options.skip;
        else {
            events2Skip = Math.floor(this.meta.eventCount / readParameters.eventsToRead) -1;
            this.meta.eventSkip = options.skip + " -> " + events2Skip;
        }
        readParameters.bigSkip = events2Skip * readParameters.bytesPerEvent;
    }

    return readParameters;
};


/**
 * Read data and group 1st by event (the natural order in the file)
 *
 * @param databuf  required
 * @param readParameters  optional
 * @returns {FCS}  for convenience
 */
FCS.prototype._readDataGroupByEvent = function (databuf, readParameters) {
    "use strict";

    // determine if these are ints, floats, etc...
    readParameters = readParameters || this._prepareReadParameters(databuf);

    var offset = Number(this.header.beginData);

    // local cache since heavily used
    var bytesPerMeasurement = readParameters.bytes;
    var databufReadFn = readParameters.fn;
    var eventsToRead = readParameters.eventsToRead;
    var numParams = Number(this.meta.$PAR);
    var decimalsToPrint = ('I' === this.text.$DATATYPE) ? -1 : readParameters.decimalsToPrint;

    var e = Number;
    var p = Number;
    var v = Number;

    var dataNumbers;
    if (readParameters.asNumber) {
        dataNumbers = new Array(eventsToRead);
        for (e = 0; e < eventsToRead; e++)
            dataNumbers[e] = new Array(numParams);
    }

    var dataStrings = readParameters.asString ? new Array(eventsToRead) : null;
    var eventString;

    // loop over each event
    for (e = 0; e < eventsToRead; e++) {

        if (dataStrings) {
            eventString = '[';
        }
        var dataE = dataNumbers ? dataNumbers[e] : null;  // efficiency

        // loop over each parameter
        for (p = 0; p < numParams; p++) {
            v = databufReadFn.call(databuf, offset);
            offset += bytesPerMeasurement;

            if (dataStrings) {
                if (p > 0)
                    eventString += ',';
                if (decimalsToPrint >= 0)
                    eventString += v.toFixed(decimalsToPrint);
                else
                    eventString += v;
            }

            if (dataE)
                dataE[p] = v;
        }

        if (dataStrings) {
            eventString += ']';
            dataStrings[e] = eventString;
        }

        offset += readParameters.bigSkip;
    }

    this.dataAsNumbers = dataNumbers;
    this.dataAsStrings = dataStrings;
    return this;
};


/**
 * Read data and group 1st by parameter
 *
 * @param databuf   required
 * @param readParameters   optional
 * @returns {FCS}   for convenience
 */
FCS.prototype._readDataGroupByParam = function (databuf, readParameters) {
    "use strict";

    readParameters = readParameters || this._prepareReadParameters(databuf);

    var offset = Number(this.header.beginData);

    // local cache since heavily used
    var bytesPerMeasurement = readParameters.bytes;
    var databufReadFn = readParameters.fn;
    var eventsToRead = readParameters.eventsToRead;
    var numParams = Number(this.meta.$PAR);
    var decimalsToPrint = ('I' === this.text.$DATATYPE) ? -1 : readParameters.decimalsToPrint;

    var maxPerLine = Number(this.meta.maxPerLine || FCS.DEFAULT_VALUES.maxPerLine);

    var e = Number;
    var p = Number;
    var v = Number;

    var dataArray;
    if (readParameters.asNumber) {
        dataArray = new Array(eventsToRead);
        for (e = 0; e < eventsToRead; e++)
            dataArray[e] = new Array(numParams);
    }
    var dataStrings;
    if (readParameters.asString) {
      dataStrings = [];
      for (p = 0; p < numParams; p++)
        dataStrings[p] = '[';
    }


    for (e = 0; e < eventsToRead; e++) {
        for (p = 0; p < numParams; p++) {
            v = databufReadFn.call(databuf, offset);
            offset += bytesPerMeasurement;
            if (dataArray)
                dataArray[p][e] = v;
            if (dataStrings) {
                if (e>0) {
                    dataStrings[p] += ',';
                    if ((e % maxPerLine) === 0)
                        dataStrings[p] += '\n';
                }

                if (decimalsToPrint >= 0)
                    dataStrings[p] += v.toFixed(decimalsToPrint);
                else
                    dataStrings[p] += v;
            }
        }

        offset += readParameters.bigSkip;
    }


    if (dataStrings) {
        for (p = 0; p < numParams; p++) {
            dataStrings[p] = dataStrings[p].substring(0, dataStrings[p].length - 1) + ']';
        }
    }

    this.dataAsNumbers = dataArray;
    this.dataAsStrings = dataStrings;

    return this;
};

/**
 * Read the header segment (the first 256 bytes)
 *
 * @param databuf   required
 * @param encoding  usually absent, defaults to utf8
 * @returns {} (see header variable for details)
 * @private
 */
FCS.prototype._readHeader = function(databuf, encoding) {
   "use strict";

    encoding = encoding || 'utf8';
    var fcsVersion = databuf.toString(encoding, 0, 6);
    if ('FCS' !== fcsVersion.substring(0, 3)) {
        throw 'Bad FCS Version: ' + fcsVersion;
    }

    var header = {
        FCSVersion : fcsVersion,
        beginText : Number(databuf.toString(encoding, 10, 18).trim()),
        endText : Number(databuf.toString(encoding, 18, 26).trim()),
        beginData : Number(databuf.toString(encoding, 26, 34).trim()),
        endData : Number(databuf.toString(encoding, 34, 42).trim()),
        beginAnalysis : Number(databuf.toString(encoding, 42, 50).trim()),
        endAnalysis : Number(databuf.toString(encoding, 50, 58).trim()),
    };

    return header;
};


/**
 * Reads the delimited key/value pairs of a TEXT or ANALYSIS segment
 * @param string   if falsy returns empty object
 * @returns {{}}
 */
FCS.prototype._readTextOrAnalysis = function(string) {
    "use strict";
    var result = {};

    if (!string)
       return result;

    var delim = string.charAt(0);
    
    if ('<' === delim) {  // Millipore puts in ANALYSIS as XML, don't try to split it up  (TODO use xml2js)
        result.asXML = string;
        return result;
    }

    // test for escaped delimiters
    var delim2 = delim + delim;
    var needToHandleEscapees = string.indexOf(delim2) > 0;
    var splits = string.split(delim);

    // messy code...
    if (needToHandleEscapees) {
        var corrected = ['',''];
        var ic = 0;
        var delimCount = 0;
        for (var is = 1; is <splits.length; is++) {
            var s = splits[is];
            if (s) {
               if (delimCount) {
                   while (delimCount > 0) {
                       corrected[ic] += delim;
                       delimCount -= 2; //  a '////' will give 3 blanks but only two // are desired
                   }

                   if (delimCount === 0)  // odd number is poorly defined, let's make do...
                       corrected[++ic] = s;
                   else
                       corrected[ic] += s;
                   delimCount = 0;
               }
                else
                   corrected[++ic] = s;
            }
            else {
                delimCount++;
            }
       }

        splits = corrected;
    }


    // If string ended with the delimiter, there's an extra empty value.  Remove it.
    var slenminus1 = splits.length-1;
    if (!splits[slenminus1])
       splits.length = slenminus1;

    // Grab all the key/value pairs.  Start at 1 cause split also added a blank field at the beginning
    for (var i = 1; i < splits.length; i += 2) {
        var key = splits[i].trim();  // Partec puts \n before analysis keywords
        var value = splits[i+1];
        result[key] = value;
    }

    return result;
};


FCS.prototype._readData = function(databuf, readParameters) {
    if (('H' === this.text.$MODE) || (FCS.OPTION_VALUES.asNone === this.meta.dataFormat))
        return this;

    readParameters = readParameters || this._prepareReadParameters(databuf);

    if (FCS.OPTION_VALUES.byParam === this.meta.groupBy)
        this._readDataGroupByParam(databuf, readParameters);
    else
        this._readDataGroupByEvent(databuf, readParameters);
    
    return this;
};


/**
 * FCS 3.0 added support for huge files, where the actual DATA segment may be described in the TEXT segment
 * Also sets meta.eventCount and meta.$PAR since they are used so often
 * 
 * @param inText
 * @private
 */
FCS.prototype._adjustHeaderBasedUponText = function(inText) {

    inText = inText || this.text;
    
    // update a few important meta.
    this.meta.eventCount = Number(inText['$TOT']);
    this.meta.$PAR =  Number(inText['$PAR']);

    // possibly adjust data and analysis headers for huge files
    if (this.header.beginData === 0) {
        this.header.beginData = Number(inText['$BEGINDATA']);
        this.header.endData = Number(inText['$ENDDATA']);
    }
    if (this.header.beginAnalysis === 0) {
        this.header.beginAnalysis = Number(inText['$BEGINANALYSIS'] || 0);
        this.header.endAnalysis = Number(inText['$ENDANALYSIS'] || 0);
    }

}



module.exports = FCS;


// under development below...


/**
 * First pass at code to read an FCS file asynchronously, shutting it down when we are done...
 * @param stream
 * @param moreOptions  may be null, must be present for spacing!
 * @param callback(err, this)
 */
FCS.prototype.readStreamAsync = function(stream, moreOptions, callback) {
    "use strict";
    
    // static usage is impossible currently, but in case we change the "classiness" in the future...
    if (!(this instanceof FCS)) {
        var fcs = new FCS();
        fcs.readStreamAsync(stream, moreOptions, callback);
    }

    // add any moreOptions,  meta is now "complete"
    this.options(moreOptions);
    
    var state = 'header';
    var encoding = this.meta.encoding || FCS.DEFAULT_VALUES.encoding;   
    var eventsNeeded = ('asNone' === this.meta.dataFormat) ? 0 :
                       this.meta.eventsToRead || FCS.DEFAULT_VALUES.eventsToRead;
    var isAnalysisThere = false;
    var isAnalysisSegmentBeforeData = false;
    
    var self = this;

    var bytesNeeded = 256;  // for the header
    var bytesRead = 0;
    var chunks = [];
    var readParameters;
    
    stream.on('data', function(chunk) {
        if ('done' === state)  // all done, just ignore...
            return;
        
        chunks.push(chunk);
        bytesRead += chunk.length;
        
        // console.log(bytesRead + " bytesRead\n");
        
        // may do multiple steps at once, hence while
        while (('done' !== state) && (bytesRead >= bytesNeeded)) {
            var buffer = Buffer.concat(chunks);
            chunks = [buffer];
            
            switch(state) {
                
                case 'header': self.header = self._readHeader(buffer);
                               bytesNeeded = self.header.endText;
                               state = 'text';
                               break;
                
                case 'text'  : var string = buffer.toString(encoding, self.header.beginText, self.header.endText);
                               self.text = self._readTextOrAnalysis(string);
                               self._adjustHeaderBasedUponText(self.text);
                               
                               // look at TEXT to figure out what next
                               isAnalysisThere = self.header.beginAnalysis > 0;
                               isAnalysisSegmentBeforeData = isAnalysisThere && 
                                                      (self.header.beginAnalysis < self.header.beginData)
                    
                               if (isAnalysisSegmentBeforeData) {
                                   state = 'analysis';
                                   bytesNeeded = self.header.endAnalysis;
                               }
                               else if (eventsNeeded > 0) {
                                   bytesNeeded = prepareForData(buffer);
                               }
                               else {
                                  allDone(true); 
                               }
                               break;
                
                case 'analysis': var string = buffer.toString(encoding, self.header.beginAnalysis, self.header.endAnalysis);
                                 self.analysis = self._readTextOrAnalysis(string);
                    
                                 if (isAnalysisSegmentBeforeData && (eventsNeeded > 0)) {
                                     bytesNeeded = prepareForData(buffer);
                                 }
                                 else {
                                     allDone(isAnalysisSegmentBeforeData);
                                 }
                               break;
                
                case 'data'   : self._readData(buffer, readParameters);
                    
                                if (isAnalysisThere && !isAnalysisSegmentBeforeData) { 
                                    state = 'analysis';
                                    bytesNeeded = self.header.endAnalysis;
                                }
                                else {
                                    allDone(true);
                                }
                               break;
            }
            
        }
    });

    stream.on('close', function(err) {
        if ('done' !== state)
           callback('closed', self);
    });
    
    stream.on('end', function(err) {
        if ('done' !== state)
           callback('end', self)
    });
    
    stream.on('error', function(err) {
        callback(err, self)
    });

    function prepareForData(buffer) {
        state = 'data';
        readParameters = self._prepareReadParameters(buffer);
        return eventsNeeded * (readParameters.bigSkip + readParameters.bytesPerEvent) +
            self.header.beginData;
    };
    
    
    function allDone(callDestroy, err) {
        state = 'done';
        
        // I'm not sure if all streams have a destroy() method
        if (callDestroy && ('function' === typeof(stream.destroy)))
           stream.destroy();
        
        callback(err, self);
    }
    
 
}