/**
 * Created by Morgan Conrad on 11/7/13.
 */

var hup = require('./library/hup');

/**
 * Constructor
 * @param options   options,  {}, optional argument
 * @param streamOrBuffer   if present, read it.  (Otherwise, call readFCS() later)
 * @constructor
 */
function FCS( /* optional */ options, streamOrBuffer) {
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
   this.dataAsStrings = this.dataAsNumbers = null;

   this.options(options);

   if (streamOrBuffer) {
       if (Buffer.isBuffer(streamOrBuffer))
           this.readBuffer(streamOrBuffer);
       else
           this.readStream(streamOrBuffer);
   }


    // override the toJSON() method
    this.toJSON = function() {
        var json = '{\r "meta": ';
        json += JSON.stringify(this.meta, null, 2);
        json += ',\r "header": ';
        json += JSON.stringify(this.header, null, 2);
        json += ',\r "text": ';
        json += JSON.stringify(this.text, null, 2);
        json += ',\r "data": \r';
        if (this.dataAsStrings) {
            // for clarity, an extra CRLF after groupByParam data
            var delim = (FCS.OPTION_VALUES.byParam === this.meta.groupBy) ? ',\r\r' : ',\r';
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

        json += '\r}';  // close
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

    var textSection = databuf.toString(encoding, this.header.beginText, this.header.endText);
    this.text = this._readTextOrAnalysis(textSection);

    // update a few important meta.
    this.meta.eventCount = Number(this.text['$TOT']);
    this.meta.$PAR =  Number(this.text['$PAR']);

    // possibly adjust data and analysis headers for huge files
    if (this.header.beginData === 0) {
        this.header.beginData = Number(this.text['$BEGINDATA']);
        this.header.endData = Number(this.text['$ENDDATA']);
    }
    if (this.header.beginAnalysis === 0) {
        this.header.beginAnalysis = Number(this.text['$BEGINANALYSIS'] || 0);
        this.header.endAnalysis = Number(this.text['$ENDANALYSIS'] || 0);
    }

    if (this.header.beginAnalysis) {
        var analysisSection = databuf.toString(encoding, this.header.beginAnalysis, this.header.endAnalysis);
        this.analysis = this._readTextOrAnalysis(analysisSection);
    }

    // TODO  supplemental text, e.g. $BEGINSTEXT, $ENDSTEXT

    if ('H' !== this.text.$MODE) {
        if (FCS.OPTION_VALUES.byParam === this.meta.groupBy)
            this._readDataGroupByParam(databuf);
        else
            this._readDataGroupByEvent(databuf);
    }

    return this;
};


/**
* Reads from a Stream.  Collects it all into a Buffer first.
*/
FCS.prototype.readStream = function(readableStream, callback) {

    var self = this;

    // temp
    var logit = function(x) {
        console.log(x);
    }

    var callbacks = {
       readable: logit,
       close: logit
    };

    var reader = new hup.ReadStreamToBuffer();
    reader.read(readableStream, function(buffer) {
        self.readBuffer(buffer, moreOptions);
        if (callback)
            callback(self);
    });
};

FCS.prototype.readStreamSync = function(readableStream) {
    var chunks = [];
    var chunk;

    while (null !== (chunk = readableStream.read())) {
        chunks.push(chunk);
    }

    var buffer = Buffer.concat(chunks);
    this.readBuffer(buffer);
}


// here follow the public "getters/accessor" methods

/**
 * Returns a single value from the TEXT section
 *    e.g.   text('$CYT') ->  'FACSort'
 * @param key     varargs
 * @returns {*}
 */
FCS.prototype.text = function(key /*...*/ ) {
    "use strict";
    var result = this.text[key];
    var idx = 0;
    while (!result && (++idx < arguments.length))
       result = this.text(arguments[idx]);

    return result;
};


/**
 * Returns an entire array of values from the text section,
 * The returned array has 1 based indexing
 *    e.g.   text('N') => [,'FSC-H','SSC-H','FL1-H', etc...]
 * @param x
 * @returns {Array}
 */
FCS.prototype.$PnX = function(x) {
    "use strict";
    var result = [];
    result[0] = null;
    for (var p=1; p<= this.meta.$PAR; p++)
       result[p] = this.text('$P' + p + x);

    return result;
};


/**
 * Returns numeric data if it was collected   (i.e. meta.dataFormat was asNumber or asBoth)
 * Whether this is the event[idx] or the parameter[idx] depends on meta.groupBy.
 * @param idx   1-based.
 * @returns {[]} of Numbers
 */
FCS.prototype.numericData = function(idx) {
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
FCS.prototype.stringData = function(idx) {
    "use strict";
    if (this.dataAsStrings)
        return this.dataAsStrings[idx-1];
    else
        return null;
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
    var isBE = '4,3,2,1' === this.text.$BYTEORD;
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

    if (options.skip && (readParameters.eventsToRead < this.meta.eventCount)) {
        var events2Skip;
        if (isFinite(options.skip))
            events2Skip = options.skip;
        else {
            events2Skip = Math.floor(this.meta.eventCount / readParameters.eventsToRead) -1;
            this.meta.eventSkip = options.skip + " -> " + events2Skip;
        }
        readParameters.bigSkip = events2Skip * readParameters.bytes * this.meta.$PAR;
    }

    return readParameters;
};


/**
 * Read data and group 1st by event (the natural order in the file)
 *
 * @param databuf  required
 * @param options  optional
 * @returns {FCS}  for convenience
 */
FCS.prototype._readDataGroupByEvent = function (databuf) {
    "use strict";

    this.dataAsNumbers = this.dataAsStrings = null;
   // var options = this.meta;
    if (FCS.OPTION_VALUES.asNone === this.meta.dataFormat) {
        return this;
    }

    // determine if these are ints, floats, etc...
    var readParameters = this._prepareReadParameters(databuf);

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
 * @param options   optional
 * @returns {FCS}   for convenience
 */
FCS.prototype._readDataGroupByParam = function (databuf) {
    "use strict";

    // clear old values
    this.dataAsNumbers = this.dataAsStrings = null;

    if (FCS.OPTION_VALUES.asNone === this.meta.dataFormat)
       return this;

    var readParameters = this._prepareReadParameters(databuf);

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
                        dataStrings[p] += '\r';
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
 * Read the header section (the first 256 bytes)
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
 * Reads the delimited key/value pairs of a TEXT or ANALYSIS section
 * @param string   if falsy returns empty object
 * @returns {{}}
 */
FCS.prototype._readTextOrAnalysis = function(string) {
    "use strict";
    var result = {};

    if (!string)
       return result;

    var delim = string.charAt(0);

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
        var key = splits[i];
        var value = splits[i+1];
        result[key] = value;
    }

    return result;
};


/**
 * This static utility function probably belongs somewhere else
 * @see http://stackoverflow.com/questions/14269233/node-js-how-to-read-a-stream-into-a-buffer
 */


function readStreamFully(readableStream, callback, options) {
    "use strict";

    options = options || {};

    var bufs =[];

    readableStream.on()
}


module.exports = FCS;
